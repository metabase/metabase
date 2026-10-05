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
  (testing "keeps the keys clients read to render an error"
    (let [client-data {:message              "Unable to update the record."
                       :status               "error-premium-feature-not-available"
                       :error                "Invalid repository URL"
                       :error_message        "Status Reason"
                       :field                "api-key"
                       :schemas              ["urn:ietf:params:scim:api:messages:2.0:Error"]
                       :detail               "Email address is already in use"
                       :branch_mismatch      true
                       :current_branch       "main"
                       :conflicts            true
                       :dirty_objects        [{:name "Local Metric"}]
                       :allowed-models       ["card"]
                       :allowed-parameters   ["date"]
                       :invalid-parameter    {:name "fake"}
                       :allowed-namespaces   ["snippets"]
                       :collection-namespace nil
                       :expected-type        "type/PK"
                       :expected             "type/Integer"
                       :actual               "type/Text"
                       :base-type            "type/Text"
                       :effective-type       "type/Instant"
                       :coercion-strategy    "Coercion/UNIXMicroSeconds->DateTime"
                       :tables               ["PUBLIC.PEOPLE"]}]
      (is (= client-data
             (api.response/ex-data->response-data
              (assoc client-data
                     :status-code          400
                     :database-id          1
                     :required-permissions {1 {:perms/view-data {2 :unrestricted}}}
                     :hm/response          {:status 400}))))))
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

(deftest ^:parallel throwable->response-map-data-test
  (testing "keeps the client-facing part of the root cause's ex-data, and its status code, under `:data`"
    (let [e (ex-info "Upload Management is a paid feature"
                     {:status-code 402
                      :status      "error-premium-feature-not-available"
                      :database-id 1})
          m (api.response/throwable->response-map e)]
      (is (= {:status-code 402, :status "error-premium-feature-not-available"}
             (:data m)))
      (is (every? #(not (contains? % :data)) (:via m)))))
  (testing "a status code alone is not worth a `:data` entry"
    (is (not (contains? (api.response/throwable->response-map
                         (ex-info "You don't have permissions to do that." {:status-code 403, :query {:database 1}}))
                        :data)))))
