package config

import (
	"context"
	"errors"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

func ConnectRedis() (*redis.Client, error) {
	addr := os.Getenv("REDIS_ADDR")
	password := os.Getenv("REDIS_PASSWORD")
	username := os.Getenv("REDIS_USERNAME")

	if addr == "" || password == "" {
		return nil, errors.New("Redis address or password is missing")
	}

	if username == "" {
		username = "default"
	}

	client := redis.NewClient(&redis.Options{
		Addr:         addr,
		Username:     username,
		Password:     password,
		DialTimeout:  10 * time.Second,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, errors.New(
			"Redis connection failed: check endpoint, password, and connection settings",
		)
	}

	return client, nil
}