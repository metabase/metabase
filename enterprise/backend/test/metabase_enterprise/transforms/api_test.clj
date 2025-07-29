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
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- qualified-table-name
  [driver {:keys [schema table]}]
  (cond->> (driver/escape-alias driver table)
    (string? schema) (str (driver/escape-alias driver schema) ".")))

(defn- drop-table!
  [table]
  (let [target (if (map? table)
                 table
                 {:name table})
        driver driver/*driver*]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      (-> (driver/drop-table! driver (mt/id) (qualified-table-name driver target))
          u/ignore-exceptions))))

;; Eventually this can be extended to generate {:schema "s", :name "t"} shapes
;; depending on prefix.  For now it just generates unique names with the given
;; prefix.
(defn- gen-table-name
  [prefix]
  (str prefix \_ (str/replace (str (random-uuid)) \- \_)))

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
           (drop-table! target#))))
    `(mt/with-model-cleanup [:model/Transform]
       ~@body)))

(defn- make-query [category]
  (let [q (if (= :clickhouse driver/*driver*)
            (mt/mbql-query products {:where [:= $category category]
                                     :expressions {"clickhouse_merge_table_id" $id}})
            (mt/mbql-query products {:where [:= $category category]}))]
    (:query (qp.compile/compile q))))
(comment
  (binding [driver/*driver* :clickhouse]
    (make-query "Gadget")))

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
              list-resp (mt/user-http-request :crowberto :get 200 (str "ee/transform?database_id=" (mt/id)))]
          (is (seq list-resp))
          (is (every? #(= (mt/id) (-> % :source :query :database))
                      list-resp)))))))

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
                       :last_started_at nil
                       :last_ended_at nil
                       :live_target nil
                       :table nil)
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
                          :name table-name}}
                (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp))
                                      {:name "Gadget Products 2"
                                       :description "Desc"
                                       :source {:type "query"
                                                :query {:database (mt/id)
                                                        :type "native"
                                                        :native {:query query2
                                                                 :template-tags {}}}}})))))))

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
        (when (not= status :sync-succeeded)
          (Thread/sleep 100)
          (recur))))))

(deftest execute-test
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
            {transform-id :id} (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                     original)
            _ (test-execution transform-id)
            _ (is (true? (transforms.util/target-table-exists? original)))
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
                (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" transform-id) updated)))
        (test-execution transform-id)
        (is (false? (transforms.util/target-table-exists? original)))
        (is (true? (transforms.util/target-table-exists? updated)))))))
