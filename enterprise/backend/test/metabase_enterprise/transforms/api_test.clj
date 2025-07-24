(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "Tests for /api/transform endpoints."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
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
                 {:table table})
        driver driver/*driver*]
    (binding [api/*is-superuser?* true
              api/*current-user-id* (mt/user->id :crowberto)]
      (-> (driver/drop-table! driver (mt/id) (qualified-table-name driver target))
          u/ignore-exceptions))))

;; Eventually this can be extended to generate {:schema "s", :table "t"} shapes
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

(deftest create-transform-test
  (mt/test-drivers (mt/normal-drivers)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [query (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))]
        (mt/user-http-request :crowberto :post 200 "ee/transform"
                              {:name "Gadget Products"
                               :source {:type "query"
                                        :query {:database (mt/id)
                                                :type "native",
                                                :native {:query (:query query)
                                                         :template-tags {}}}}
                               :target {:type "table"
                                      ;; leave out schema for now
                                      ;;:schema (str (rand-int 10000))
                                        :table table-name}})))))

(deftest list-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/basic)
    (testing "Can list without query parameters"
      (mt/user-http-request :crowberto :get 200 "ee/transform"))
    (testing "Can list with query parameters"
      (with-transform-cleanup! [table-name "gadget_products"]
        (let [query (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))
              body {:name "Gadget Products"
                    :description "Desc"
                    :source {:type "query"
                             :query {:database (mt/id)
                                     :type "native",
                                     :native {:query (:query query)
                                              :template-tags {}}}}
                    :target {:type "table"
                             ;;:schema "transforms"
                             :table table-name}}
              _ (mt/user-http-request :crowberto :post 200 "ee/transform" body)
              list-resp (mt/user-http-request :crowberto :get 200 (str "ee/transform?database_id=" (mt/id)))]
          (is (seq list-resp))
          (is (every? #(= (mt/id) (:database_id %) (-> % :source :query :database))
                      list-resp)))))))

(deftest get-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/basic)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [query (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))
            body {:name "Gadget Products"
                  :description "Desc"
                  :source {:type "query"
                           :query {:database (mt/id)
                                   :type "native",
                                   :native {:query (:query query)
                                            :template-tags {}}}}
                  :target {:type "table"
                           ;;:schema "transforms"
                           :table table-name}}
            resp (mt/user-http-request :crowberto :post 200 "ee/transform" body)]
        (is (=? (assoc body
                       :database_id (mt/id)
                       :table {:name table-name
                               :id pos-int?
                               :db_id (mt/id)})
                (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" (:id resp)))))))))

(deftest put-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/basic)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [query (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))
            query2 (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))
            resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name "Gadget Products"
                                        :source {:type "query"
                                                 :query {:database (mt/id)
                                                         :type "native",
                                                         :native {:query (:query query)
                                                                  :template-tags {}}}}
                                        :target {:type "table"
                                                 ;;:schema "transforms"
                                                 :table table-name}})]
        (is (=? {:name "Gadget Products 2"
                 :description "Desc"
                 :database_id (mt/id)
                 :source {:type "query"
                          :query {:database (mt/id)
                                  :type "native",
                                  :native {:query (:query query2)
                                           :template-tags {}}}}
                 :target {:type "table"
                          :table table-name}}
                (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp))
                                      {:name "Gadget Products 2"
                                       :description "Desc"
                                       :source {:type "query"
                                                :query {:database (mt/id)
                                                        :type "native",
                                                        :native {:query (:query query2)
                                                                 :template-tags {}}}}})))))))

(deftest delete-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/basic)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [query (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))
            resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name "Gadget Products"
                                        :source {:type "query"
                                                 :query {:database (mt/id)
                                                         :type "native",
                                                         :native {:query (:query query)
                                                                  :template-tags {}}}}
                                        :target {:type "table"
                                                 ;;:schema "transforms"
                                                 :table table-name}})]
        (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s" (:id resp)))
        (mt/user-http-request :crowberto :get 404 (format "ee/transform/%s" (:id resp)))))))

(deftest delete-table-transforms-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/basic)
    (with-transform-cleanup! [table-name "gadget_products"]
      (let [query (qp.compile/compile (mt/mbql-query products {:where [:= $category "Gadget"]}))
            resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                       {:name "Gadget Products"
                                        :source {:type "query"
                                                 :query {:database (mt/id)
                                                         :type "native",
                                                         :native {:query (:query query)
                                                                  :template-tags {}}}}
                                        :target {:type "table"
                                                 ;;:schema "transforms"
                                                 :table table-name}})]
        (mt/user-http-request :crowberto :delete 200 (format "ee/transform/%s/table" (:id resp)))))))
