(ns metabase.api.actions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.api.actions :as api.actions]
   [metabase.models.database :refer [Database]]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(comment api.actions/keep-me)

(defn mock-requests []
  [#_#_{:action       "actions/table/insert"
    :request-body {:table-id (mt/id :venues)
                   :values   {:name "Toucannery"}}
    :expected     {:insert-into "VENUES"
                   :values      {:name "Toucannery"}}}
   {:action       "actions/row/update"
    :request-body {:table-id (mt/id :venues)
                   :pk       {:id 1, :name "Red Medicine"}
                   :values   {:name "Toucannery"}}
    :expected     {:update "VENUES"
                   :set    {:name "Toucannery"}
                   :where  ["and"
                            ["=" "id" 1]
                            ["=" "name" "Red Medicine"]]}}
   {:action       "actions/row/delete"
    :request-body (mt/mbql-query categories {:filter [:= $id 1]})
    :expected     {:rows-deleted [1]}}
   {:action       "actions/row/update"
    :request-body (assoc (mt/mbql-query categories {:filter [:= $id 3]}) :update_row {:name "MyNewName"})
    :expected     {:rows-updated [1]}}])

(defn- row-action? [action]
  (str/starts-with? action "actions/row"))

(deftest happy-path-test
  (testing "Make sure it's possible to use known actions end-to-end if preconditions are satisfied"
    (actions.test-util/with-actions-test-data
      (mt/with-temporary-setting-values [experimental-enable-actions true]
        (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
          (doseq [{:keys [action request-body request-body-thunk expected]} (mock-requests)]
            (let [request-body (or request-body (request-body-thunk))]
              (testing action
                (is (= expected
                       (mt/user-http-request :crowberto :post 200 action request-body)))))))))))

;; TODO: update test for this when we get something other than categories
#_(deftest row-delete-row-with-constraint-fails-test
    (mt/with-temporary-setting-values [experimental-enable-actions true]
      (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
        (testing "Should return a 400 when deleting the row violates a foreign key constraint"
          (let [request-body (mt/mbql-query categories {:filter [:= $id 22]})]
            (mt/user-http-request :crowberto :post 400 "actions/row/delete" request-body))))))

(deftest feature-flags-test
  (testing "Disable endpoints unless both global and Database feature flags are enabled"
    (doseq [{:keys [action request-body]} (mock-requests)
            enable-global-feature-flag?   [true false]
            enable-database-feature-flag? [true false]]
      (testing action
        (mt/with-temporary-setting-values [experimental-enable-actions enable-global-feature-flag?]
          (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions enable-database-feature-flag?}}
            (cond
              (not enable-global-feature-flag?)
              (testing "Should return a 400 if global feature flag is disabled"
                (is (= "Actions are not enabled."
                       (mt/user-http-request :crowberto :post 400 action request-body))))

              (not enable-database-feature-flag?)
              (testing "Should return a 400 if Database feature flag is disabled."
                (is (re= #"^Actions are not enabled for Database [\d,]+\.$"
                         (mt/user-http-request :crowberto :post 400 action request-body)))))))))))

(deftest validation-test
  (mt/with-temporary-setting-values [experimental-enable-actions true]
    (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
      (doseq [{:keys [action request-body]} (mock-requests)
              k [:query :type]]
        (testing (str action " without " k)
          (when (row-action? action)
            (is (re= #"Value does not match schema:.*"
                     (:message (mt/user-http-request :crowberto :post 400 action (dissoc request-body k)))))))))))

(deftest row-delete-action-gives-400-when-matching-more-than-one
  (mt/with-temporary-setting-values [experimental-enable-actions true]
    (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
      (let [query-that-returns-more-than-one (mt/mbql-query venues {:filter [:> $id -10]})]
        (is (< 1 (count (mt/rows (qp/process-query query-that-returns-more-than-one)))))
        (doseq [{:keys [action]} (mock-requests)]
          (is (re= #"Sorry, this would effect \d+ rows, but you can only act on 1"
                   (:message (mt/user-http-request :crowberto :post 400 action query-that-returns-more-than-one)))))))))

(deftest four-oh-four-test
  (mt/with-temporary-setting-values [experimental-enable-actions true]
    (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions true}}
      (doseq [{:keys [action]} (mock-requests)]
        (testing action
          (testing "404 for unknown Table"
            (is (= "Failed to fetch Table 2,147,483,647: Table does not exist, or belongs to a different Database."
                   (:message (mt/user-http-request :crowberto :post 404 action (assoc (mt/mbql-query venues {:filter [:= $id 1]}) :source-table Integer/MAX_VALUE))))))))
      (testing "404 for unknown Row action"
        (is (= "Unknown row action \"fake\"."
               (:message (mt/user-http-request :crowberto :post 404 "actions/row/fake" (mt/mbql-query venues {:filter [:= $id 1]})))))))))
