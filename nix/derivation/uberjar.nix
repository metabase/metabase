# nix/derivation/uberjar.nix
#
# Sub-derivation: final Metabase uberjar assembly.
# Combines all sub-derivation outputs into the final JAR.
#
# When `drivers` is null, builds a core-only JAR without bundled external
# drivers. Users can mount driver JARs at /plugins at runtime.
#
# Cache trigger: Rebuilds when backend source or any sub-derivation changes.
#
{
  pkgs,
  lib,
  src,
  clojureDeps,
  frontend,
  staticViz,
  translations,
  drivers ? null,
  version ? "0.0.0-nix",
  edition ? "oss",
}:

let
  drvLib = import ./lib.nix { inherit pkgs; };
in
pkgs.stdenv.mkDerivation {
  pname = "metabase-uberjar";
  inherit version src;
  nativeBuildInputs = drvLib.clojureBuildInputsBase;
  buildPhase = ''
    runHook preBuild
    ${drvLib.setupClojureDeps { inherit clojureDeps; }}
    export MB_EDITION="${edition}"

    # Assemble sub-derivation outputs (chmod needed: store paths are read-only)
    mkdir -p resources/frontend_client
    cp -r ${frontend}/resources/frontend_client/* resources/frontend_client/
    chmod -R u+w resources/frontend_client/
    cp -r ${staticViz}/resources/frontend_client/* resources/frontend_client/
    cp -r ${translations}/resources/* resources/
    ${lib.optionalString (drivers != null) ''
      mkdir -p resources/modules
      cp -r ${drivers}/plugins/*.jar resources/modules/
    ''}

    # Git config for version detection (best-effort — not critical for build)
    export GIT_DISCOVERY_ACROSS_FILESYSTEM=1
    git config --global --add safe.directory "$PWD" 2>/dev/null || true

    clojure -X:build:build/uberjar :edition :${edition}

    # ── Deterministic repack: strip AOT-shadowed sources and normalize JAR ──
    #
    # Clojure's RT.load() prefers source over AOT when timestamps are equal
    # (classTime > sourceTime, not >=).  In a Nix sandbox all files share the
    # same mtime, so without stripping, Clojure re-compiles namespaces from
    # source at runtime via DynamicClassLoader while AOT-compiled reify/proxy
    # objects were loaded by AppClassLoader — breaking protocol dispatch.
    #
    # Instead of modifying the JAR in-place with zip -qd (which produces
    # non-deterministic output requiring an 8-hour stripJavaArchivesHook fixup),
    # we extract, filter, and repack from scratch with deterministic timestamps.
    echo "Repacking uberjar deterministically (strip AOT-shadowed sources + normalize)..."
    JAR="$PWD/target/uberjar/metabase.jar"
    REPACK_DIR=$(mktemp -d)

    # Extract (unset JAVA_TOOL_OPTIONS so jar doesn't pick up -XX:hashCode=3)
    (cd "$REPACK_DIR" && JAVA_TOOL_OPTIONS="" jar xf "$JAR")

    # Find and remove source files that have AOT __init.class counterparts
    removed=0
    find "$REPACK_DIR" -regextype posix-extended -regex '.*\.clj[cs]?$' | while read -r src_file; do
      base="''${src_file%.*}"
      if [ -f "''${base}__init.class" ]; then
        rm "$src_file"
        removed=$((removed + 1))
      fi
    done
    echo "  Removed AOT-shadowed source files"

    # Normalize Clojure proxy classes for deterministic bytecode.
    # Clojure's proxy macro uses Class.getConstructors() whose order is
    # unspecified per the JDK spec, producing non-deterministic constant
    # pool layout and method ordering.  ASM rewrites each proxy class with
    # methods sorted by (name, descriptor), rebuilding the constant pool
    # in visitation order for identical output.
    ASM_JAR="$HOME/.m2/repository/org/ow2/asm/asm/9.7.1/asm-9.7.1.jar"
    NORM_BUILD=$(mktemp -d)
    cp ${./NormalizeProxyClasses.java} "$NORM_BUILD/NormalizeProxyClasses.java"
    JAVA_TOOL_OPTIONS="" javac -cp "$ASM_JAR" -d "$NORM_BUILD" \
      "$NORM_BUILD/NormalizeProxyClasses.java"
    JAVA_TOOL_OPTIONS="" java -cp "$ASM_JAR:$NORM_BUILD" \
      NormalizeProxyClasses "$REPACK_DIR"
    rm -rf "$NORM_BUILD"

    # Repack with deterministic timestamps and sorted entry ordering
    rm "$JAR"
    (
      cd "$REPACK_DIR"
      # Normalize all filesystem timestamps
      find . -exec touch -d '1980-01-01 00:01:00' {} +
      # Preserve original manifest (jar --create generates a default one otherwise)
      # and remove it from the tree so it's not included twice
      mv META-INF/MANIFEST.MF /tmp/MANIFEST.MF.orig
      # Create JAR with --date for ZIP entry timestamp normalization
      # --manifest restores the original Main-Class and other attributes
      JAVA_TOOL_OPTIONS="" jar --date=1980-01-01T00:01:00+00:00 \
        --create --manifest=/tmp/MANIFEST.MF.orig --file="$JAR" .
      rm /tmp/MANIFEST.MF.orig
    )
    rm -rf "$REPACK_DIR"
    echo "  Repack complete: $(du -h "$JAR" | cut -f1)"

    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p $out/share/metabase
    cp target/uberjar/metabase.jar $out/share/metabase/
    runHook postInstall
  '';
}
