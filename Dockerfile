FROM node:10-alpine
ENV CI true

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production --quiet --no-fund

COPY . .

EXPOSE 9000
CMD [ "npm", "start" ]