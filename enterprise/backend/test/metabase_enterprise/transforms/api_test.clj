(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "Tests for /api/transform endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- drop-target!
  [target]
  (let [target (if (map? target)
                 target
                 ;; assume this is just a plain table name
                 {:type :table, :name target})
        driver driver/*driver*]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      (-> (driver/drop-transform-target! driver (mt/db) target)
          u/ignore-exceptions))))

(defn- gen-table-name
  [table-name-prefix]
  (if (map? table-name-prefix)
    ;; table-name-prefix is a whole target, randomize the name
    (update table-name-prefix :name gen-table-name)
    (str table-name-prefix \_ (str/replace (str (random-uuid)) \- \_))))

(defmacro with-transform-cleanup!
  "Execute `body`, then delete any new :model/Transform instances and drop tables generated from `table-gens`."
  [table-gens & body]
  (assert (seqable? table-gens) "need a seqable? as table-gens")
  (assert (even? (count table-gens)) "need an even number of forms in table-gens")
  (if-let [[sym prefix & more-gens] (seq table-gens)]
    `(let [target# (gen-table-name ~prefix)
           ~sym target#]
       (try
         (with-transform-cleanup! ~more-gens ~@body)
         (finally
           (drop-target! target#))))
    `(mt/with-model-cleanup [:model/Transform :model/Table]
       ~@body)))

(defn- make-query [category]
  (let [q (if (= :clickhouse driver/*driver*)
            (mt/mbql-query products {:filter [:= $category category]
                                     :expressions {"clickhouse_merge_table_id" $id}})
            (mt/mbql-query products {:filter [:= $category category]}))
        sql (:query (qp.compile/compile q))]
    ;; inline the parameter
    (str/replace-first sql "?" (str \' category \'))))

(comment
  (binding [driver/*driver* :clickhouse]
    (make-query "Gadget"))
  -)

(deftest create-transform-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (with-transform-cleanup! [table-name "gadget_products"]
      (mt/user-http-request :crowberto :post 200 "ee/transform"
                            {:name "Gadget Products"
                             :source {:type "query"
                                      :query {:database (mt/id)
                                              :type "native"
                                              :native {:query (make-query "Gadget")
                                                       :template-tags {}}}}
                             ;; for clickhouse (and other dbs where we do merge into), we will
                             ;; want a primary key
                             ;;:primary-key-column "id"
                             :target {:type "table"
                                      ;; leave out schema for now
                                      ;;:schema (str (rand-int 10000))
                                      :name table-name}}))))

(deftest list-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (testing "Can list without query parameters"
      (mt/user-http-request :crowberto :get 200 "ee/transform"))
    (testing "Can list with query parameters"
      (with-transform-cleanup! [table-name "gadget_products"]
        (let [body {:name "Gadget Products"
                    :description "Desc"
                    :source {:type "query"
                             :query {:database (mt/id)
                                     :type "native"
                                     :native {:query (make-query "Gadget")
                                              :template-tags {}}}}
                    :target {:type "table"
                             ;;:schema "transforms"
                             :name table-name}}
              _ (mt/user-http-request :crowberto :post 200 "ee/transform" body)
              list-resp (mt/user-http-request :crowberto :get 200 "ee/transform")]
          (is (seq list-resp)))))))

(deftest get-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [body {:name "Gadget Products"
                  :description "Desc"
                  :source {:type "query"
                           :query {:database (mt/id)
                                   :type "native"
                                   :native {:query (make-query "Gadget")
                                            :template-tags {}}}}
                  :target {:type "table"
                           ;;:schema "transforms"
                           :name table-name}}
            resp (mt/user-http-request :crowberto :post 200 "ee/transform" body)]
        (is (=? (assoc body
                       :execution_trigger "none"
                       :execution_status "never-executed"
                       :last_started_at nil
                       :last_ended_at nil)
                (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" (:id resp)))))))))

(deftest put-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [query2 (make-query "None")
            resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name "Gadget Products"
                                        :source {:type "query"
                                                 :query {:database (mt/id)
                                                         :type "native"
                                                         :native {:query (make-query "Gadget")
                                                                  :template-tags {}}}}
                                        :target {:type "table"
                                                 ;;:schema "transforms"
                                                 :name table-name}})]
        (is (=? {:name "Gadget Products 2"
                 :description "Desc"
                 :source {:type "query"
                          :query {:database (mt/id)
                                  :type "native",
                                  :native {:query query2
                                           :template-tags {}}}}
                 :target {:type "table"
                          :name table-name}
                 :execution_trigger "global-schedule"
                 :execution_status "never-executed"
                 :last_started_at nil
                 :last_ended_at nil}
                (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp))
                                      {:name "Gadget Products 2"
                                       :description "Desc"
                                       :source {:type "query"
                                                :query {:database (mt/id)
                                                        :type "native"
                                                        :native {:query query2
                                                                 :template-tags {}}}}
                                       :execution_trigger "global-schedule"})))))))

(deftest change-target-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (with-transform-cleanup! [table1-name "dookey_products"
                              table2-name "doohickey_products"]
      (let [query2 (make-query "Doohickey")
            original {:name "Gadget Products"
                      :source {:type "query"
                               :query {:database (mt/id)
                                       :type "native"
                                       :native {:query (make-query "Gadget")
                                                :template-tags {}}}}
                      :target {:type "table"
                               ;;:schema "transforms"
                               :name table1-name}}
            resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       original)
            updated {:name "Doohickey Products"
                     :description "Desc"
                     :source {:type "query"
                              :query {:database (mt/id)
                                      :type "native",
                                      :native {:query query2
                                               :template-tags {}}}}
                     :target {:type "table"
                              :name table2-name}}]
        (is (=? updated
                (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp)) updated)))
        (is (false? (transforms.util/target-table-exists? original)))))))

(deftest delete-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name "Gadget Products"
                                        :source {:type "query"
                                                 :query {:database (mt/id)
                                                         :type "native"
                                                         :native {:query (make-query "Gadget")
                                                                  :template-tags {}}}}
                                        :target {:type "table"
                                                 ;;:schema "transforms"
                                                 :name table-name}})]
        (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s" (:id resp)))
        (mt/user-http-request :crowberto :get 404 (format "ee/transform/%s" (:id resp)))))))

(deftest delete-table-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name "Gadget Products"
                                        :source {:type "query"
                                                 :query {:database (mt/id)
                                                         :type "native"
                                                         :native {:query (make-query "Gadget")
                                                                  :template-tags {}}}}
                                        :target {:type "table"
                                                 ;;:schema "transforms"
                                                 :name table-name}})]
        (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s/table" (:id resp)))))))

(defn- test-execution
  [transform-id]
  (let [resp (mt/user-http-request :crowberto :post 202 (format "ee/transform/%s/execute" transform-id))
        timeout-s 10                    ; 10 seconds is our timeout to finish execution and sync
        limit (+ (System/currentTimeMillis) (* timeout-s 1000))]
    (is (=? {:message "Transform execution started"}
            resp))
    (loop []
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info (str "Transfer execution timed out after " timeout-s " seconds") {})))
      (let [resp (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" transform-id))
            status (-> resp :execution_status keyword)]
        (when-not (contains? #{:started :exec-succeeded :sync-succeeded} status)
          (throw (ex-info (str "Transfer execution failed with status " status) {})))
        (if (= status :sync-succeeded)
          (is (some? (:table resp)))
          (do
            (Thread/sleep 100)
            (recur)))))))

(defn- check-query-results
  [table-name ids category]
  (let [table-id (t2/select-one-fn :id :model/Table :db_id (mt/id) :name table-name)
        id-field-id (t2/select-one-fn :id :model/Field :table_id table-id :position 0)
        category-field-id (t2/select-one-fn :id :model/Field :table_id table-id :position 3)]
    (is (= (mapv vector ids (repeat category))
           (mt/rows
            (mt/run-mbql-query nil
              {:source-table table-id
               :fields [[:field id-field-id nil] [:field category-field-id nil]]
               :order-by [[[:field id-field-id nil] :asc]]
               :limit 3}))))))

(deftest execute-test
  (doseq [target-type ["table" "view"]
          :let [feature (keyword "transforms" target-type)]]
    (testing (str "transform execution with " target-type " target")
      (mt/test-drivers (mt/normal-drivers-with-feature feature)
        (let [schema (t2/select-one-fn :schema :model/Table (mt/id :products))]
          (with-transform-cleanup! [{table1-name :name :as target1} {:type target-type
                                                                     :schema schema
                                                                     :name "gadget_products"}
                                    {table2-name :name :as target2} {:type target-type
                                                                     :schema schema
                                                                     :name "doohickey_products"}]
            (let [query2 (make-query "Doohickey")
                  original {:name "Gadget Products"
                            :source {:type "query"
                                     :query {:database (mt/id)
                                             :type "native"
                                             :native {:query (make-query "Gadget")
                                                      :template-tags {}}}}
                            :target target1}
                  {transform-id :id} (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                           original)
                  _ (test-execution transform-id)
                  _ (is (true? (transforms.util/target-table-exists? original)))
                  _ (check-query-results table1-name [5 11 16] "Gadget")
                  updated {:name "Doohickey Products"
                           :description "Desc"
                           :source {:type "query"
                                    :query {:database (mt/id)
                                            :type "native",
                                            :native {:query query2
                                                     :template-tags {}}}}
                           :target target2}]
              (is (=? (assoc updated
                             :execution_trigger "none"
                             :execution_status "sync-succeeded"
                             :last_started_at string?
                             :last_ended_at string?)
                      (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" transform-id) updated)))
              (test-execution transform-id)
              (is (true? (transforms.util/target-table-exists? original)))
              (is (true? (transforms.util/target-table-exists? updated)))
              (check-query-results table2-name [2 3 4] "Doohickey"))))))))
