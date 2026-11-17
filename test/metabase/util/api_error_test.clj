(ns metabase.util.api-error-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.api-error :as api-error]))

(deftest ^:parallel extend-response-keys-test
  (testing "lists keys as client-facing without renaming them"
    (is (= {:status-code 400, :detail {:id "bad"}, :card-id 1, :response/keys #{:detail}}
           (api-error/extend-response-keys {:status-code 400, :detail {:id "bad"}, :card-id 1} :detail))))
  (testing "adds to keys already listed"
    (is (= #{:detail :field}
           (:response/keys (-> {:detail 1, :field "x"}
                               (api-error/extend-response-keys :detail)
                               (api-error/extend-response-keys :field))))))
  (testing "works on nil"
    (is (= {:response/keys #{:detail}} (api-error/extend-response-keys nil :detail))))
  (testing "no keys leaves the data as it is"
    (is (= {:status-code 404} (api-error/extend-response-keys {:status-code 404})))))

(deftest ^:parallel response-data-test
  (testing "only the listed keys are returned"
    (is (= {:detail {:id "bad"}, :field "x"}
           (api-error/response-data {:status-code   400
                                     :query         {:secret "SELECT"}
                                     :detail        {:id "bad"}
                                     :field         "x"
                                     :response/keys #{:detail :field}}))))
  (testing "listed keys that are absent are skipped"
    (is (= {:detail 1}
           (api-error/response-data {:detail 1, :response/keys #{:detail :message}}))))
  (testing "validation `:errors` are client-facing without being listed"
    (is (= {:errors {:name "required"}}
           (api-error/response-data {:status-code 400, :errors {:name "required"}, :query {}}))))
  (testing "error codes, in either spelling, are client-facing without being listed"
    (is (= {:error-code "x", :error_code "y"}
           (api-error/response-data {:status-code 400, :error-code "x", :error_code "y", :query {}}))))
  (testing "messages, under `:message` or `:error_message`, are client-facing without being listed"
    (is (= {:message "Not allowed", :error_message "Forbidden"}
           (api-error/response-data {:status-code 403, :message "Not allowed", :error_message "Forbidden", :query {}}))))
  (testing "`:error` is client-facing without being listed"
    (is (= {:error "Invalid settings"}
           (api-error/response-data {:status-code 400, :error "Invalid settings", :query {}})))
    (is (= {:error "Invalid settings", :detail 1}
           (api-error/response-data {:error "Invalid settings", :detail 1, :response/keys #{:detail}}))))
  (testing "nothing listed returns an empty map"
    (is (= {} (api-error/response-data {:status-code 403, :query {}})))
    (is (= {} (api-error/response-data nil)))))

(deftest ^:parallel throwable->map-test
  (testing "every `:data` in the Throwable->map is reduced to its client-facing part and status code"
    (let [e (ex-info "outer" {:status-code 400, :query {:secret 1}, :detail {:a 1}, :response/keys #{:detail}}
                     (ex-info "inner" {:sql "SELECT secret"}))
          m (api-error/throwable->map e)]
      (is (= "inner" (:cause m)))
      (is (not (contains? m :data))
          "the root cause has no client-facing data")
      (is (= [{:detail {:a 1}, :status-code 400} nil]
             (map :data (:via m)))
          "`:status-code` is kept with the client-facing data")
      (is (seq (:trace m))))))
