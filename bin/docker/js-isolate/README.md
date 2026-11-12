# GraalJS isolate for the Alpine image

Static-viz runs chart JavaScript in a GraalVM polyglot isolate (`libpolyglotisolate.so`). The upstream library is built against glibc, but the Docker image is Alpine (musl), so `Dockerfile` here builds it against musl. It's published as `metabase/graaljs-musl:<graalvm version>` by `.github/workflows/js-isolate.yml`. The Metabase image copies it into `/app/js-isolate`, and `metabase.core.bootstrap` points Truffle at it.

The image also ships Truffle's `libtruffleattach` in `/app/truffle-attach`, so static-viz works when `$HOME` isn't writable (non-root UID, read-only root filesystem). Outside the image, use `-Dpolyglot.engine.userResourceCache=<writable dir>` instead.

## When you bump GraalVM

The isolate must match the GraalVM version in `deps.edn`: a mismatch can crash the JVM.

1. Update `GRAAL_VERSION` in `Dockerfile`, plus the pinned GraalVM CE and Temurin static-libs downloads and their checksums.
2. Publish: `gh workflow run js-isolate.yml --ref <branch> -f push=true`.
3. Pin `JS_ISOLATE_IMAGE` in `bin/docker/Dockerfile` and `Dockerfile` to the digest printed in the workflow summary.

## Build locally

`native-image` can't cross-compile and needs about 8 GB of memory:

```
docker buildx build --load --platform linux/amd64 -t graaljs-musl:local bin/docker/js-isolate
cp target/uberjar/metabase.jar bin/docker/
docker build --build-arg JS_ISOLATE_IMAGE=graaljs-musl:local -t metabase:local bin/docker
```
