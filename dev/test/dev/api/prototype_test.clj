(ns dev.api.prototype-test
  (:require
   [clojure.test :refer :all]
   [dev.api.prototype :as proto]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest create-table
  (t2/query (#'proto/create-table-query)))

(deftest e2e-test
  (let [key (name (gensym "prototype-e2e-test-"))]
    (testing "when nothing is in a key, the API returns an empty list"
      (is (empty? (mt/user-http-request :crowberto :get 200
                                        (format "dev/prototype/%s/" key)))))
    (testing "invalid ids return 404"
      (is (= "Not found." (mt/user-http-request :crowberto :get 404
                                                (format "dev/prototype/%s/9999" key)))))
    (testing "can create records in the API"
      (let [response1 (mt/user-http-request :crowberto :post 200
                                            (format "dev/prototype/%s/" key)
                                            {:type    "test1"
                                             :age     1
                                             :num-val 4
                                             :str-val "hi"})
            response2 (mt/user-http-request :crowberto :post 200
                                            (format "dev/prototype/%s/" key)
                                            {:type    "test2"
                                             :age     2
                                             :num-val 4
                                             :str-val "hi"})]
        (is (partial= {:type "test1" :age 1} response1))
        (is (pos? (:id response1)))
        (is (partial= {:type "test2" :age 2} response2))
        (is (pos? (:id response2)))
        (is (not= (:id response1) (:id response2)))
        (testing "can retrieve created records"
          (is (= {:id      (:id response1)
                  :type    "test1"
                  :age     1
                  :num-val 4
                  :str-val "hi"}
                 (mt/user-http-request :crowberto :get 200
                                       (format "dev/prototype/%s/%s" key (:id response1)))))
          (is (= {:id      (:id response2)
                  :type    "test2"
                  :age     2
                  :num-val 4
                  :str-val "hi"}
                 (mt/user-http-request :crowberto :get 200
                                       (format "dev/prototype/%s/%s" key (:id response2))))))
        (testing "Can update (replace) a record"
          (let [updated-response1 (mt/user-http-request :crowberto :put 200
                                                        (format "dev/prototype/%s/%s" key (:id response1))
                                                        {:type    "test1-updated"
                                                         :count   5
                                                         :num-val 4
                                                         :str-val "hi"})]
            (is (= {:id      (:id response1)
                    :type    "test1-updated"
                    :count   5
                    :num-val 4
                    :str-val "hi"} updated-response1)))
          (testing "Updated version is saved"
            (is (= {:id      (:id response1)
                    :type    "test1-updated"
                    :count   5
                    :num-val 4
                    :str-val "hi"}
                   (mt/user-http-request :crowberto :get 200
                                         (format "dev/prototype/%s/%s" key (:id response1))))))
          (testing "Other record is unchanged"
            (is (= {:id      (:id response2)
                    :type    "test2"
                    :age     2
                    :num-val 4
                    :str-val "hi"}
                   (mt/user-http-request :crowberto :get 200
                                         (format "dev/prototype/%s/%s" key (:id response2)))))))
        (testing "Can search for records"
          (testing "by number"
            (is (= [{:id      (:id response1)
                     :type    "test1-updated"
                     :count   5
                     :num-val 4
                     :str-val "hi"}]
                   (mt/user-http-request :crowberto :get 200
                                         (format "dev/prototype/%s/?count=5" key)))))
          (testing "by string"
            (is (= [{:id      (:id response1)
                     :type    "test1-updated"
                     :count   5
                     :num-val 4
                     :str-val "hi"}]
                   (mt/user-http-request :crowberto :get 200
                                         (format "dev/prototype/%s/?type=test1-updated" key)))))
          (testing "by two fields"
            (is (= [{:id      (:id response1)
                     :type    "test1-updated"
                     :count   5
                     :num-val 4
                     :str-val "hi"}]
                   (mt/user-http-request :crowberto :get 200
                                         (format "dev/prototype/%s/?type=test1-updated&str-val=hi" key)))))
          (testing "returning multiple records"
            (is (= [{:id      (:id response1)
                     :type    "test1-updated"
                     :count   5
                     :num-val 4
                     :str-val "hi"}
                    {:id      (:id response2)
                     :type    "test2"
                     :age     2
                     :num-val 4
                     :str-val "hi"}]
                   (mt/user-http-request :crowberto :get 200
                                         (format "dev/prototype/%s/?str-val=hi" key)))))
          (testing "No matches return empty list"
            (is (empty?
                 (mt/user-http-request :crowberto :get 200
                                       (format "dev/prototype/%s/?str-val=none" key)))))

          (testing "Can delete a record"
            (is (= {:id (:id response1)} (mt/user-http-request :crowberto :delete 200
                                                               (format "dev/prototype/%s/%s" key (:id response1)))))
            (is (= "Not found." (mt/user-http-request :crowberto :get 404
                                                      (format "dev/prototype/%s/%s" key (:id response1)))))
            (testing "Didn't delete other records"
              (is (partial= {:id (:id response2)} (mt/user-http-request :crowberto :get 200
                                                                        (format "dev/prototype/%s/%s" key (:id response2)))))))

          (testing "Can delete all records of a type"
            (is (= {:message "All records deleted" :type key}
                   (mt/user-http-request :crowberto :delete 200
                                         (format "dev/prototype/%s/all" key))))
            (is (= [] (mt/user-http-request :crowberto :get 200
                                            (format "dev/prototype/%s/" key))))))))))
