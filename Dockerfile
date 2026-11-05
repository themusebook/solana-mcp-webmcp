FROM node:26-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY tsconfig.json ./
COPY lib ./lib
COPY server ./server
COPY public ./public
RUN pnpm build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
COPY --from=build /app/build ./build
COPY public ./public
EXPOSE 8080
CMD ["node", "build/server/index.js"]
