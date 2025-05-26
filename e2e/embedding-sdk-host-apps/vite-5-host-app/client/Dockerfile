FROM node:22-bullseye AS runner

ARG WATCH=false
ENV WATCH=${WATCH}

ARG VITE_METABASE_INSTANCE_URL
ENV VITE_METABASE_INSTANCE_URL=${VITE_METABASE_INSTANCE_URL}

ARG VITE_METABASE_EMBEDDING_API_KEY
ENV VITE_METABASE_EMBEDDING_API_KEY=${VITE_METABASE_EMBEDDING_API_KEY}

WORKDIR /app

COPY ./client ./client
COPY ./local-dist ./local-dist

WORKDIR /app/client

RUN npm ci

RUN if [ -d "../local-dist/embedding-sdk" ]; then \
      echo "Local embedding-sdk dist is found in ../local-dist/embedding-sdk, installing it..."; \
      npm install file:../local-dist/embedding-sdk --install-links; \
    else \
      echo "Local embedding-sdk dist is not found in ../local-dist/embedding-sdk, skipping copy"; \
    fi

RUN if [ "$WATCH" != "true" ]; then \
      echo "WATCH env is not set; running production yarn build..."; \
      npx vite build; \
    else \
      echo "WATCH env is set; running in development mode..."; \
    fi

ENTRYPOINT ["/app/client/entrypoint.sh"]
