(ns metabase-enterprise.serialization.v2.serialize
  "Top-level functionality for serializing a Metabase appdb into YAML files for import into another.
  Leans heavily on the base serialization functions in [[metabase.models.serialization.base]]."
  (:require [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase.models.serialization.base :as serdes.base]
            [toucan.db :as db]))

(defn serialize-metabase
  "Serializes the complete database into a reducible stream of [file-path edn-map] pairs.
  This is the last step before conversion to YAML and writing to disk, and a useful point for testing.
  The file paths are relative to the root dump directory."
  [user-or-nil]
  (eduction cat (for [model serdes.models/exported-models]
                   (serdes.base/serialize-all (db/resolve-model model) user-or-nil))))
