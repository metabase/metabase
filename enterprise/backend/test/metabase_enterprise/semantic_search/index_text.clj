(ns metabase-enterprise.semantic-search.index-text
  (:require
   #_{:clj-kondo/ignore [:metabase/modules]}
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [nano-id.core :as nano-id]
   [toucan2.core :as t2]))

(def ^:private mock-embeddings
  "Static mapping from strings to 4-dimensional embedding vectors for testing"
  {;; Document embeddings
   "This is a test document about analytics" [0.12 -0.34 0.56 -0.78]
   "Dashboard showing sales metrics and KPIs" [0.23 0.45 -0.67 0.89]
   "Test card for analytics" [0.11 -0.22 0.33 -0.44]
   "Dashboard with metrics" [0.55 0.66 -0.77 0.88]
   "Minimal test document" [0.10 0.20 -0.30 0.40]
   "Text to be embedded" [0.15 -0.25 0.35 -0.45]
   "Customer Satisfaction" [0.31 0.42 -0.53 0.64]
   "The Latest Revenue Projections" [0.75 -0.86 0.97 -0.18]
   "Projected Revenue" [0.29 0.38 -0.47 0.56]
   "Employee Satisfaction" [0.65 -0.74 0.83 -0.92]
   "Projected Satisfaction" [0.17 0.28 -0.39 0.50]

   ;; Query embeddings
   "How happy is the team?" [0.65 -0.74 0.84 -0.91]})

(defmacro ^:private with-mocked-embeddings [& body]
  ;; TODO: it's warning about not using with-redefs outside of tests but we *are* using it in tests
  #_:clj-kondo/ignore
  `(with-redefs [semantic.embedding/pull-model (fn [] nil)
                 semantic.embedding/get-embedding (fn [text#]
                                                    (get mock-embeddings text# [0.01 0.02 0.03 0.04]))]
     ~@body))

(def ^:private init-delay
  (delay
    (when-not @semantic.db/data-source
      (semantic.db/init-db!))))

(defn- once-fixture [f]
  (when semantic.db/db-url
    @init-delay
    (f)))

(use-fixtures :once once-fixture)

(defmacro ^:private with-temp-index-table [& body]
  `(let [test-table-name# (keyword (str "test_search_index_" (nano-id/nano-id)))]
     (binding [semantic.index/*index-table-name* test-table-name#
               semantic.index/*vector-dimensions* 4]
       (try
         (semantic.index/create-index-table! {:force-reset? true})
         ~@body
         (finally
           (try
             (semantic.index/drop-index-table!)
             (catch Exception e#
               (log/error "Warning: failed to clean up test table" test-table-name# ":" (.getMessage e#)))))))))

(defmacro with-index
  "Ensure a clean, small index for testing."
  [& body]
  `(with-temp-index-table
     (binding [search.ingestion/*force-sync* true]
       (mt/dataset ~(symbol "test-data")
         ;; Sneaky trick so make sure we have a user with ID 1
         (mt/with-temp [:model/User       {}            (when-not (t2/exists? :model/User 1) {:id 1})
                        :model/Collection {col-id# :id} {:name "Collection"}
                        :model/Card       {}            {:name "Customer Satisfaction"          :collection_id col-id#}
                        :model/Card       {}            {:name "The Latest Revenue Projections" :collection_id col-id#}
                        :model/Card       {}            {:name "Projected Revenue"              :collection_id col-id#}
                        :model/Card       {}            {:name "Employee Satisfaction"          :collection_id col-id#}
                        :model/Card       {}            {:name "Projected Satisfaction"         :collection_id col-id#}
                        :model/Database   {db-id# :id}  {:name "Indexed Database"}
                        :model/Table      {}            {:name "Indexed Table", :db_id db-id#}]
           (search.core/reindex! :search.engine/semantic {:force-reset true})
           ~@body)))))

(deftest basic-query-test
  (testing "A simple query against the test index returns expected results"
    (mt/as-admin
      (with-mocked-embeddings
        (with-index
          (let [query-results (semantic.index/query-index {:search-string "How happy is the team?"})]
            (is (= "Employee Satisfaction" (-> query-results first :name)))))))))
