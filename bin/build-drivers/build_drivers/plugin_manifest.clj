(ns build-drivers.plugin-manifest
  "Code for reading the YAML plugin manifest for a driver. "
  (:require [build-drivers.common :as c]
            [metabuild-common.core :as u]
            [yaml.core :as yaml]))

(defn- plugin-manifest
  "Read `driver` plugin manifest and return a map."
  [driver]
  {:post [(map? %)]}
  (yaml/from-file (u/assert-file-exists (c/driver-plugin-manifest-filename driver))))

(defn- driver-declarations [manifest]
  ;; driver plugin manifest can have a single `:driver`, or multiple drivers, e.g. Spark SQL which also has the
  ;; `:hive-like` abstract driver
  (let [{driver-declaration :driver} manifest]
    (if (map? driver-declaration)
      [driver-declaration]
      driver-declaration)))

(defn- declared-drivers
  "Sequence of all drivers declared in a plugin `manifest`. Usually only one driver, except for Spark SQL which declares
  both `:hive-like` and `:sparksql`."
  [manifest]
  (map (comp keyword :name) (driver-declarations manifest)))

(def ^:private metabase-core-drivers
  "Drivers that ship as part of the core Metabase project (as opposed to a plugin) and thus do not need to be built."
  #{:sql
    :sql-jdbc
    :mysql
    :h2
    :postgres})

(defn parent-drivers
  "Get the parent drivers of a driver for purposes of building a driver. Excludes drivers that ship as part of
  `metabase-core`, since we don't need to worry about building those.

  e.g.

    (parent-drivers :googleanalytics) ;-> (:google)"
  [driver]
  (let [manifest (plugin-manifest driver)
        declared (declared-drivers manifest)]
    (or (not-empty
         (for [{parent-declaration :parent} (driver-declarations manifest)
               :let                         [parents (if (string? parent-declaration)
                                                       [parent-declaration]
                                                       parent-declaration)]
               parent                       parents
               :let                         [parent (keyword parent)]
               :when                        (and (not (contains? (set declared) parent))
                                                 (not (contains? metabase-core-drivers parent)))]
           parent))
        (u/announce "%s does not have any parents" driver))))
