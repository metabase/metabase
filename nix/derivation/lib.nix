# nix/derivation/lib.nix
#
# Shared helpers for Metabase sub-derivations.
#
{
  pkgs,
  jdk ? pkgs.temurin-bin-21,
}:

let
  # Base inputs for Clojure builds (without stripJavaArchivesHook).
  # Used by uberjar.nix which handles its own JAR normalization via
  # deterministic extract-filter-repack, avoiding the 8-hour fixup phase.
  clojureBuildInputsBase = [
    jdk
    pkgs.clojure
    pkgs.git
    pkgs.python3
  ];

  # Full inputs including stripJavaArchivesHook for smaller JARs
  # (translations, drivers) where the fixup phase is fast.
  clojureBuildInputs = clojureBuildInputsBase ++ [
    pkgs.stripJavaArchivesHook # normalize JAR timestamps/ordering for reproducibility
  ];

  # Shell fragment: set up offline .m2 repo from pre-fetched clojureDeps FOD.
  # Copies the repo, makes it writable, patches deps.edn files for git deps
  # and Maven repo URLs, and configures the JVM for deterministic compilation.
  #
  # Usage in buildPhase:
  #   ${drvLib.setupClojureDeps { inherit clojureDeps; }}
  setupClojureDeps =
    { clojureDeps }:
    ''
      export HOME=$TMPDIR
      export JAVA_HOME="${jdk}"
      export JAVA_TOOL_OPTIONS="-XX:+UnlockExperimentalVMOptions -XX:hashCode=2"

      # Copy pre-fetched Maven repository (writable — Clojure tooling writes cache/lock files)
      mkdir -p $HOME/.m2
      cp -r ${clojureDeps}/repository $HOME/.m2/repository
      chmod -R u+w $HOME/.m2/repository

      # Patch deps.edn: replace git deps with local paths, redirect Maven repos to file://
      bash ${./patch-git-deps.sh} deps.edn ${clojureDeps}/gitlibs
      bash ${./patch-mvn-repos.sh} "file://$HOME/.m2/repository"
    '';
in
{
  # Common nativeBuildInputs for Clojure-based derivations
  inherit clojureBuildInputsBase clojureBuildInputs;

  # Clojure + frontend tooling (used by frontend.nix, static-viz.nix)
  frontendBuildInputs = clojureBuildInputs ++ [
    pkgs.bun
    pkgs.nodejs_22
  ];

  inherit setupClojureDeps;

  # Shell fragment: common setup for frontend-based builds (frontend.nix, static-viz.nix).
  # Composes setupClojureDeps with node_modules setup and Maven repo overrides
  # needed by shadow-cljs.
  setupFrontendBuild =
    {
      frontendDeps,
      clojureDeps,
      edition ? "oss",
    }:
    ''
      # Install node_modules from pre-fetched FOD
      export NODE_OPTIONS="--max-old-space-size=4096"
      cp -r ${frontendDeps} node_modules
      chmod -R u+w node_modules
      patchShebangs node_modules
      bun run patch-package

      # Set up Clojure deps (shared with all Clojure builds)
      ${setupClojureDeps { inherit clojureDeps; }}

      # Override default Maven repos so shadow-cljs resolves from local file:// repo
      LOCAL_REPO="file://$HOME/.m2/repository"
      mkdir -p $HOME/.clojure
      echo '{:mvn/repos {"central" {:url "'"$LOCAL_REPO"'"} "clojars" {:url "'"$LOCAL_REPO"'"}}}' > $HOME/.clojure/deps.edn

      export WEBPACK_BUNDLE=production
      export MB_EDITION=${edition}
    '';
}
