FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.mjs backup.mjs seed.json ./
COPY --chown=node:node public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/recruider.sqlite
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.mjs"]
