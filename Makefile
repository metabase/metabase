IMAGE_TAG := herpiko/metabase:$(shell date +%Y%m%d-%H%M)

.PHONY: build push

build:
	docker buildx build --platform linux/amd64 -t $(IMAGE_TAG) --load .

push:
	docker push $(IMAGE_TAG)
