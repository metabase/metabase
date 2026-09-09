# nix/oci/layers.nix
#
# Layer decomposition for OCI container images.
#
# Note: Nix's streamLayeredImage creates one layer per store path, not per
# list entry. The ordering here controls inclusion, not Docker-style layer
# stacking. Each store path becomes its own layer regardless of list position.
#
{
  pkgs,
  lib,
  metabase,
  jre ? pkgs.temurin-jre-bin-21,
  includeCjkFonts ? true,
  extraPlugins ? [ ],
}:

{
  contents = [
    # Base OS utilities (~10MB, rarely changes)
    pkgs.bash
    pkgs.coreutils
    pkgs.curl

    # JRE (~200MB, changes with JDK updates)
    jre

    # Fonts for PDF/chart rendering (~50MB without CJK, ~200MB with CJK)
    pkgs.noto-fonts
  ]
  ++ lib.optional includeCjkFonts pkgs.noto-fonts-cjk-sans
  ++ [
    # CA certificates (~1MB, rarely changes)
    pkgs.cacert

    # Metabase JAR + wrapper (~400MB, changes each build)
    metabase
  ]
  ++ extraPlugins;
}
