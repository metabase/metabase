# nix/oci/default.nix
#
# Multi-architecture OCI container images for Metabase.
#
# Generates per-arch streamable layered images in several variants:
#   oci-{arch}                — Full (with CJK fonts, all drivers)
#   oci-minimal-{arch}        — Without CJK fonts
#   oci-core-{arch}           — Core-only (no bundled external drivers)
#   oci-{driver}-{arch}       — Core + one specific driver baked in
#
# Per-driver images reuse the core image layers from the Nix store,
# so they add negligible build time and disk space.
#
# Architectures: x86_64 (AMD64), aarch64 (ARM64), riscv64 (RISC-V 64)
#
{
  pkgs,
  lib,
  metabase,
  metabaseCore ? null,
  drivers ? { },
  version ? "0.0.0-nix",
  jre ? pkgs.temurin-jre-bin-21,
}:

let
  supportedArchs = [
    "x86_64"
    "aarch64"
    "riscv64"
  ];

  archMap = {
    x86_64 = "amd64";
    aarch64 = "arm64";
    riscv64 = "riscv64";
  };

  # Layer set builder
  mkLayers =
    {
      metabasePkg,
      includeCjkFonts ? true,
      extraPlugins ? [ ],
    }:
    import ./layers.nix {
      inherit
        pkgs
        lib
        jre
        includeCjkFonts
        extraPlugins
        ;
      metabase = metabasePkg;
    };

  # Entrypoint script with production JVM flags.
  # Uses Generational ZGC (JEP 439, production-ready in JDK 21) for
  # sub-millisecond pause times. Flags match the Docker image entrypoint
  # (bin/docker/run_metabase.sh) minus -XX:+IgnoreUnrecognizedVMOptions
  # (Nix pins the JRE version, so fail-fast on unknown flags is better).
  #
  # Users can add extra flags via the JAVA_OPTS environment variable.
  mkEntrypoint =
    metabasePkg:
    pkgs.writeShellScript "metabase-entrypoint" ''
      exec ${jre}/bin/java \
        -XX:+UseZGC \
        -XX:+UseContainerSupport \
        -XX:MaxRAMPercentage=75.0 \
        -XX:+CrashOnOutOfMemoryError \
        -server \
        -Dfile.encoding=UTF-8 \
        --add-opens java.base/java.nio=ALL-UNNAMED \
        ''${JAVA_OPTS:-} \
        -jar ${metabasePkg}/share/metabase/metabase.jar \
        "$@"
    '';

  # Image builder
  mkImage =
    {
      metabasePkg,
      layers,
      imageName,
    }:
    arch:
    pkgs.dockerTools.streamLayeredImage {
      name = imageName;
      tag = "${version}-${arch}";
      architecture = archMap.${arch};
      contents = layers.contents;

      config = {
        Cmd = [ "${mkEntrypoint metabasePkg}" ];
        ExposedPorts = {
          "3000/tcp" = { };
        };
        Env = [
          "MB_JETTY_HOST=0.0.0.0"
          "MB_DB_TYPE=h2"
          "MB_PLUGINS_DIR=/plugins"
        ];
        Volumes = {
          "/plugins" = { };
        };
        WorkingDir = "/app";
      };
    };

  # Full images (with CJK fonts, all drivers)
  fullImages = lib.genAttrs supportedArchs (mkImage {
    metabasePkg = metabase;
    layers = mkLayers { metabasePkg = metabase; };
    imageName = "metabase";
  });

  # Minimal images (without CJK fonts)
  minimalImages = lib.genAttrs supportedArchs (mkImage {
    metabasePkg = metabase;
    layers = mkLayers {
      metabasePkg = metabase;
      includeCjkFonts = false;
    };
    imageName = "metabase-minimal";
  });

  # Core images (no bundled external drivers)
  coreImages = lib.optionalAttrs (metabaseCore != null) (
    lib.genAttrs supportedArchs (mkImage {
      metabasePkg = metabaseCore;
      layers = mkLayers { metabasePkg = metabaseCore; };
      imageName = "metabase-core";
    })
  );

  # Per-driver images: core + one specific driver baked in.
  # Each reuses the core image layers and adds only the driver JAR.
  driverNames = builtins.attrNames (removeAttrs drivers [ "all" ]);

  driverImages = lib.optionalAttrs (metabaseCore != null && drivers != { }) (
    lib.foldl' (
      acc: name:
      acc
      // lib.mapAttrs' (arch: img: lib.nameValuePair "oci-${name}-${arch}" img) (
        lib.genAttrs supportedArchs (mkImage {
          metabasePkg = metabaseCore;
          layers = mkLayers {
            metabasePkg = metabaseCore;
            extraPlugins = [ drivers.${name} ];
          };
          imageName = "metabase-${name}";
        })
      )
    ) { } driverNames
  );

in
# Flat exports: oci-x86_64, oci-minimal-x86_64, oci-core-x86_64, oci-clickhouse-x86_64, etc.
lib.mapAttrs' (arch: img: lib.nameValuePair "oci-${arch}" img) fullImages
// lib.mapAttrs' (arch: img: lib.nameValuePair "oci-minimal-${arch}" img) minimalImages
// lib.mapAttrs' (arch: img: lib.nameValuePair "oci-core-${arch}" img) coreImages
// driverImages
