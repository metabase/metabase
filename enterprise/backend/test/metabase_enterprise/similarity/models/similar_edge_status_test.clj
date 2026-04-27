(ns metabase-enterprise.similarity.models.similar-edge-status-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.models.similar-edge-status :as similar-edge-status]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- unique-view []
  (keyword (str "ses-test-" (random-uuid))))

(deftest ^:sequential mark-running!-upserts-and-clears-error-test
  (mt/with-model-cleanup [:model/SimilarEdgeStatus]
    (let [view (unique-view)]
      (testing "first call inserts a row with :running status"
        (similar-edge-status/mark-running! view)
        (is (= {:status :running :last_error nil}
               (t2/select-one [:model/SimilarEdgeStatus :status :last_error]
                              :view view))))
      (testing "second call after a recorded error clears the error"
        (similar-edge-status/record-error! view (ex-info "boom" {:reason :test}))
        (is (= :error (t2/select-one-fn :status :model/SimilarEdgeStatus :view view)))
        (similar-edge-status/mark-running! view)
        (is (= {:status :running :last_error nil}
               (t2/select-one [:model/SimilarEdgeStatus :status :last_error]
                              :view view)))))))

(deftest ^:sequential mark-ok!-stamps-last-full-run-at-test
  (mt/with-model-cleanup [:model/SimilarEdgeStatus]
    (let [view (unique-view)]
      (similar-edge-status/mark-running! view)
      (similar-edge-status/mark-ok! view)
      (let [row (t2/select-one :model/SimilarEdgeStatus :view view)]
        (is (= :ok (:status row)))
        (is (some? (:last_full_run_at row)))
        (is (nil? (:last_error row)))))))

(deftest ^:sequential record-error!-truncates-long-messages-test
  (mt/with-model-cleanup [:model/SimilarEdgeStatus]
    (let [view (unique-view)
          long-msg (apply str (repeat 5000 "x"))
          ex (ex-info long-msg {})]
      (similar-edge-status/record-error! view ex)
      (let [{:keys [status last_error]}
            (t2/select-one [:model/SimilarEdgeStatus :status :last_error]
                           :view view)]
        (is (= :error status))
        (is (<= (count last_error) 4000))
        (is (re-find #"clojure\.lang\.ExceptionInfo" last_error))))))
