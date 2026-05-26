FROM node:20-alpine
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
COPY dispatcher/package.json ./dispatcher/
COPY worker/package.json ./worker/
COPY shared/package.json ./shared/
RUN yarn install
COPY . .
WORKDIR /app/dispatcher
CMD ["yarn", "dev"]
