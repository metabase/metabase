(ns metabase-enterprise.audit-app.instance-analytics-bundle-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.core :as ee.serialization]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.protocol.stub :as protocol.stub]))

(set! *warn-on-reflection* true)

(defn- bundle-ingestion
  "An ingestion over the shipped instance-analytics bundle."
  []
  (let [dir (io/file (io/resource "instance_analytics"))]
    (ee.serialization/ingest-yaml (.getPath dir))))

(defn- bundled-queries
  "Every full query in `ingestion`, as `[entity-id query]` pairs."
  [ingestion]
  (into []
        (keep (fn [[[_model id] entity]]
                (when-let [query (:dataset_query entity)]
                  [id query])))
        (ee.serialization/ingested ingestion (vec (ee.serialization/ingest-list ingestion)))))

(def ^:private stub-store
  "A store that resolves every reference to id 1."
  (protocol.stub/stub-store {:import (constantly 1)}))

(deftest ^:parallel bundled-queries-match-this-instances-mbql-schema-test
  (testing (str "GHY-4241: every query in resources/instance_analytics must import cleanly into this version. "
                "Instance analytics re-imports on every EE boot via `ensure-audit-db-installed!`, which rethrows "
                "anything that isn't lock contention, and `start-normally` turns that into `(System/exit 1)`. So a "
                "bundled query this version cannot represent is a boot crash, not a stale-content bug.")
    ;; FK resolution is stubbed out: the bundle's references point at the audit DB, which doesn't exist here, and
    ;; what's under test is the query shape rather than the resolution.
    (let [ingestion (bundle-ingestion)
          queries   (bundled-queries ingestion)
          failures  (for [[entity-id query] queries
                          :let  [error (try
                                         (serialization/import-mbql stub-store [query] {})
                                         nil
                                         (catch Exception e (ex-message e)))]
                          :when error]
                      [entity-id error])]
      (testing "the bundle was found and actually contains queries, so an empty pass can't be a false negative"
        (is (pos? (count queries))))
      (testing (str "every bundled file parses - `ingest-list` collects unreadable ones in an errors atom instead "
                    "of failing, so they would vanish from the queries above while still crashing boot")
        (is (= [] (mapv #(or (:file (ex-data %)) (ex-message %))
                        (ee.serialization/ingest-errors ingestion)))))
      (is (= [] (vec failures))))))
