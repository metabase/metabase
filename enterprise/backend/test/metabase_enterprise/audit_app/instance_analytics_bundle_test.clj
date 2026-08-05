(ns metabase-enterprise.audit-app.instance-analytics-bundle-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(defn- bundled-queries
  "Every full query in the shipped instance-analytics bundle, as `[entity-id query]` pairs."
  []
  (let [dir       (io/file (io/resource "instance_analytics"))
        ingestion (v2.ingest/ingest-yaml (.getPath dir))]
    (for [path (v2.ingest/ingest-list ingestion)
          :let [query (:dataset_query (v2.ingest/ingest-one ingestion path))]
          :when query]
      [(:id (last path)) query])))

(deftest ^:parallel bundled-queries-match-this-instances-mbql-schema-test
  (testing (str "GHY-4241: every query in resources/instance_analytics must import cleanly into this version. "
                "Instance analytics re-imports on every EE boot via `ensure-audit-db-installed!`, which rethrows "
                "anything that isn't lock contention, and `start-normally` turns that into `(System/exit 1)`. So a "
                "bundled query this version cannot represent is a boot crash, not a stale-content bug.")
    ;; FK resolution is stubbed out: the bundle's portable refs point at the audit DB, which doesn't exist here, and
    ;; what's under test is the query shape rather than the resolution.
    (binding [serdes/*import-database-fk* (constantly 1)
              serdes/*import-table-fk*    (constantly 1)
              serdes/*import-field-fk*    (constantly 1)
              serdes/*import-fk*          (fn [& _] 1)]
      (let [queries  (bundled-queries)
            failures (for [[entity-id query] queries
                           :let  [error (try
                                          (serdes/import-mbql query)
                                          nil
                                          (catch Exception e (ex-message e)))]
                           :when error]
                       [entity-id error])]
        (testing "the bundle was found and actually contains queries, so an empty pass can't be a false negative"
          (is (pos? (count queries))))
        (is (= [] (vec failures)))))))
