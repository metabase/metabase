(ns ^:mb/driver-tests metabase.transforms.inspector.e2e-test
  "End-to-end tests for the Transform Inspector loop:
   discover → get-lens → execute cards → compute results → evaluate triggers → drill."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.inspector :as inspector]
   [metabase.transforms.inspector.core :as inspector.core]
   [metabase.transforms.test-util :as transforms.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- default-schema []
  (t2/select-one-fn :schema :model/Table :id (mt/id :orders)))

(defn- execute-card
  "Execute a card's dataset_query and return the first row."
  [card]
  (let [result (mt/process-query (:dataset_query card))]
    (first (mt/rows result))))

(defn- execute-all-cards
  "Execute all cards in a lens and compute card results.
   Returns a map of card-id -> result map."
  [lens-id lens]
  (into {}
        (pmap (fn [card]
                (let [row    (execute-card card)
                      result (inspector.core/compute-card-result
                              (keyword lens-id) card row)]
                  [(:id card) result]))
              (:cards lens))))

(defn- make-transform
  "Create a transform map for testing."
  [query target-name schema]
  {:source {:type :query
            :query query}
   :name   (str "inspector_e2e_" target-name)
   :target {:schema schema
            :name   target-name
            :type   :table}})

;;; -------------------------------------------------- Query builders --------------------------------------------------

(defn- mbql-multi-join-query
  "ORDERS INNER JOIN PEOPLE, LEFT JOIN PRODUCTS, LEFT JOIN REVIEWS.
   The 3rd LEFT JOIN (reviews on product_id) produces unmatched rows
   since not every order's product has a review."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :people))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :user_id))
                               (-> (lib.metadata/field mp (mt/id :people :id))
                                   (lib/with-join-alias "People")))]
                       :inner-join)
                      (lib/with-join-alias "People")
                      (lib/with-join-fields :all)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :products))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                               (-> (lib.metadata/field mp (mt/id :products :id))
                                   (lib/with-join-alias "Products")))])
                      (lib/with-join-alias "Products")
                      (lib/with-join-fields :all)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :reviews))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :id))
                               (-> (lib.metadata/field mp (mt/id :reviews :id))
                                   (lib/with-join-alias "Reviews")))])
                      (lib/with-join-alias "Reviews")
                      (lib/with-join-fields :all))))))

(defn- qt
  "Quote a table name for the current driver, with schema qualification.
   Uses actual physical table name from metadata."
  [s]
  (let [{:keys [name schema]} (t2/select-one [:model/Table :name :schema] :id (mt/id (keyword s)))]
    (sql.u/quote-name driver/*driver* :table schema name)))

(defn- qf
  "Quote a field/column name for the current driver.
   Uses actual physical column name from metadata."
  [table-key col-key]
  (let [col-name (t2/select-one-fn :name :model/Field :id (mt/id table-key col-key))]
    (sql.u/quote-name driver/*driver* :field col-name)))

(defn- native-multi-join-query
  "Native SQL: ORDERS INNER JOIN PEOPLE, LEFT JOIN PRODUCTS, LEFT JOIN REVIEWS."
  []
  (lib/native-query
   (mt/metadata-provider)
   (str "SELECT o.*, "
        "p." (qf :people :name) " AS person_name, "
        "p." (qf :people :state) " AS person_state, "
        "pr." (qf :products :title) " AS product_title, "
        "pr." (qf :products :category) " AS product_category, "
        "pr." (qf :products :price) " AS product_price, "
        "r." (qf :reviews :rating) " AS review_rating, "
        "r." (qf :reviews :body) " AS review_body "
        "FROM " (qt "orders") " o "
        "JOIN " (qt "people") " p ON o." (qf :orders :user_id) " = p." (qf :people :id) " "
        "LEFT JOIN " (qt "products") " pr ON o." (qf :orders :product_id) " = pr." (qf :products :id) " "
        "LEFT JOIN " (qt "reviews") " r ON o." (qf :orders :id) " = r." (qf :reviews :id))))

;;; -------------------------------------------------- Full loop helper --------------------------------------------------

(defn- run-inspector-loop
  "Run the full inspector loop for a transform:
   1. Discover available lenses
   2. For each applicable lens: get → execute cards → compute results → evaluate triggers
   3. For any fired drill triggers: get drill lens → execute its cards
   Returns a map of results for assertions."
  [transform]
  (let [discovery (inspector/discover-lenses transform)]
    (when (= :ready (:status discovery))
      (let [lens-ids (map :id (:available_lenses discovery))]
        {:discovery discovery
         :lenses
         (into {}
               (for [lens-id lens-ids]
                 (let [lens         (inspector/get-lens transform lens-id nil)
                       card-results (execute-all-cards lens-id lens)
                       triggers     (inspector.core/evaluate-triggers lens card-results)
                       drill-results
                       (into []
                             (for [{:keys [lens_id params]} (:drill_lenses triggers)]
                               (let [drill-lens         (inspector/get-lens transform lens_id params)
                                     drill-card-results (execute-all-cards lens_id drill-lens)]
                                 {:lens_id      lens_id
                                  :params       params
                                  :card-count   (count (:cards drill-lens))
                                  :card-results drill-card-results})))]
                   [lens-id {:lens         lens
                             :card-results card-results
                             :triggers     triggers
                             :drills       drill-results}])))}))))

(defn- join-step-result
  "Get the card result for join step N from a join-analysis lens result."
  [{:keys [lens card-results]} step]
  (let [card (some #(when (= step (get-in % [:metadata :join_step])) %) (:cards lens))]
    (get card-results (:id card))))

;;; -------------------------------------------------- Shared assertions --------------------------------------------------

(defn- assert-inspector-loop
  "Shared assertions for both MBQL and native e2e tests.
   source-type is :mbql or :native — drill lens assertions are MBQL-only
   since unmatched-rows lens requires preprocessed MBQL query."
  [result source-type]
  (testing "discovery succeeds with join-analysis available"
    (is (= :ready (get-in result [:discovery :status])))
    (is (>= (count (get-in result [:discovery :available_lenses])) 2))
    (is (some #(= "join-analysis" (:id %))
              (get-in result [:discovery :available_lenses]))))

  (testing "generic-summary cards return data"
    (let [{:keys [card-results]} (get-in result [:lenses "generic-summary"])]
      (is (seq card-results))
      (is (every? (fn [[_id r]] (not (get r "no_data"))) card-results))))

  (let [ja (get-in result [:lenses "join-analysis"])]
    (testing "join-analysis has 3 join steps"
      (let [step-cards (filter #(re-matches #"join-step-\d+" (:id %))
                               (get-in ja [:lens :cards]))]
        (is (= 3 (count step-cards)))))

    (testing "all join-step cards return output_count and matched_count"
      (doseq [step [1 2 3]
              :let [r (join-step-result ja step)]]
        (is (some? r) (str "join step " step " should have a result"))
        (when r
          (is (pos? (get r "output_count" 0))
              (str "step " step " should have rows"))
          (is (number? (get r "matched_count"))
              (str "step " step " should have matched_count")))))

    (testing "INNER JOIN (step 1) has 0% null rate"
      (let [r (join-step-result ja 1)]
        (when r
          (is (= 0 (get r "null_count"))
              "INNER JOIN should have no unmatched rows"))))

    (testing "LEFT JOIN reviews (step 3) has non-zero null rate"
      (let [r (join-step-result ja 3)]
        (when r
          (is (pos? (get r "null_count"))
              "LEFT JOIN reviews should have unmatched rows")
          (is (pos? (get r "null_rate"))
              "null_rate should be positive"))))

    (testing "triggers fire for LEFT JOINs with unmatched rows"
      (let [{:keys [triggers]} ja]
        (is (seq (:alerts triggers))
            "should have at least one alert")
        ;; drill lens triggers are filtered by applicability;
        ;; unmatched-rows is MBQL-only so native won't have drill triggers
        (when (= source-type :mbql)
          (is (seq (:drill_lenses triggers))
              "should have at least one drill lens trigger"))))

    (when (= source-type :mbql)
      (testing "unmatched-rows drill lens fires and its cards execute"
        (let [{:keys [drills]} ja]
          (is (seq drills) "should have drill results")
          (doseq [{:keys [lens_id card-count card-results]} drills]
            (is (= "unmatched-rows" lens_id))
            (is (pos? card-count) "drill lens should have cards")
            (is (seq card-results) "drill lens cards should produce results")))))))

;;; -------------------------------------------------- MBQL E2E --------------------------------------------------

(deftest mbql-full-inspector-loop-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table :left-join)
    (transforms.tu/with-transform-cleanup!
      [{target-name :name} {:type   :table
                            :schema (default-schema)
                            :name   "g_insp_e2e_mbql"}]
      (let [query          (mbql-multi-join-query)
            transform-data (make-transform query target-name (default-schema))]
        (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
          (transforms.execute/execute! transform {:run-method :manual})
          (transforms.tu/wait-for-table target-name 10000)
          (let [transform' (t2/select-one :model/Transform tid)
                result     (run-inspector-loop transform')]
            (assert-inspector-loop result :mbql)))))))

;;; -------------------------------------------------- Native E2E --------------------------------------------------

(deftest native-full-inspector-loop-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table :left-join)
    (transforms.tu/with-transform-cleanup!
      [{target-name :name} {:type   :table
                            :schema (default-schema)
                            :name   "g_insp_e2e_nat"}]
      (let [query          (native-multi-join-query)
            transform-data (make-transform query target-name (default-schema))]
        (mt/with-temp [:model/Transform {tid :id :as transform} transform-data]
          (transforms.execute/execute! transform {:run-method :manual})
          (transforms.tu/wait-for-table target-name 10000)
          (let [transform' (t2/select-one :model/Transform tid)
                result     (run-inspector-loop transform')]
            (assert-inspector-loop result :native)))))))
