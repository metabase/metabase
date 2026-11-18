(ns metabase.warehouses.serialization
  "The SerDes of Databases."
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.premium-features.core :as premium-features]
   [metabase.warehouses.db :as warehouses.db]
   [metabase.warehouses.schema :as warehouses.schema]))

(set! *warn-on-reflection* true)

(defn import-complete
  "A transform fn importing every value as `\"complete\"`."
  [_store _entities values _opts]
  (mapv (constantly "complete") values))

(defn import-false
  "A transform fn importing every value as `false`."
  [_store _entities values _opts]
  (mapv (constantly false) values))

(def ^:private instance-local-settings
  "Database-local settings that hold names in this instance's warehouse, not content: an export leaves them out, and an
  import keeps the values of the database it updates. A copied workspace schema would point the target's transforms
  at another schema while its remap rows still point at the old one."
  [:database-workspace-schema])

(defn- export-settings
  "Exports the `:settings` of Databases without [[instance-local-settings]]."
  [_store _rows values _opts]
  (mapv #(if (map? %) (not-empty (apply dissoc % instance-local-settings)) %) values))

(defn- import-settings
  "Imports the `:settings` of Databases normalized by their schema, keeping the [[instance-local-settings]] of the
  Databases they update, and the raw ciphertext of settings the model could not decrypt as it is."
  [_store entities values _opts]
  (mapv (fn [{db-name :name} settings]
          (let [settings (lib/normalize [:maybe ::warehouses.schema/database.settings] settings)
                target   (warehouses.db/database-settings-by-name db-name)
                kept     (when (map? target) (select-keys target instance-local-settings))]
            (if (map? settings)
              (not-empty (merge (apply dissoc settings instance-local-settings) kept))
              settings)))
        entities values))

(def settings-transform
  "The serialization transform of the `:settings` of Databases, which leaves out [[instance-local-settings]]."
  {:export export-settings
   :import import-settings})

(defn storage-paths
  "The storage path of each of the Database `entities`, a directory for the database with a same-named file inside."
  [entities _ctx]
  (mapv (fn [{:keys [name]}]
          [{:label "databases"} {:label name :key name} {:label name :key name}])
        entities))

(defn assert-not-h2!
  "Validate db is not h2 for serialization import"
  [row]
  (when (= :h2 (keyword (:engine row)))
    (throw (ex-info "h2 is not supported for serialization import"
                    {:engine (:engine row) :name (:name row)}))))

(defn assert-sqlite-not-hosted!
  "Refuse to import a SQLite Database on a hosted instance. SQLite is blocked as a warehouse on Metabase Cloud (only
  the bundled Sample Database, which serdes never exports, is allowed); serialization import is the one write path
  that never tests the connection, so without this an archive could persist a SQLite row whose attacker-chosen `:db`
  path is later opened by sync. Mirrors [[assert-not-h2!]]. Self-hosted instances import SQLite normally."
  [row]
  (when (and (= :sqlite (keyword (:engine row)))
             (premium-features/is-hosted?))
    (throw (ex-info "SQLite is not available as a data warehouse on Metabase Cloud."
                    {:engine (:engine row) :name (:name row) :status-code 400}))))

(defn- keep-local-audit-columns
  "The load `item` of a Database, keeping the local values of the columns its entity lacks when it is the internal
  analytics Database, whose engine, details and timezone belong to this instance."
  [{:keys [entity local] :as item}]
  (if (and local (:is_audit entity))
    (update item :row #(apply dissoc % (remove (set (keys entity)) (keys %))))
    item))

(defn before-load
  "The Database load `items`, refusing H2 and hosted SQLite, with sanitized details."
  [items]
  (doseq [{:keys [row]} items]
    (assert-not-h2! row)
    (assert-sqlite-not-hosted! row))
  (mapv (fn [item]
          (-> item
              keep-local-audit-columns
              (update :row #(cond-> %
                              (:details %)            (update :details driver/sanitize-db-details)
                              (:write_data_details %) (update :write_data_details driver/sanitize-db-details)
                              (:admin_details %)      (update :admin_details driver/sanitize-db-details)))))
        items))
