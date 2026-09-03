# syntax=docker/dockerfile:1

# --- Build stage: install every dependency and compile TypeScript ----------
FROM node:24-alpine AS build

WORKDIR /app

# Copy manifests first so the dependency layer is cached independently of src.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies so only runtime packages are copied forward.
RUN npm prune --omit=dev


# --- Runtime stage: compiled output plus production dependencies only ------
FROM node:24-alpine AS runtime

# tini forwards signals and reaps orphans. Without an init, node is PID 1,
# and the kernel does not apply the default action for signals a PID 1 process
# has not handled -- main.ts installs no SIGTERM listener, so `docker stop`
# would stall for its full timeout and then SIGKILL the worker mid-pass.
RUN apk add --no-cache tini

ENV NODE_ENV=production

WORKDIR /app

# node:alpine ships an unprivileged `node` user; run as it rather than root.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

# Declared last so a version bump does not invalidate the layers above.
ARG VERSION=dev
LABEL org.opencontainers.image.title="google-web-index-api" \
      org.opencontainers.image.description="Submits sitemap URLs to the Google Indexing API on a schedule, skipping pages that are already indexed." \
      org.opencontainers.image.source="https://github.com/myagizmaktav/google-web-index-api-docker" \
      org.opencontainers.image.licenses="GPL-3.0" \
      org.opencontainers.image.version="${VERSION}"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server/main.js"]
