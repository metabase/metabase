(ns metabase.revisions.spec-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.models.resolution :as models.resolution]
   [metabase.models.spec-test-util :as spec-test-util]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]))

(use-fixtures :once (fixtures/initialize :db))

(defn- revisioned-models!
  "The revisioned models of Metabase, once all of them have loaded."
  []
  (spec-test-util/load-models!)
  (filter models.resolution/model->namespace (revisions.spec/revisioned-models)))

(deftest spec-columns-test
  (doseq [model (revisioned-models!)
          :let  [{:keys [track skip]} (revisions.spec/spec model)]]
    (testing (str model)
      (testing "lists no column twice, and none of the columns that no spec lists"
        (is (= (count (concat track skip)) (count (set (concat track skip)))))
        (is (empty? (filter revisions.spec/implicit-columns (concat track skip)))))
      (testing "lists each column of its table under `:track` or `:skip`: put a new column where it belongs"
        (is (= (set/difference (spec-test-util/table-columns model) revisions.spec/implicit-columns)
               (set (concat track skip))))))))

(deftest schema-test
  (doseq [model (revisioned-models!)
          :let  [{:keys [track schema snapshot]} (revisions.spec/spec model)]]
    (testing (str model)
      (testing "has a schema of its snapshots, registered as `::<model>.revision`"
        (is (some? schema))
        (is (str/ends-with? (name schema) ".revision"))
        (is (some? (mr/registered-schema schema))))
      (testing "lists no top-level `:id`, which the after-select of Revision drops from every snapshot it reads"
        (is (not (contains? (set (revisions.spec/schema-keys schema)) :id))))
      (testing "lists each tracked column in it, and other keys only when the spec adds them to its snapshots"
        (let [keys* (set (revisions.spec/snapshot-keys model))]
          (is (set/subset? (set track) keys*))
          (when-not snapshot
            (is (= (set track) keys*))))))))
