# Build-drivers scripts

Scripts for building Metabase driver plugins. You must install the [Clojure CLI
tools](https://www.clojure.org/guides/getting_started) to use these.

There are three main entrypoints. Shell script wrappers are provided for convenience and compatibility.

### `build-drivers`

Builds *all* drivers as needed.

```
clojure -X:build:drivers:build/drivers

# or

clojure -X:build:drivers:build/drivers :edition :ee

# or

./bin/build-drivers.sh
```

### `build-driver`

Build a single driver as needed. Builds parent drivers if needed first.

```sh
clojure -X:build:drivers:build/driver :driver :sqlserver

# or

clojure -X:build:drivers:build/driver :driver :sqlserver :edition :oss

# or

./bin/build-driver.sh redshift
```

### `verify-driver`

Verify that a built driver looks correctly built.

```
clojure -X:build:build/verify-driver :driver :mongo
```
