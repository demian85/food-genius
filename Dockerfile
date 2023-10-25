
FROM node:18
RUN mkdir -p /opt/app
WORKDIR /opt/app
COPY package.json package-lock.json tsconfig.json ./
COPY src/ ./src
RUN npm install && npm run build
# EXPOSE 3000
CMD [ "npm", "start"]