(ns ^:mb/driver-tests metabase-enterprise.transforms.api-test
  "Tests for /api/transform endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest list-transforms-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/user-http-request :crowberto :get 200 "ee/transform")))

(deftest create-transform-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/user-http-request :crowberto :post 200 "ee/transform"
                          {:name "Gadget Products"
                           :source {:type "query"
                                    :query {:database (mt/id)
                                            :type "native",
                                            :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                                     :template-tags {}}}}
                           :target {:type "table"
                                    :database (mt/id)
                                    ;; leave out schema for now
                                    ;;:schema (str (rand-int 10000))
                                    :table "gadget_products"}})))

(deftest get-transforms-test
  (mt/test-drivers (mt/normal-drivers)
    (let [body {:name "Gadget Products"
                :description "Desc"
                :source {:type "query"
                         :query {:database (mt/id)
                                 :type "native",
                                 :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                          :template-tags {}}}}
                :target {:type "table"
                         :database (mt/id)
                         ;;:schema "transforms"
                         :table "gadget_products"}}
          resp (mt/user-http-request :crowberto :post 200 "ee/transform" body)]
      (is (=? body
              (mt/user-http-request :crowberto :get 200 (format "ee/transform/%s" (:id resp))))))))

(deftest put-transforms-test
  (mt/test-drivers (mt/normal-drivers)
    (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                     {:name "Gadget Products"
                                      :source {:type "query"
                                               :query {:database (mt/id)
                                                       :type "native",
                                                       :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                                                :template-tags {}}}}
                                      :target {:type "table"
                                               :database (mt/id)
                                               ;;:schema "transforms"
                                               :table "gadget_products"}})]
      (is (=? {:name "Gadget Products 2"
               :description "Desc"
               :source {:type "query"
                        :query {:database (mt/id)
                                :type "native",
                                :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'None'"
                                         :template-tags {}}}}
               :target {:type "table"
                        :database (mt/id)
                        :table "gadget_products"}}
              (mt/user-http-request :crowberto :put 200 (format "ee/transform/%s" (:id resp))
                                    {:name "Gadget Products 2"
                                     :description "Desc"
                                     :source {:type "query"
                                              :query {:database (mt/id)
                                                      :type "native",
                                                      :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'None'"
                                                               :template-tags {}}}}}))))))

(deftest delete-transforms-test
  (mt/test-drivers (mt/normal-drivers)
    (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                     {:name "Gadget Products"
                                      :source {:type "query"
                                               :query {:database (mt/id)
                                                       :type "native",
                                                       :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                                                :template-tags {}}}}
                                      :target {:type "table"
                                               :database (mt/id)
                                               ;;:schema "transforms"
                                               :table "gadget_products"}})]
      (mt/user-http-request :crowberto :delete 204 (format "ee/transform/%s" (:id resp)))
      (mt/user-http-request :crowberto :get 404 (format "ee/transform/%s" (:id resp))))))

(deftest delete-table-transforms-test
  (mt/test-drivers (mt/normal-drivers)
    (let [resp (mt/user-http-request :crowberto :post 200 "ee/transform"
                                     {:name "Gadget Products"
                                      :source {:type "query"
                                               :query {:database (mt/id)
                                                       :type "native",
                                                       :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                                                :template-tags {}}}}
                                      :target {:type "table"
                                               :database (mt/id)
                                               ;;:schema "transforms"
                                               :table "gadget_products"}})]
      (mt/user-http-request :crowberto :delete 200 (format "ee/transform/%s/table" (:id resp))))))
