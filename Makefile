IMAGE_TAG := herpiko/metabase:$(shell date +%Y%m%d-%H%M)

# Local app DB (Postgres in ../metabase-db) connection settings
MB_DB_ENV := MB_DB_TYPE=postgres MB_DB_HOST=127.0.0.1 MB_DB_PORT=5432 MB_DB_DBNAME=metabaseappdb MB_DB_USER=metabase MB_DB_PASS=D4taJay4jaya

.PHONY: build push run

build:
	docker buildx build --no-cache --platform linux/amd64 -t $(IMAGE_TAG) --load .

push:
	docker push $(IMAGE_TAG)

# Run backend + frontend (+ cljs + static-viz) all with hot reload, against the
# local Postgres app DB, with the :drivers alias so BigQuery (and other drivers)
# load. App is served at http://localhost:3000
run:
	bun install && bun run clean-dev:cljs && \
	$(MB_DB_ENV) ENABLE_CLJS_HOT_RELOAD=true ./node_modules/.bin/concurrently -n 'backend,frontend,cljs,static-viz' -c 'blue,green,yellow,cyan' \
		'clojure -M:run:dev:dev-start:drivers --hot' \
		'bun run build-hot:js-wait' \
		'bun run build-hot:cljs' \
		'bun run build-static-viz:watch-wait'
