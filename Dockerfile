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

ENV NODE_ENV=production

WORKDIR /app

# node:alpine ships an unprivileged `node` user; run as it rather than root.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

CMD ["node", "dist/server/main.js"]
