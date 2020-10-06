(ns build-drivers.plugin-manifest
  (:require [build-drivers
             [common :as c]
             [util :as u]]
            [yaml.core :as yaml]))

(defn plugin-manifest [driver]
  (yaml/from-file (u/assert-file-exists (c/driver-plugin-manifest-filename driver))))

(defn driver-declarations [manifest]
  (let [{driver-declaration :driver} manifest]
    (if (map? driver-declaration)
      [driver-declaration]
      driver-declaration)))

(defn declared-drivers [manifest]
  (map (comp keyword :name) (driver-declarations manifest)))

(def ^:private metabase-core-drivers
  #{:sql
    :sql-jdbc
    :mysql
    :h2
    :postgres})

(defn parent-drivers
  "e.g.

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
