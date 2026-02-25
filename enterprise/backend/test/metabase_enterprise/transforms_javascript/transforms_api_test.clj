(ns metabase-enterprise.transforms-javascript.transforms-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-javascript.init]
   [metabase.test :as mt]
   [metabase.transforms.crud :as transforms.crud]))

(set! *warn-on-reflection* true)

(deftest create-javascript-transform-test
  (mt/with-premium-features #{:transforms :transforms-python}
    ;; H2 doesn't declare :transforms/python support, so stub out the db feature check
    (with-redefs [transforms.crud/check-database-feature (constantly nil)]
      (let [response (mt/user-http-request :crowberto :post "transform"
                                           {:name "My JS transform"
                                            :source {:type "javascript"
                                                     :body "console.log('hello')"
                                                     :source-tables {}
                                                     :source-database (mt/id)}
                                            :target {:type "table"
                                                     :schema nil
                                                     :name "js_test_output"
                                                     :database (mt/id)}})]
        (testing "transform is created successfully"
          (is (pos-int? (:id response))
              (str "Expected a transform id, got: " (pr-str response))))
        ;; cleanup
        (when-let [id (:id response)]
          (mt/user-http-request :crowberto :delete (format "transform/%d" id)))))))
