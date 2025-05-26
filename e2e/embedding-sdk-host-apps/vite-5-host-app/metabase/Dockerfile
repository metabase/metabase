FROM metabase/metabase-enterprise:v1.54.x

COPY ./metabase /app/
COPY ./local-dist /app/local-dist

RUN if [ -f ./app/local-dist/metabase.jar ]; then \
      echo "Local metabase.jar is found in ./app/local-dist, running it..."; \
      cp ./app/local-dist/metabase.jar /app/metabase.jar; \
    else \
      echo "Local metabase.jar is not found in ./app/local-dist, skipping copy"; \
    fi
