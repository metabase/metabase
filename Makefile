
build:
	docker build -t marktheunissen/metabase .

run:
	docker run --rm -p 3000:3000 --name metabase marktheunissen/metabase

.PHONY: build run
