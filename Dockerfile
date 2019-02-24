FROM node:10

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# ONBUILD
ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
COPY package.json /usr/src/app/
RUN npm install && npm cache clean --force
COPY . /usr/src/app

CMD [ "npm", "start" ]