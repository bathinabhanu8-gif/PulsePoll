package main

import (
	"context"
	"log"
	"os"
 "path/filepath"
 "strings"
	"time"

	"pulsepoll/backend/config"
 "pulsepoll/backend/internal/api"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	mongoClient, err := config.ConnectMongo()
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = mongoClient.Disconnect(ctx)
	}()

	log.Println("MongoDB connected successfully")

	redisClient, err := config.ConnectRedis()
	if err != nil {
		log.Fatal(err)
	}
	defer redisClient.Close()

	log.Println("Redis connected successfully")

	router := gin.Default()
	if err := router.SetTrustedProxies(nil); err != nil {
		log.Fatal(err)
	}

	server, err := api.New(mongoClient.Database(os.Getenv("MONGO_DB")), redisClient)
 if err != nil { log.Fatal(err) }
 server.Register(router)
 if dist := os.Getenv("FRONTEND_DIST"); dist != "" {
  router.Static("/assets", filepath.Join(dist, "assets"))
  router.NoRoute(func(c *gin.Context) {
   if strings.HasPrefix(c.Request.URL.Path, "/api/") { c.JSON(404, gin.H{"error":"API route not found"}); return }
   if c.Request.URL.Path == "/favicon.svg" { c.File(filepath.Join(dist,"favicon.svg")); return }
   c.File(filepath.Join(dist,"index.html"))
  })
 }

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	log.Fatal(router.Run(":" + port))
}