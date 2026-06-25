(ns metabase-enterprise.remote-sync.content-hash-bench
  "Throwaway benchmark (not for CI) for the refactored metadata bookkeeping. Measures, per model type and N:
   - record-exported-metadata! : the new single batched CASE write (file_path + content_hash)
   - per-row-write!            : what the old per-row record-exported-paths! style cost
   - import-content-metadata   : the serialize pass import still needs (export gets this for free from store!)
   Run with:
     ./bin/test-agent :only '[metabase-enterprise.remote-sync.content-hash-bench/content-hash-bench]'"
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- ms [thunk] (let [s (System/nanoTime)] (thunk) (/ (- (System/nanoTime) s) 1e6)))

(defn- per-row-write!
  "The pre-refactor style: one UPDATE per entity."
  [entries]
  (doseq [e entries]
    (t2/update! :model/RemoteSyncObject {:model_type (:model_type e) :model_id (:model_id e)}
                {:file_path (:path e) :content_hash (:content_hash e)})))

(defn- bench! [model-type make-entity! n]
  (t2/delete! :model/RemoteSyncObject)
  (let [rows (vec (for [_ (range n)]
                    (let [e (make-entity!)]
                      {:model_type model-type :model_id (:id e)})))]
    (doseq [r rows]
      (t2/insert! :model/RemoteSyncObject (merge r {:model_name "x" :status "synced"
                                                    :status_changed_at (t/offset-date-time)})))
    (let [entries        (#'impl/import-content-metadata rows [])  ; serialize once -> entries
          t-serialize    (ms #(#'impl/import-content-metadata rows []))
          t-batched      (ms #(#'impl/record-exported-metadata! entries))
          t-per-row      (ms #(per-row-write! entries))]
      (println (format "%-10s N=%5d  serialize(import)=%8.1f ms   batched-write=%7.1f ms   per-row-write=%8.1f ms"
                       model-type n t-serialize t-batched t-per-row)))))

(deftest content-hash-bench
  (mt/with-premium-features #{:transforms-basic}
    (mt/with-temporary-setting-values [remote-sync-transforms true remote-sync-enabled true]
      (mt/with-temp [:model/Collection rs {:is_remote_synced true :name "RS"}
                     :model/Collection tcoll {:namespace collection/transforms-ns :location "/"}]
        (mt/db)
        (println "\n=== refactored metadata bookkeeping benchmark ===")
        (doseq [n [10 100 1000]]
          (bench! "Card"
                  #(t2/insert-returning-instance! :model/Card (assoc (mt/with-temp-defaults :model/Card)
                                                                     :collection_id (:id rs)))
                  n))
        (doseq [n [10 100 1000]]
          (bench! "Transform"
                  #(t2/insert-returning-instance! :model/Transform (assoc (mt/with-temp-defaults :model/Transform)
                                                                          :collection_id (:id tcoll)))
                  n))
        (is true)))))
