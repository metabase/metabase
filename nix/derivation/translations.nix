# nix/derivation/translations.nix
#
# Sub-derivation: i18n translation artifacts.
#
# Cache trigger: Only rebuilds when locales/ or i18n source changes.
#
{
  pkgs,
  lib,
  src,
  clojureDeps,
  version ? "0.0.0-nix",
}:

let
  drvLib = import ./lib.nix { inherit pkgs; };
in
pkgs.stdenv.mkDerivation {
  pname = "metabase-translations";
  inherit version src;
  nativeBuildInputs = drvLib.clojureBuildInputs;
  buildPhase = ''
    runHook preBuild
    ${drvLib.setupClojureDeps { inherit clojureDeps; }}
    clojure -X:build:build/i18n
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p $out/resources
    cp -r resources/i18n $out/resources/
    cp -r locales $out/
    runHook postInstall
  '';
}
