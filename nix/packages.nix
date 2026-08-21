# nix/packages.nix
#
# Dependency declarations for Metabase development and production builds.
#
# Four tiers:
#   nativeBuildInputs - build-time tools (JDK, Clojure, Node, Bun, etc.)
#   buildInputs       - runtime libraries (JRE)
#   devTools          - dev shell only (PostgreSQL, shellcheck, etc.)
#   runtimeDeps       - OCI container runtime (JRE, bash, fonts, certs)
#
{ pkgs }:

let
  jdk = pkgs.temurin-bin-21;
  jre = pkgs.temurin-jre-bin-21;
in
{
  # Build-time tools (needed to compile/build Metabase)
  nativeBuildInputs = [
    jdk
    pkgs.clojure
    pkgs.babashka
    pkgs.bun
    pkgs.nodejs_22
    pkgs.python312
    pkgs.uv
    pkgs.git
    pkgs.makeWrapper
    pkgs.leiningen
  ];

  # Runtime libraries (linked against at build time, needed at runtime)
  buildInputs = [
    jre
  ];

  # Dev shell only tools (not needed for builds)
  devTools = [
    pkgs.postgresql_18
    pkgs.shellcheck
    pkgs.jq
    pkgs.curl
    pkgs.bat
    pkgs.fzf
    pkgs.fd
    pkgs.ripgrep
    pkgs.gh
    pkgs.nixfmt
  ];

  # OCI container runtime dependencies
  runtimeDeps = [
    jre
    pkgs.bash
    pkgs.coreutils
    pkgs.curl
    pkgs.cacert
    pkgs.noto-fonts
    pkgs.noto-fonts-cjk-sans
  ];

  # Export individual packages for reuse
  inherit jdk jre;

  # All packages combined (for reference)
  allPackages = {
    inherit jdk jre;
    clojure = pkgs.clojure;
    bun = pkgs.bun;
    nodejs = pkgs.nodejs_22;
    postgresql = pkgs.postgresql_18;
  };
}
