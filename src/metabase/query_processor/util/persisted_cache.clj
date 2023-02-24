(ns metabase.query-processor.util.persisted-cache
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.public-settings :as public-settings]))

(defn- segmented-user?
  []
  (if-let [segmented? (resolve 'metabase-enterprise.sandbox.api.util/segmented-user?)]
    (try (segmented?)
      ;; Fail closed (i.e. default to true) if `segmented-user` throws an exception due to no current user being bound
      (catch Throwable _ true))
    false))

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
                                               (:table_name persisted-info)))
       (not (segmented-user?))))

(defn persisted-info-native-query
  "Returns a native query that selects from the persisted cached table from `persisted-info`. Does not check if
  persistence is appropriate. Use [[can-substitute?]] for that check."
  [persisted-info]
  (let [database-id (:database_id persisted-info)
        driver      (or driver/*driver* (driver.u/database->driver database-id))]
    (format "select %s from %s.%s"
            (str/join ", " (map #(sql.u/quote-name
                                  driver
                                  :field
                                  (:field-name %))
                                (get-in persisted-info [:definition :field-definitions])))
            (sql.u/quote-name
             driver
             :table
             (ddl.i/schema-name {:id database-id} (public-settings/site-uuid)))
            (sql.u/quote-name
             driver
             :table
             (:table_name persisted-info)))))
