package api

import (
 "context"
 "crypto/hmac"
 "crypto/sha256"
 "encoding/base64"
 "encoding/hex"
 "encoding/json"
 "errors"
 "fmt"
 "os"
 "strconv"
 "strings"
 "time"

 "github.com/gin-gonic/gin"
 "github.com/redis/go-redis/v9"
 "go.mongodb.org/mongo-driver/v2/bson"
 "go.mongodb.org/mongo-driver/v2/mongo"
 "go.mongodb.org/mongo-driver/v2/mongo/options"
 "golang.org/x/crypto/bcrypt"
)

type Server struct { db *mongo.Database;
 redis *redis.Client;
 secret []byte }
type User struct { ID bson.ObjectID `bson:"_id,omitempty" json:"id"`;
 Name string `bson:"name" json:"name"`;
 Email string `bson:"email" json:"email"`;
 Password string `bson:"password" json:"-"` }
type Option struct { Text string `bson:"text" json:"text"`;
 Votes int64 `bson:"votes" json:"votes"` }
type Poll struct { ID bson.ObjectID `bson:"_id,omitempty" json:"id"`;
 OwnerID bson.ObjectID `bson:"ownerId" json:"-"`;
 Title string `bson:"title" json:"title"`;
 Description string `bson:"description" json:"description"`;
 Options []Option `bson:"options" json:"options"`;
 Closed bool `bson:"closed" json:"closed"`;
 CreatedAt time.Time `bson:"createdAt" json:"createdAt"` }
type Vote struct { ID bson.ObjectID `bson:"_id,omitempty"`;
 PollID bson.ObjectID `bson:"pollId"`;
 Voter string `bson:"voter"`;
 Option int `bson:"option"`;
 CreatedAt time.Time `bson:"createdAt"` }

func New(db *mongo.Database, r *redis.Client) (*Server,error) {
 key:=os.Getenv("AUTH_SECRET");
 if len(key)<32 { return nil,errors.New("AUTH_SECRET must have at least 32 characters") }
 s:=&Server{db:db,redis:r,secret:[]byte(key)}
 ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);
 defer cancel()
 _,err:=db.Collection("users").Indexes().CreateOne(ctx,mongo.IndexModel{Keys:bson.D{{Key:"email",Value:1}},Options:options.Index().SetUnique(true)});
 if err!=nil{return nil,err}
 _,err=db.Collection("votes").Indexes().CreateOne(ctx,mongo.IndexModel{Keys:bson.D{{Key:"pollId",Value:1},{Key:"voter",Value:1}},Options:options.Index().SetUnique(true)});
 return s,err
}
func (s *Server) Register(r *gin.Engine) {
 a:=r.Group("/api")
 a.GET("/health",func(c *gin.Context){c.JSON(200,gin.H{"status":"ok","service":"PulsePoll API"})})
 a.POST("/auth/signup",s.limit("signup",8,time.Hour),s.signup);
 a.POST("/auth/login",s.limit("login",20,time.Hour),s.login)
 a.GET("/polls/:id",s.poll);
 a.POST("/polls/:id/votes",s.limit("vote",60,time.Hour),s.vote);
 a.GET("/polls/:id/events",s.events)
 protected:=a.Group("");
 protected.Use(s.auth);
 protected.GET("/polls",s.mine);
 protected.POST("/polls",s.create);
 protected.PATCH("/polls/:id/close",s.close)
}
func(s *Server) limit(bucket string, maximum int64, window time.Duration) gin.HandlerFunc {return func(c *gin.Context){
 ip:=sha256.Sum256([]byte(c.ClientIP()));
key:="rate:"+bucket+":"+hex.EncodeToString(ip[:]);
count,err:=s.redis.Incr(c.Request.Context(),key).Result();
if err!=nil{fail(c,503,"Please try again shortly");
c.Abort();
return};
if count==1{s.redis.Expire(c.Request.Context(),key,window)};
if count>maximum{fail(c,429,"Too many requests. Please try again later");
c.Abort();
return};
c.Next()
}}
func fail(c *gin.Context,status int,message string){c.JSON(status,gin.H{"error":message})}
func id(c *gin.Context)(bson.ObjectID,error){return bson.ObjectIDFromHex(c.Param("id"))}
func (s *Server) token(id bson.ObjectID) string { payload:=id.Hex()+"."+strconv.FormatInt(time.Now().Add(7*24*time.Hour).Unix(),10);
 mac:=hmac.New(sha256.New,s.secret);
 mac.Write([]byte(payload));
 return base64.RawURLEncoding.EncodeToString([]byte(payload))+"."+hex.EncodeToString(mac.Sum(nil)) }
func (s *Server) verify(value string)(bson.ObjectID,error){
 parts:=strings.Split(value,".");
 if len(parts)!=2{return bson.NilObjectID,errors.New("invalid token")}
 bytes,err:=base64.RawURLEncoding.DecodeString(parts[0]);
 if err!=nil{return bson.NilObjectID,err};
 payload:=string(bytes);
 mac:=hmac.New(sha256.New,s.secret);
mac.Write(bytes);
 signature,err:=hex.DecodeString(parts[1]);
if err!=nil||!hmac.Equal(signature,mac.Sum(nil)){return bson.NilObjectID,errors.New("invalid signature")}
 fields:=strings.Split(payload,".");
if len(fields)!=2{return bson.NilObjectID,errors.New("invalid payload")};
expiry,err:=strconv.ParseInt(fields[1],10,64);
if err!=nil||time.Now().Unix()>expiry{return bson.NilObjectID,errors.New("expired token")};
return bson.ObjectIDFromHex(fields[0])
}
func(s *Server) auth(c *gin.Context){header:=strings.TrimPrefix(c.GetHeader("Authorization"),"Bearer ");
u,err:=s.verify(header);
if err!=nil{fail(c,401,"Please sign in again");
c.Abort();
return};
c.Set("userID",u);
c.Next()}
func(s *Server) signup(c *gin.Context){var in struct{Name string `json:"name"`;
Email string `json:"email"`;
Password string `json:"password"`};
if c.ShouldBindJSON(&in)!=nil{fail(c,400,"Invalid signup data");
return};
in.Name=strings.TrimSpace(in.Name);
in.Email=strings.ToLower(strings.TrimSpace(in.Email));
if len(in.Name)<2||len(in.Name)>70||!strings.Contains(in.Email,"@")||len(in.Email)>254||len(in.Password)<8||len(in.Password)>72{fail(c,400,"Enter a name, valid email and password of 8–72 characters");
return};
hash,err:=bcrypt.GenerateFromPassword([]byte(in.Password),bcrypt.DefaultCost);
if err!=nil{fail(c,500,"Could not create account");
return};
user:=User{ID:bson.NewObjectID(),Name:in.Name,Email:in.Email,Password:string(hash)};
_,err=s.db.Collection("users").InsertOne(c.Request.Context(),user);
if mongo.IsDuplicateKeyError(err){fail(c,409,"Email already registered");
return};
if err!=nil{fail(c,500,"Could not create account");
return};
c.JSON(201,gin.H{"token":s.token(user.ID),"user":user})}
func(s *Server) login(c *gin.Context){var in struct{Email string `json:"email"`;
Password string `json:"password"`};
if c.ShouldBindJSON(&in)!=nil{fail(c,400,"Invalid login data");
return};
var user User;
err:=s.db.Collection("users").FindOne(c.Request.Context(),bson.M{"email":strings.ToLower(strings.TrimSpace(in.Email))}).Decode(&user);
if err!=nil||bcrypt.CompareHashAndPassword([]byte(user.Password),[]byte(in.Password))!=nil{fail(c,401,"Incorrect email or password");
return};
c.JSON(200,gin.H{"token":s.token(user.ID),"user":user})}
func(s *Server) create(c *gin.Context){var in struct{Title string `json:"title"`;
Description string `json:"description"`;
Options []string `json:"options"`};
if c.ShouldBindJSON(&in)!=nil{fail(c,400,"Invalid poll data");
return};
in.Title=strings.TrimSpace(in.Title);
in.Description=strings.TrimSpace(in.Description);
if len(in.Title)<5||len(in.Title)>160||len(in.Description)>500||len(in.Options)<2||len(in.Options)>8{fail(c,400,"Title must be 5–160 characters and there must be 2–8 options");
return};
seen:=map[string]bool{};
poll:=Poll{ID:bson.NewObjectID(),OwnerID:c.MustGet("userID").(bson.ObjectID),Title:in.Title,Description:in.Description,CreatedAt:time.Now().UTC(),Options:[]Option{}};
for _,v:=range in.Options{v=strings.TrimSpace(v);
k:=strings.ToLower(v);
if len(v)<1||len(v)>100||seen[k]{fail(c,400,"Options must be unique and 1–100 characters");
return};
seen[k]=true;
poll.Options=append(poll.Options,Option{Text:v})};
if _,err:=s.db.Collection("polls").InsertOne(c.Request.Context(),poll);
err!=nil{fail(c,500,"Could not create poll");
return};
c.JSON(201,poll)}
func(s *Server) mine(c *gin.Context){cursor,err:=s.db.Collection("polls").Find(c.Request.Context(),bson.M{"ownerId":c.MustGet("userID")},options.Find().SetSort(bson.D{{Key:"createdAt",Value:-1}}).SetLimit(100));
if err!=nil{fail(c,500,"Could not load polls");
return};
defer cursor.Close(c.Request.Context());
polls:=[]Poll{};
if err=cursor.All(c.Request.Context(),&polls);
err!=nil{fail(c,500,"Could not load polls");
return};
c.JSON(200,polls)}
func(s *Server) get(ctx context.Context,pid bson.ObjectID)(Poll,error){var p Poll;
err:=s.db.Collection("polls").FindOne(ctx,bson.M{"_id":pid}).Decode(&p);
return p,err}
func(s *Server) poll(c *gin.Context){pid,err:=id(c);
if err!=nil{fail(c,400,"Invalid poll link");
return};
p,err:=s.get(c.Request.Context(),pid);
if err!=nil{fail(c,404,"Poll not found");
return};
c.JSON(200,p)}
func(s *Server) close(c *gin.Context){pid,err:=id(c);
if err!=nil{fail(c,400,"Invalid poll link");
return};
res,err:=s.db.Collection("polls").UpdateOne(c.Request.Context(),bson.M{"_id":pid,"ownerId":c.MustGet("userID")},bson.M{"$set":bson.M{"closed":true}});
if err!=nil{fail(c,500,"Could not close poll");
return};
if res.MatchedCount==0{fail(c,404,"Poll not found or not yours");
return};
s.redis.Publish(c.Request.Context(),"poll:"+pid.Hex(),"closed");
c.JSON(200,gin.H{"closed":true})}
func(s *Server) vote(c *gin.Context){pid,err:=id(c);
if err!=nil{fail(c,400,"Invalid poll link");
return};
var in struct{Option int `json:"option"`;
Voter string `json:"voter"`};
if c.ShouldBindJSON(&in)!=nil||len(in.Voter)<20||len(in.Voter)>100{fail(c,400,"Invalid vote");
return};
p,err:=s.get(c.Request.Context(),pid);
if err!=nil{fail(c,404,"Poll not found");
return};
if p.Closed{fail(c,409,"This poll is closed");
return};
if in.Option<0||in.Option>=len(p.Options){fail(c,400,"Choose a valid option");
return};
voterHash:=sha256.Sum256([]byte(in.Voter));
voter:=hex.EncodeToString(voterHash[:]);
v:=Vote{ID:bson.NewObjectID(),PollID:pid,Voter:voter,Option:in.Option,CreatedAt:time.Now().UTC()};
_,err=s.db.Collection("votes").InsertOne(c.Request.Context(),v);
if mongo.IsDuplicateKeyError(err){fail(c,409,"You have already voted on this device");
return};
if err!=nil{fail(c,500,"Could not save vote");
return}
 field:=fmt.Sprintf("options.%d.votes",in.Option);
res,err:=s.db.Collection("polls").UpdateOne(c.Request.Context(),bson.M{"_id":pid,"closed":false},bson.M{"$inc":bson.M{field:1}});
if err!=nil||res.MatchedCount==0{_,_=s.db.Collection("votes").DeleteOne(c.Request.Context(),bson.M{"_id":v.ID});
fail(c,409,"Poll closed while voting; please refresh");
return}
 // Redis carries the live counter and distributes refresh notifications across instances.
 key:="counts:"+pid.Hex();
s.redis.HIncrBy(c.Request.Context(),key,strconv.Itoa(in.Option),1);
s.redis.Expire(c.Request.Context(),key,7*24*time.Hour);
s.redis.Publish(c.Request.Context(),"poll:"+pid.Hex(),"vote");
c.JSON(201,gin.H{"ok":true})
}
func(s *Server) events(c *gin.Context){pid,err:=id(c);
if err!=nil{fail(c,400,"Invalid poll link");
return};
if _,err=s.get(c.Request.Context(),pid);
err!=nil{fail(c,404,"Poll not found");
return};
pub:=s.redis.Subscribe(c.Request.Context(),"poll:"+pid.Hex());
defer pub.Close();
ctx:=c.Request.Context();
if _,err=pub.Receive(ctx);
err!=nil{fail(c,503,"Live updates unavailable");
return};
c.Header("Content-Type","text/event-stream");
c.Header("Cache-Control","no-cache");
c.Header("X-Accel-Buffering","no");
c.Writer.WriteHeader(200);
c.Writer.Flush();
channel:=pub.Channel();
tick:=time.NewTicker(20*time.Second);
defer tick.Stop();
for {select{case <-ctx.Done():return;
case <-channel: p,e:=s.get(ctx,pid);
if e!=nil{return};
raw,_:=json.Marshal(p);
fmt.Fprintf(c.Writer,"event: poll\ndata: %s\n\n",raw);
c.Writer.Flush();
case <-tick.C:fmt.Fprint(c.Writer,": keepalive\n\n");
c.Writer.Flush()}}}
