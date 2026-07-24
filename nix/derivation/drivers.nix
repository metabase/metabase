# nix/derivation/drivers.nix
#
# Sub-derivations: individual database driver JARs.
#
# Each driver is built as its own derivation via mkDriver, so changing
# e.g. the clickhouse driver doesn't invalidate the snowflake cache.
#
# The `all` attribute combines every driver JAR into a single output
# for consumption by uberjar.nix.
#
# Cache trigger: Each driver only rebuilds when its own source changes
# (plus shared backend/build sources via the source filter).
#
{
  pkgs,
  lib,
  src,
  clojureDeps,
  version ? "0.0.0-nix",
  edition ? "oss",
}:

let
  drvLib = import ./lib.nix { inherit pkgs; };

  # Build a single driver derivation.
  # The build/driver command handles parent dependencies automatically
  # (e.g., sparksql internally compiles hive-like first).
  mkDriver =
    name:
    pkgs.stdenv.mkDerivation {
      pname = "metabase-driver-${name}";
      inherit version src;
      nativeBuildInputs = drvLib.clojureBuildInputs;
      buildPhase = ''
        runHook preBuild
        ${drvLib.setupClojureDeps { inherit clojureDeps; }}
        echo '<settings><offline>true</offline></settings>' > $HOME/.m2/settings.xml
        clojure -X:build:drivers:build/driver :driver :${name} :edition :${edition}
        runHook postBuild
      '';
      installPhase = ''
        runHook preInstall
        mkdir -p $out/plugins
        cp resources/modules/${name}.metabase-driver.jar $out/plugins/
        runHook postInstall
      '';
    };

  # All driver names
  driverNames = [
    "athena"
    "bigquery-cloud-sdk"
    "clickhouse"
    "databricks"
    "druid"
    "druid-jdbc"
    "hive-like"
    "mongo"
    "oracle"
    "presto-jdbc"
    "redshift"
    "snowflake"
    "sparksql"
    "sqlite"
    "sqlserver"
    "starburst"
    "vertica"
  ];

  # Individual driver derivations keyed by name
  individualDrivers = lib.genAttrs driverNames mkDriver;

  # Combined derivation: merges all driver JARs into one output
  all = pkgs.stdenv.mkDerivation {
    pname = "metabase-drivers-all";
    inherit version;
    dontUnpack = true;
    installPhase = ''
      runHook preInstall
      mkdir -p $out/plugins
      ${lib.concatMapStringsSep "\n" (
        name: "cp ${individualDrivers.${name}}/plugins/${name}.metabase-driver.jar $out/plugins/"
      ) driverNames}
      runHook postInstall
    '';
  };

in
individualDrivers // { inherit all; }
