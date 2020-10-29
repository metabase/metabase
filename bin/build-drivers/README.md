# Build-drivers scripts

Scripts for building Metabase driver plugins. You must install the [Clojure CLI
tools](https://www.clojure.org/guides/getting_started) to use these.

There are three main entrypoints. Shell script wrappers are provided for convenience and compatibility.

### `build-drivers`

Builds *all* drivers as needed. If drivers were recently built and no relevant source code changed, skips rebuild.

```
cd bin/build-drivers
clojure -M -m build-drivers

# or

./bin/build-drivers.sh
```

### `build-driver`

Build a single driver as needed. Builds parent drivers if needed first.

```
cd bin/build-driver redshift
clojure -M -m build-driver redshift

# or

./bin/build-driver.sh redshift
```

### `verify-driver`

Verify that a built driver looks correctly built.

```
cd bin/verify-driver redshift
clojure -M -m verify-driver redshift

# or

./bin/verify-driver redshift
```
