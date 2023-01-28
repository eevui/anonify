FROM node:19-alpine

RUN apk --update add redis

WORKDIR /app

ENV PORT=3000

EXPOSE $PORT

VOLUME /var/lib/redis

COPY package.json package-lock.json ./

RUN npm install

COPY docker-entrypoint.sh .

COPY src/ ./src

ENTRYPOINT ["/app/docker-entrypoint.sh"]
