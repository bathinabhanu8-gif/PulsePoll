# PulsePoll

A live poll application built with React, Go/Gin, MongoDB and Redis. Create an account, publish a poll, send its link, vote, and watch the results update across connected browsers.

## Architecture

- `frontend/`: React/Vite UI and an EventSource client. Vite proxies `/api` to Go during development.
- `backend/`: Gin API. MongoDB stores accounts, polls and one vote document per voter and poll. A unique index blocks duplicate votes for the same browser identity. Passwords are hashed with bcrypt. Signed, expiring bearer tokens protect creation and owner actions.
- Redis increments live vote counters and publishes per-poll notifications. Go SSE subscribers receive those notifications and fetch the authoritative updated poll from MongoDB. MongoDB remains the durable source on reconnect, Redis provides low latency live fanout. A browser that reconnects fetches the current poll again.

## Run locally (Windows CMD)

1. Extract this ZIP into `C:\PulsePoll`. The archive has no credentials. Preserve your existing private `C:\PulsePoll\backend\.env`; if it is missing, copy `backend\.env.example` to `.env` and set your MongoDB Atlas and Redis Cloud details.
2. Add `AUTH_SECRET=` to the existing backend `.env` with a private random value of **at least 32 characters**. Do not commit `.env`. To generate one in CMD, run this **once**:

   ```cmd
   powershell -NoProfile -Command "Add-Content -Path 'C:\PulsePoll\backend\.env' -Value ('AUTH_SECRET=' + [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))"
   ```

3. In one CMD window:

   ```cmd
   cd /d C:\PulsePoll\backend
   go run .
   ```

4. In another CMD window:

   ```cmd
   cd /d C:\PulsePoll\frontend
   npm install
   npm run dev
   ```

5. Visit `http://localhost:5173`. Create an account and a poll; open its share link in two different browsers. Vote in one and observe the other update without refresh.

If port 8081 is occupied, stop the previous Go backend before starting the new one. The production service should set `GIN_MODE=release`.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /api/auth/signup`, `/api/auth/login` | Public | Register / sign in |
| `GET /api/polls/:id` | Public | Poll and durable counts |
| `GET /api/polls/:id/events` | Public | Server Sent Events |
| `POST /api/polls/:id/votes` | Public | Cast one vote per browser identity |
| `GET /api/polls`, `POST /api/polls` | Signed in | List / create owned polls |
| `PATCH /api/polls/:id/close` | Owner | Close voting |

## Decisions and limits

A random browser ID is stored locally for duplicate vote prevention. Clearing browser storage or changing device permits another vote; this is a deliberate usability compromise for anonymous audience voting, and it is **not identity proof**. A production election would require authenticated voters and transactional vote counting. A free Redis plan may discard cached counters, while MongoDB remains the durable count source. The deployment target must keep Go running with MongoDB and Redis environment variables; a static frontend alone will not work. For a single-service deployment, run `npm run build` in `frontend/`, set `FRONTEND_DIST` to the absolute path of `frontend/dist`, and deploy the Go service with its environment variables. Go will serve React and the API from one origin. For separate deployments, proxy `/api` to Go. The starter project was checked as source but the final Go binary must be compiled and tested on a machine with Go and the configured services.

## Submission checklist

- Test signup, login, creation, share, duplicate vote, live update in two browser sessions, close action, and mobile layout.
- Deploy frontend and Go API to a publicly reachable HTTPS URL and verify the whole flow on that URL.
- Push source to a public GitHub repository; check `git status` and ensure `.env` is not staged.
- Record the required **3–5 minute video**: demo the flow, explain the hardest challenge and how it was solved, and honestly describe AI assistance.
- Send the public GitHub link, live link and video link to the address in the challenge PDF.
