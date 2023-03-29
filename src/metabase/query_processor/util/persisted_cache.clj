(ns metabase.query-processor.util.persisted-cache
  (:require
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.public-settings :as public-settings]))

(defn can-substitute?
  "Taking a card and a persisted-info record (possibly nil), returns whether the card's query can be substituted for a
  persisted version."
  [card persisted-info]
  (and persisted-info
       persisted-info/*allow-persisted-substitution*
       (:active persisted-info)
       (= (:state persisted-info) "persisted")
       (:definition persisted-info)
       (:query_hash persisted-info)
       (= (:query_hash persisted-info) (persisted-info/query-hash (:dataset_query card)))
       (= (:definition persisted-info)
          (persisted-info/metadata->definition (:result_metadata card)
                                               (:table_name persisted-info)))))

(defn persisted-info-native-query
  "Returns a native query that selects from the persisted cached table from `persisted-info`. Does not check if
  persistence is appropriate. Use [[can-substitute?]] for that check."
  [{:keys [database_id table_name] :as _persisted-info}]
  (let [driver      (or driver/*driver* (driver.u/database->driver database_id))]
    ;; select * because we don't actually know the name of the fields when in the actual query. See #28902
    (format "select * from %s.%s"
            (sql.u/quote-name
             driver
             :table
             (ddl.i/schema-name {:id database_id} (public-settings/site-uuid)))
            (sql.u/quote-name
             driver
             :table
             table_name))))
