(ns metabase.usage-metadata.query-utils
  "Shared query and source metadata helpers for usage-metadata readers and miners."
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn build-source-index
  "Bulk-fetch Tables and Cards identified by `[source-type source-id]` keys."
  [source-keys]
  (let [by-type   (group-by first source-keys)
        table-ids (into #{} (comp (keep second) (filter pos-int?)) (get by-type :table))
        card-ids  (into #{} (comp (keep second) (filter pos-int?)) (get by-type :card))
        tables    (when (seq table-ids)
                    (t2/select [:model/Table :id :name :display_name :db_id :schema]
                               :id [:in table-ids]))
        cards     (when (seq card-ids)
                    (t2/select [:model/Card :id :name] :id [:in card-ids]))]
    (into {}
          cat
          [(map (fn [{:keys [id name display_name db_id schema]}]
                  [[:table id] {:type         :table
                                :id           id
                                :db-id        db_id
                                :schema       schema
                                :name         name
                                :display-name (or display_name name)}])
                tables)
           (map (fn [{:keys [id name]}]
                  [[:card id] {:type         :card
                               :id           id
                               :name         name
                               :display-name name}])
                cards)])))

(defn ignoring-exceptions
  "Evaluate `thunk`. `InterruptedException` is restored on the thread and rethrown; any other
  Exception is passed to `on-error` and `(fallback)` is returned in its place."
  [thunk on-error fallback]
  (try
    (thunk)
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (throw e))
    (catch Exception e
      (on-error e)
      (fallback))))

(defn wrap-query
  "Wrap raw MBQL in a Lib query backed by the application metadata provider."
  [database-id query-map]
  (when (and (pos-int? database-id) (seq query-map))
    (ignoring-exceptions
     #(lib/query (lib-be/application-database-metadata-provider database-id) query-map)
     #(log/debugf "Failed to wrap usage-metadata query: %s" (ex-message %))
     (constantly nil))))
