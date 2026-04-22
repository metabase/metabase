# nix/derivation/static-viz.nix
#
# Sub-derivation: static visualization bundle (rspack build).
#
# Separate from the main frontend build — uses its own rspack config
# (rspack.static-viz.config.js) and produces lib-static-viz.bundle.js.
#
# Cache trigger: Only rebuilds when frontend/ source changes.
#
{
  pkgs,
  lib,
  src,
  frontendDeps,
  clojureDeps,
  version ? "0.0.0-nix",
  edition ? "oss",
}:

let
  drvLib = import ./lib.nix { inherit pkgs; };
in
pkgs.stdenv.mkDerivation {
  pname = "metabase-static-viz";
  inherit version src;
  nativeBuildInputs = drvLib.frontendBuildInputs;
  buildPhase = ''
    runHook preBuild
    ${drvLib.setupFrontendBuild { inherit frontendDeps clojureDeps edition; }}

    # Build cljs first (static-viz rspack config references cljs/ alias)
    bun run build-release:cljs

    # Build static viz bundle
    bun run build-release:static-viz
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p $out/resources/frontend_client
    cp -r resources/frontend_client/app $out/resources/frontend_client/
    runHook postInstall
  '';
}
