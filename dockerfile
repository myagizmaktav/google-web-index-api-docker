FROM bitnami/node:20.11.1-debian-12-r2
WORKDIR /app
COPY . .
RUN npm install && find . -name ".env" -type f -exec rm {} + 
CMD ["npm", "start"]