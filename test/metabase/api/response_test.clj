(ns metabase.api.response-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.response :as api.response]))

(deftest ^:parallel ex-data->response-data-test
  (testing "keeps only the keys that are part of the API error contract"
    (is (= {:errors          {:name "required"}
            :specific-errors {:name ["missing"]}
            :error-code      "locked"
            :error_code      "archived"}
           (api.response/ex-data->response-data
            {:status-code     400
             :errors          {:name "required"}
             :specific-errors {:name ["missing"]}
             :error-code      "locked"
             :error_code      "archived"
             :query           {:stages [{:native "SELECT secret FROM payroll"}]}
             :required-perms  {:perms/view-data {1 :unrestricted}}
             :actual-perms    #{"/"}
             :database-id     1}))))
  (testing "ex-data a throw site marked as authored for the client is sent whole"
    (doseq [marker [:agent-error? :api-error]]
      (is (= {marker true, :error :unknown-table, :path ["db" "PUBLIC" "T"]}
             (api.response/ex-data->response-data {marker true, :error :unknown-table, :path ["db" "PUBLIC" "T"]}))))
    (is (= {} (api.response/ex-data->response-data {:agent-error? false, :path ["db" "PUBLIC" "T"]}))))
  (testing "nil and empty ex-data"
    (is (= {} (api.response/ex-data->response-data nil)))
    (is (= {} (api.response/ex-data->response-data {})))))

(deftest ^:parallel throwable->response-map-test
  (let [inner (ex-info "inner" {:query {:native "SELECT secret FROM payroll"}})
        outer (ex-info "outer" {:required-perms {:card-ids #{167}}} inner)
        m     (api.response/throwable->response-map outer)]
    (testing "keeps the stacktrace and exception chain"
      (is (vector? (:trace m)))
      (is (= ["outer" "inner"] (map :message (:via m))))
      (is (= "inner" (:cause m))))
    (testing "drops the ex-data of every exception in the chain"
      (is (not (contains? m :data)))
      (is (every? #(not (contains? % :data)) (:via m)))
      (is (not (re-find #"payroll|167" (pr-str m)))))))
