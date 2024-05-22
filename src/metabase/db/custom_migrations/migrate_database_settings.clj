(ns metabase.db.custom-migrations.migrate-database-settings
  "Migrate the serialized-JSON `metabase_database.settings` column to a new `database_setting` Table.

  At the time this migration was introduced, there are only four Database-local Settings, two of which are `:integer`
  and two of which are `:boolean`, which means we can just use [[clojure.core/str]] to serialize them."
  (:require
   [cheshire.core :as json]
   [toucan2.core :as t2]))

;;; TODO -- this needs to handle possibly encrypted Database settings, and encrypt values in the new Table.

(defn- forward-migration-new-database-setting-rows
  "New rows for the database_setting table. Realized in memory all at once because realistically we shouldn't have too
  many entries."
  []
  (reduce
   (fn [acc {database-id :id, unparsed-settings :settings}]
     (reduce
      (fn [acc [k v]]
        (conj acc {:database_id database-id, :key k, :value (str v)}))
      acc
      (json/parse-string unparsed-settings)))
   []
   (t2/reducible-select ["metabase_database" :id :settings]
                        {:where [:and
                                 [:not= :settings nil]
                                 [:not= :settings "{}"]]})))

(defn migrate-up!
  "Forward migration for database.settings => database_setting"
  []
  (t2/insert! "database_setting" (forward-migration-new-database-setting-rows)))

(defn- parse-string-value
  "As mentioned above, at the time of this migration we only have boolean and integer Database-local Settings. But we
  don't really NEED to parse the value since normal Settings logic will parse them automatically anyway as needed. But
  to make this stuff idempotent we can try to parse them anyway I guess."
  [value]
  (cond (re-matches #"^\d+$" value) (parse-long value)
        (= value "true")            true
        (= value "false")           false
        :else                       value))

(defn- reverse-migration-database-id->settings
  "Build a map of Database ID -> settings blob for the reverse migration."
  []
  (reduce
   (fn [acc {database-id :database_id, setting-name :key, value :value}]
     (assoc-in acc [database-id setting-name] (parse-string-value value)))
   {}
   (t2/reducible-select "database_setting")))

(defn migrate-down!
  "Reverse migration for database.settings => database_setting"
  []
  (doseq [[database-id settings] (reverse-migration-database-id->settings)]
    (t2/update! "metabase_database" :id database-id {:settings (json/generate-string settings)})))
