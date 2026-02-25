(ns metabase-enterprise.transforms-runner.api-test
  "Smoke tests for runner-based transform CRUD across all registered languages."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-clojure.init]
   [metabase-enterprise.transforms-javascript.init]
   [metabase-enterprise.transforms-julia.init]
   [metabase-enterprise.transforms-python.init]
   [metabase-enterprise.transforms-r.init]
   [metabase.test :as mt]
   [metabase.transforms.crud :as transforms.crud]
   [metabase.transforms.interface :as transforms.i]))

(set! *warn-on-reflection* true)

(deftest create-runner-transform-for-all-languages-test
  (testing "Creating a transform via the API works for every registered runner language"
    (mt/with-premium-features #{:transforms :transforms-python}
      (with-redefs [transforms.crud/check-database-feature (constantly nil)]
        (doseq [lang (sort (transforms.i/runner-languages))]
          (testing (str "language: " (name lang))
            (let [response (mt/user-http-request :crowberto :post "transform"
                                                 {:name (str "Test " (name lang) " transform")
                                                  :source {:type (name lang)
                                                           :body "placeholder"
                                                           :source-tables {}
                                                           :source-database (mt/id)}
                                                  :target {:type "table"
                                                           :schema nil
                                                           :name (str (name lang) "_test_output")
                                                           :database (mt/id)}})]
              (is (pos-int? (:id response))
                  (str "Expected a transform id for " (name lang) ", got: " (pr-str response)))
              (when-let [id (:id response)]
                (mt/user-http-request :crowberto :delete (format "transform/%d" id))))))))))