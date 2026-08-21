# nix/derivation/default.nix
#
# Orchestrator: wires sub-derivations together into the final Metabase package.
#
# Sub-derivation pipeline:
#   deps-clojure → translations, drivers → uberjar
#   deps-frontend → frontend, static-viz → uberjar
#
# Each derivation receives a filtered source tree containing only the
# directories it needs. Changing a backend .clj file won't invalidate
# the frontend cache, and vice versa.
#
{
  pkgs,
  lib,
  src,
  version ? "0.0.0-nix",
  edition ? "oss",
  jre ? pkgs.temurin-jre-bin-21,
}:

let
  # ── Source components ─────────────────────────────────────────────
  # Maps each top-level source directory to a named component.
  # Every top-level directory MUST appear exactly once.
  # The safety assertion below enforces this.
  sourceComponents = {
    backend = [
      "/src"
      "/enterprise/backend"
      "/.clj-kondo"
    ];
    frontend = [
      "/frontend"
      "/enterprise/frontend"
      "/docs"
    ];
    drivers = [ "/modules" ];
    i18n = [ "/locales" ];
    build = [ "/bin" ];
    resources = [ "/resources" ];

    # Directories not needed by any build derivation
    testing = [
      "/test"
      "/test_modules"
      "/test_config"
      "/test_resources"
      "/e2e"
    ];
    tooling = [
      "/config"
      "/dev"
      "/cross-version"
      "/mage"
      "/release"
      "/snowplow"
      "/hooks"
      "/plugins"
      "/patches"
    ];
  };

  # ── Per-derivation component selections ───────────────────────────
  translationFilter = [
    "build"
    "backend"
    "resources"
    "i18n"
  ];
  frontendFilter = [
    "build"
    "frontend"
    "backend"
    "resources"
  ];
  driverFilter = [
    "build"
    "backend"
    "resources"
    "drivers"
  ];
  uberjarFilter = [
    "build"
    "backend"
    "resources"
  ];

  # ── Source filter helper ──────────────────────────────────────────
  # Creates a filtered source tree containing only the named components.
  # Root-level files (deps.edn, package.json, etc.) are always included.
  srcFor =
    componentNames:
    let
      includeDirs = lib.concatLists (map (n: sourceComponents.${n}) componentNames);
      pathMatches =
        relPath:
        builtins.any (
          dir:
          relPath == dir
          || lib.hasPrefix (dir + "/") relPath # path is inside dir
          || lib.hasPrefix (relPath + "/") dir # path is parent of dir
        ) includeDirs;
    in
    lib.cleanSourceWith {
      inherit src;
      filter =
        path: type:
        let
          relPath = lib.removePrefix (toString (src.origSrc or src)) path;
          # Root-level files (no "/" after the leading "/") — always included
          isRootFile =
            type != "directory" && builtins.length (lib.splitString "/" (lib.removePrefix "/" relPath)) == 1;
        in
        isRootFile || pathMatches relPath;
    };

  # ── Coverage safety assertion ─────────────────────────────────────
  # Ensures every top-level source directory is mapped in sourceComponents.
  # Fires at evaluation time if a new directory is added but not mapped.
  allMappedDirs = map (p: lib.removePrefix "/" p) (lib.concatLists (lib.attrValues sourceComponents));

  # Read from original source, excluding dirs already filtered by flake.nix
  topLevelDirs = builtins.attrNames (
    lib.filterAttrs (
      name: type:
      type == "directory" && !lib.hasPrefix "." name && !lib.hasPrefix "flake" name && name != "nix"
    ) (builtins.readDir (if src ? origSrc then src.origSrc else src))
  );

  unmappedDirs = builtins.filter (
    d: !builtins.any (mapped: d == mapped || lib.hasPrefix (d + "/") mapped) allMappedDirs
  ) topLevelDirs;

  assertCoverage =
    assert
      unmappedDirs == [ ]
      || builtins.throw "Unmapped source directories: ${builtins.concatStringsSep ", " unmappedDirs}. Add them to sourceComponents in default.nix.";
    true;

  # Stage 1: Fixed-output dependency fetches (use full src — cached by output hash)
  clojureDeps = import ./deps-clojure.nix { inherit pkgs lib src; };
  frontendDeps = import ./deps-frontend.nix { inherit pkgs lib src; };

  # Stage 2: Sub-builds with filtered sources
  translations =
    assert assertCoverage;
    import ./translations.nix {
      inherit
        pkgs
        lib
        clojureDeps
        version
        ;
      src = srcFor translationFilter;
    };
  frontend = import ./frontend.nix {
    inherit
      pkgs
      lib
      frontendDeps
      clojureDeps
      version
      edition
      ;
    src = srcFor frontendFilter;
  };
  staticViz = import ./static-viz.nix {
    inherit
      pkgs
      lib
      frontendDeps
      clojureDeps
      version
      edition
      ;
    src = srcFor frontendFilter;
  };
  drivers = import ./drivers.nix {
    inherit
      pkgs
      lib
      clojureDeps
      version
      edition
      ;
    src = srcFor driverFilter;
  };

  # Stage 3: Final assembly — full (with all drivers)
  uberjar = import ./uberjar.nix {
    inherit
      pkgs
      lib
      clojureDeps
      frontend
      staticViz
      translations
      version
      edition
      ;
    drivers = drivers.all;
    src = srcFor uberjarFilter;
  };

  # Stage 3 (core variant): Final assembly — without bundled external drivers
  uberjarCore = import ./uberjar.nix {
    inherit
      pkgs
      lib
      clojureDeps
      frontend
      staticViz
      translations
      version
      edition
      ;
    # drivers defaults to null — no external drivers bundled
    src = srcFor uberjarFilter;
  };

  # Helper to create a wrapped Metabase package from a given uberjar
  mkMetabasePackage =
    {
      pname,
      uberjarDrv,
      description,
    }:
    pkgs.stdenv.mkDerivation {
      inherit pname version;

      dontUnpack = true;

      nativeBuildInputs = [ pkgs.makeWrapper ];

      installPhase = ''
        runHook preInstall

        mkdir -p $out/bin $out/share/metabase

        # Copy the JAR
        cp ${uberjarDrv}/share/metabase/metabase.jar $out/share/metabase/

        # Create wrapper script
        makeWrapper ${jre}/bin/java $out/bin/metabase \
          --add-flags "-jar $out/share/metabase/metabase.jar"

        runHook postInstall
      '';

      meta = {
        inherit description;
        homepage = "https://metabase.com";
        license = lib.licenses.agpl3Only;
        platforms = lib.platforms.all;
        mainProgram = "metabase";
      };
    };

  # Final packages
  metabase = mkMetabasePackage {
    pname = "metabase";
    uberjarDrv = uberjar;
    description = "Metabase - Business Intelligence and Embedded Analytics";
  };

  metabaseCore = mkMetabasePackage {
    pname = "metabase-core";
    uberjarDrv = uberjarCore;
    description = "Metabase Core - without bundled external database drivers";
  };

  # ── Patch variant builder ────────────────────────────────────────
  # Creates a Metabase package with a patch applied to the backend source.
  # Only the uberjar stage rebuilds — frontend, static-viz, translations,
  # drivers, and deps are all cached (patches only touch backend Clojure).
  mkVariant =
    {
      pname,
      patchFile,
      description,
    }:
    let
      patchedSrc = pkgs.applyPatches {
        name = "metabase-src-${pname}";
        src = srcFor uberjarFilter;
        patches = [ patchFile ];
      };
      variantUberjar = import ./uberjar.nix {
        inherit
          pkgs
          lib
          clojureDeps
          frontend
          staticViz
          translations
          version
          edition
          ;
        drivers = drivers.all;
        src = patchedSrc;
      };
    in
    mkMetabasePackage {
      inherit pname description;
      uberjarDrv = variantUberjar;
    };

in
{
  # Final packages
  inherit metabase metabaseCore;

  # Variant builder (for patched benchmark builds)
  inherit mkVariant;

  # Individual sub-derivations (for targeted builds)
  inherit
    clojureDeps
    frontendDeps
    translations
    frontend
    staticViz
    uberjar
    uberjarCore
    ;

  # Driver derivations (attrset with per-driver + .all)
  inherit drivers;
}
