package config

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

func ConnectMongo() (*mongo.Client, error) {
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		return nil, errors.New("MONGO_URI is missing")
	}

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, errors.New("invalid MongoDB configuration")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		cleanupCtx, cleanupCancel := context.WithTimeout(
			context.Background(), 5*time.Second,
		)
		_ = client.Disconnect(cleanupCtx)
		cleanupCancel()

		message := strings.ToLower(err.Error())

		switch {
		case strings.Contains(message, "authentication"),
			strings.Contains(message, "authenticate"):
			return nil, errors.New(
				"MongoDB: database username or password rejected",
			)

		case strings.Contains(message, "no such host"),
			strings.Contains(message, "dns"):
			return nil, errors.New(
				"MongoDB: DNS lookup failed",
			)

		case strings.Contains(message, "tls"),
			strings.Contains(message, "certificate"):
			return nil, errors.New(
				"MongoDB: TLS or certificate connection failed",
			)

		default:
			return nil, errors.New(
				"MongoDB: server unreachable; check cluster status, network access, or firewall",
			)
		}
	}

	return client, nil
}