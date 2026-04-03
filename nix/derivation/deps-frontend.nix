# nix/derivation/deps-frontend.nix
#
# Fixed-output derivation (FOD) for frontend (Bun/Node) dependencies.
# Downloads node_modules via bun install --frozen-lockfile.
#
# Cache trigger: Only rebuilds when bun.lock or package.json changes.
#
{
  pkgs,
  lib,
  src,
}:

pkgs.stdenv.mkDerivation {
  pname = "metabase-deps-frontend";
  version = "0.1.0";

  inherit src;

  nativeBuildInputs = [
    pkgs.bun
    pkgs.nodejs_22
    pkgs.cacert
  ];

  buildPhase = ''
    export HOME=$TMPDIR
    export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"

    # Skip lifecycle scripts — /usr/bin/env doesn't exist in sandbox.
    # patch-package runs in frontend.nix after node_modules is writable.
    bun install --frozen-lockfile --ignore-scripts
  '';

  installPhase = ''
    cp -r node_modules $out
  '';

  # Fixed-output derivation settings
  outputHashMode = "recursive";
  outputHashAlgo = "sha256";
  outputHash = "sha256-Te3GdzaE3Jxv2JdDKs4JaU9vS1m+8ipQxCo+77ycn8w=";

  # Disable fixup — FODs must not reference store paths (patchShebangs would add them)
  dontFixup = true;

  impureEnvVars = lib.fetchers.proxyImpureEnvVars;
}
