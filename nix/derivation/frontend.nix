# nix/derivation/frontend.nix
#
# Sub-derivation: frontend assets (rspack production build).
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
  pname = "metabase-frontend";
  inherit version src;
  nativeBuildInputs = drvLib.frontendBuildInputs;
  buildPhase = ''
    runHook preBuild
    ${drvLib.setupFrontendBuild { inherit frontendDeps clojureDeps edition; }}

    # Build production frontend
    bun run build-release
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p $out/resources
    cp -r resources/frontend_client $out/resources/
    runHook postInstall
  '';
}
