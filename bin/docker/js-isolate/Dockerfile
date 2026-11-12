# syntax=docker/dockerfile:1
#
# Builds the GraalJS polyglot isolate (libpolyglotisolate.so) against musl for the Alpine image. See README.md.

# Must equal the org.graalvm.polyglot/* versions in deps.edn
ARG GRAAL_VERSION=25.1.3

FROM debian:bookworm-slim AS build

ARG GRAAL_VERSION
# GraalVM CE release for this Truffle version (graal-25.1.3, JDK 25.0.3+9)
ARG GRAALVM_JDK_VERSION=25.0.3
ARG GRAALVM_SHA256_AMD64=e9cd1637be853e105f8b09125b4b19fbce385696465d782cbca8bb80e1df8f0d
ARG GRAALVM_SHA256_ARM64=5e79978983439d28506ebef82254fe9f98995121208dc8be77c604f4ad5bc579
# GraalVM CE ships musl static JDK libraries only for amd64; on arm64 use Temurin's for the same JDK
ARG TEMURIN_STATIC_LIBS_VERSION=25.0.3+9
ARG TEMURIN_STATIC_LIBS_SHA256_ARM64=87777d29ab906d2b718355ecc6b50277ee3b77e4dae282320d54cc03b20b4718
ARG ZLIB_VERSION=1.3.1
ARG ZLIB_SHA256=9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23

RUN apt-get update \
    && apt-get install -y --no-install-recommends binutils ca-certificates curl gcc libc6-dev make musl-tools \
    && rm -rf /var/lib/apt/lists/*

RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) arch=x64;     sha256="$GRAALVM_SHA256_AMD64" ;; \
      arm64) arch=aarch64; sha256="$GRAALVM_SHA256_ARM64" ;; \
      *) echo "unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/graalvm.tar.gz \
      "https://github.com/graalvm/graalvm-ce-builds/releases/download/graal-${GRAAL_VERSION}/graalvm-community-jdk-25i1-${GRAALVM_JDK_VERSION}_linux-${arch}_bin.tar.gz"; \
    echo "$sha256  /tmp/graalvm.tar.gz" | sha256sum -c -; \
    mkdir -p /opt/graalvm; \
    tar xzf /tmp/graalvm.tar.gz --strip-components=1 -C /opt/graalvm; \
    rm /tmp/graalvm.tar.gz

RUN set -eu; \
    if [ "$(dpkg --print-architecture)" = arm64 ]; then \
      version_=$(echo "$TEMURIN_STATIC_LIBS_VERSION" | tr + _); \
      tag=$(echo "jdk-$TEMURIN_STATIC_LIBS_VERSION" | sed 's/+/%2B/'); \
      curl -fsSL -o /tmp/static-libs.tar.gz \
        "https://github.com/adoptium/temurin25-binaries/releases/download/${tag}/OpenJDK25U-static-libs-musl_aarch64_alpine-linux_hotspot_${version_}.tar.gz"; \
      echo "$TEMURIN_STATIC_LIBS_SHA256_ARM64  /tmp/static-libs.tar.gz" | sha256sum -c -; \
      mkdir -p /opt/graalvm/lib/static/linux-aarch64/musl; \
      tar xzf /tmp/static-libs.tar.gz --strip-components=5 -C /opt/graalvm/lib/static/linux-aarch64/musl; \
      rm /tmp/static-libs.tar.gz; \
    fi; \
    ls /opt/graalvm/lib/static/linux-*/musl/libjava.a

# native-image links zlib; build a static PIC one for musl so it ends up inside the .so
RUN set -eu; \
    curl -fsSL -o /tmp/zlib.tar.gz "https://zlib.net/fossils/zlib-${ZLIB_VERSION}.tar.gz"; \
    echo "$ZLIB_SHA256  /tmp/zlib.tar.gz" | sha256sum -c -; \
    tar xzf /tmp/zlib.tar.gz -C /tmp; \
    triplet=$(gcc -dumpmachine | sed 's/-gnu$/-musl/'); \
    cd "/tmp/zlib-${ZLIB_VERSION}"; \
    CC=musl-gcc CFLAGS="-O2 -fPIC" ./configure --static --prefix=/usr --libdir="/usr/lib/$triplet" --includedir="/usr/include/$triplet"; \
    make -j"$(nproc)" install; \
    cp LICENSE /opt/zlib-LICENSE; \
    rm -rf /tmp/zlib*

# What Oracle's js-isolate artifact is built from, minus wasm
RUN set -eu; \
    fetch() { \
      name=$(basename "$1"); \
      url="https://repo1.maven.org/maven2/org/graalvm/$1/${GRAAL_VERSION}/${name}-${GRAAL_VERSION}.jar"; \
      curl -fsSLO "$url"; \
      echo "$(curl -fsSL "$url.sha1" | cut -d' ' -f1)  ${name}-${GRAAL_VERSION}.jar" | sha1sum -c -; \
    }; \
    mkdir /image-path /test-lib; \
    cd /image-path; \
    for artifact in \
      js/js-language regex/regex \
      truffle/truffle-api truffle/truffle-runtime truffle/truffle-compiler \
      polyglot/polyglot sdk/collections sdk/nativeimage sdk/word sdk/jniutils sdk/nativebridge \
      shadowed/icu4j shadowed/xz; do \
      fetch "$artifact"; \
    done; \
    cd /test-lib; \
    case "$(dpkg --print-architecture)" in amd64) arch=amd64 ;; arm64) arch=aarch64 ;; esac; \
    fetch "js/js-isolate-linux-${arch}-community"

# Flags from GraalVM's own polyglot isolate build (mx_truffle.py PolyglotIsolateProject), plus --libc=musl
RUN set -eu; \
    mkdir /out /work; \
    /opt/graalvm/bin/native-image \
      -p "$(ls /image-path/*.jar | paste -sd:)" \
      --shared \
      --libc=musl \
      --native-compiler-path=/usr/bin/musl-gcc \
      -march=compatibility \
      --link-at-build-time \
      -Dorg.graalvm.version="${GRAAL_VERSION}" \
      -H:+UnlockExperimentalVMOptions \
        -H:+GenerateBuildArtifactsFile \
        -H:+AssertInitializationSpecifiedForAllClasses \
        -H:+EnforceMaxRuntimeCompileMethods \
        -H:+GuaranteeSubstrateTypesLinked \
        -H:+ReportExceptionStackTraces \
        -H:+DetectUserDirectoriesInImageHeap \
        -H:+VerifyRuntimeCompilationFrameStates \
      -H:-UnlockExperimentalVMOptions \
      --features=com.oracle.svm.truffle.PolyglotIsolateGuestFeature \
      -H:APIFunctionPrefix=truffle_isolate_ \
      -H:+CopyLanguageResources \
      -H:+UnlockExperimentalVMOptions -H:-InitializeVM -H:-UnlockExperimentalVMOptions \
      -o /work/libpolyglotisolate; \
    lib=/work/libpolyglotisolate.so; \
    [ "$(readelf -d "$lib" | grep NEEDED | grep -v '\[libc.so\]' | wc -l)" = 0 ] || { echo "unexpected NEEDED entries" >&2; exit 1; }; \
    [ "$(readelf -V "$lib" | grep -c GLIBC)" = 0 ] || { echo "glibc symbol versions found" >&2; exit 1; }; \
    ! readelf -d "$lib" | grep -q TEXTREL || { echo "text relocations found" >&2; exit 1; }; \
    mv "$lib" /out/; \
    cd /work; \
    /opt/graalvm/bin/jar xf /image-path/truffle-api-*.jar META-INF/graalvm/org.graalvm.truffle/version; \
    cp META-INF/graalvm/org.graalvm.truffle/version /out/VERSION; \
    [ "$(cat /out/VERSION)" = "$GRAAL_VERSION" ]

# notices for what the library links in
RUN mkdir /out/licenses \
    && cp /opt/graalvm/LICENSE.txt /opt/graalvm/LICENSE_NATIVEIMAGE.txt /opt/graalvm/THIRD_PARTY_LICENSE.txt /out/licenses/ \
    && cp /opt/zlib-LICENSE /out/licenses/zlib-LICENSE \
    && cp /usr/share/doc/musl/copyright /out/licenses/musl-COPYRIGHT

# Loads the isolate the way the Alpine image does; the final stage copies from here so BuildKit can't skip it
FROM eclipse-temurin:25-jdk-alpine AS test

COPY --from=build /out/ /out/
COPY --from=build /test-lib/ /image-path/polyglot-*.jar /image-path/collections-*.jar /image-path/nativeimage-*.jar \
     /image-path/word-*.jar /image-path/jniutils-*.jar /image-path/nativebridge-*.jar /image-path/truffle-api-*.jar \
     /test/lib/
COPY IsolateSmokeTest.java /test/

# `ldd` performs every relocation, so it also catches symbols a lazy dlopen would only miss at call time
RUN set -eu; \
    ! ldd /out/libpolyglotisolate.so 2>&1 | grep -E 'Error (loading|relocating)' || { echo "unresolved symbols" >&2; exit 1; }; \
    case "$(uname -m)" in x86_64) arch=amd64 ;; aarch64) arch=aarch64 ;; esac; \
    java --enable-native-access=ALL-UNNAMED \
      "-Dpolyglot.engine.resourcePath.engine.js-isolate-linux-${arch}=/out" \
      -cp '/test/lib/*' /test/IsolateSmokeTest.java /out

FROM scratch

COPY --from=test /out/ /
