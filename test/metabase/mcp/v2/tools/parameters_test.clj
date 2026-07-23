(ns metabase.mcp.v2.tools.parameters-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.parameters]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(comment metabase.mcp.v2.tools.parameters/keep-me)

(defn- call-params
  "Invoke get_parameter_values through the registry — the same seam the JSON-RPC route uses, so
   scope gating and argument validation are exercised. `token-scopes` of nil means an internal
   caller, which satisfies every scope check."
  ([args] (call-params nil args))
  ([token-scopes args]
   (registry/call-tool token-scopes "test-session" "get_parameter_values" args)))

(defn- params-text
  ([args] (params-text nil args))
  ([token-scopes args] (-> (call-params token-scopes args) :content first :text)))

(defn- params-result
  "The decoded JSON payload of a successful call. Throws on a tool-level error so a rejection can
   never masquerade as an empty value list."
  ([args] (params-result nil args))
  ([token-scopes args]
   (let [result (call-params token-scopes args)]
     (when (:isError result)
       (throw (ex-info (str "get_parameter_values returned a tool-level error: "
                            (-> result :content first :text))
                       {:result result})))
     (-> result :content first :text (str/split-lines) first json/decode+kw))))

(defn- params-error
  ([args] (params-error nil args))
  ([token-scopes args]
   (let [result (call-params token-scopes args)]
     (is (:isError result) "expected a tool-level error")
     (-> result :content first :text))))

(defn- steering-line
  "The sentence appended after the JSON payload, or nil when the response is the whole story."
  [args]
  (second (str/split-lines (params-text args))))

;;; --------------------------------------------------- Fixtures ---------------------------------------------------

(defn- table-query
  "A Lib query over `table-id` — a runnable `:dataset_query` for fixtures that only need the card
   to have one."
  [table-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp table-id))))

(defn- do-with-fixtures
  [f]
  (mt/with-temp
    [:model/Card      {source-card-id :id} {:database_id   (mt/id)
                                            :table_id      (mt/id :categories)
                                            :dataset_query (table-query (mt/id :categories))}
     :model/Dashboard {dash-id :id :as dashboard}
     {:name       "Venues"
      :parameters [{:name "Category Name" :slug "category_name" :id "_CATEGORY_NAME_" :type "category"}
                   {:name "Price" :slug "price" :id "_PRICE_" :type "category"}
                   {:name                 "Static Category"
                    :slug                 "static_category"
                    :id                   "_STATIC_"
                    :type                 "category"
                    :values_source_type   "static-list"
                    :values_source_config {:values ["African" "American" "Asian"]}}
                   {:name                 "Static Category label"
                    :slug                 "static_category_label"
                    :id                   "_STATIC_LABEL_"
                    :type                 "category"
                    :values_source_type   "static-list"
                    :values_source_config {:values [["African" "Af"] ["American" "Am"] ["Asian" "As"]]}}
                   {:name                 "Card Category"
                    :slug                 "card_category"
                    :id                   "_CARD_"
                    :type                 "category"
                    :values_source_type   "card"
                    :values_source_config {:card_id source-card-id :value_field (mt/$ids $categories.name)}}
                   ;; Wired to no dashcard at all — the backend refuses it, and the tool has to
                   ;; surface that refusal as a teaching error rather than an internal failure.
                   {:name "Unmapped" :slug "unmapped" :id "_UNMAPPED_" :type "category"}]}
     :model/Card {card-id :id} {:database_id   (mt/id)
                                :table_id      (mt/id :venues)
                                :dataset_query (table-query (mt/id :venues))}
     :model/DashboardCard _ {:card_id            card-id
                             :dashboard_id       dash-id
                             :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                   :card_id      card-id
                                                   :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                  {:parameter_id "_PRICE_"
                                                   :card_id      card-id
                                                   :target       [:dimension (mt/$ids venues $price)]}
                                                  {:parameter_id "_STATIC_"
                                                   :card_id      card-id
                                                   :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                  {:parameter_id "_STATIC_LABEL_"
                                                   :card_id      card-id
                                                   :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                  {:parameter_id "_CARD_"
                                                   :card_id      card-id
                                                   :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}
     ;; A native question whose {{name}} field filter is its only parameter — the target: "question"
     ;; path resolves it through the card's template tags.
     :model/Card native-card {:name          "Categories by name"
                              :database_id   (mt/id)
                              :query_type    :native
                              :dataset_query {:database (mt/id)
                                              :type     :native
                                              :native   {:query         "SELECT COUNT(*) FROM categories WHERE {{name}}"
                                                         :template-tags {"name" {:name         "name"
                                                                                 :display-name "Name"
                                                                                 :id           "_CARD_NAME_"
                                                                                 :type         :dimension
                                                                                 :dimension    [:field (mt/id :categories :name) nil]
                                                                                 :widget-type  :string/=}}}}}]
    (f {:dashboard   dashboard
        :native-card native-card})))

(defmacro ^:private with-fixtures [[binding] & body]
  `(mt/with-full-data-perms-for-all-users!
     (do-with-fixtures (fn [~binding] ~@body))))

;;; ---------------------------------------------------- Tests -----------------------------------------------------

(deftest dashboard-values-test
  (testing "GHY-4141: a field-backed dashboard parameter returns its column's values"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [{:keys [values returned has_more_values]}
              (params-result {:target "dashboard" :id (:id dashboard) :parameter_id "_CATEGORY_NAME_"
                              :limit 3})]
          (is (= [["African"] ["American"] ["Artisan"]] values))
          (is (= 3 returned))
          (is (true? has_more_values)))))))

(deftest dashboard-values-entity-id-test
  (testing "GHY-4141: id accepts a 21-char entity_id as well as a numeric id"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (= (params-result {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"})
               (params-result {:target "dashboard" :id (:entity_id dashboard) :parameter_id "_STATIC_"})))))))

(deftest limit-and-offset-test
  (testing "GHY-4141: limit/offset page the value list, and a truncated page says so"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [args {:target "dashboard" :id (:id dashboard) :parameter_id "_CATEGORY_NAME_" :limit 2}]
          (testing "the first page names both ways out: narrowing and the next offset"
            (is (= [["African"] ["American"]] (:values (params-result args))))
            (is (re-find #"narrow with `query`, or continue with `offset: 2`" (steering-line args))))
          (testing "offset continues where the page left off"
            (is (= [["Artisan"] ["Asian"]]
                   (:values (params-result (assoc args :offset 2)))))))))))

(deftest last-page-test
  (testing "GHY-4141: a page that reaches the end of the list carries no steering line"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [args {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"}]
          (is (= {:values          [["African"] ["American"] ["Asian"]]
                  :returned        3
                  :has_more_values false}
                 (params-result args)))
          (is (nil? (steering-line args))))))))

(deftest offset-past-end-test
  (testing "GHY-4141: an offset past the end returns nothing and says how many values there are"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [args {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_" :offset 10}]
          (is (= {:values [] :returned 0 :has_more_values false} (params-result args)))
          (is (re-find #"No values at offset 10 — 3 available" (steering-line args))))))))

(deftest static-list-test
  (testing "GHY-4141: static-list parameters return their configured values, with labels when configured"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (= [["African"] ["American"] ["Asian"]]
               (:values (params-result {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"}))))
        (is (= [["African" "Af"] ["American" "Am"] ["Asian" "As"]]
               (:values (params-result {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_LABEL_"}))))))))

(deftest card-source-test
  (testing "GHY-4141: a card-sourced parameter runs its source card"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (= [["African"] ["American"] ["Artisan"]]
               (:values (params-result {:target "dashboard" :id (:id dashboard) :parameter_id "_CARD_"
                                        :limit 3}))))))))

(deftest source-capped-test
  (testing "GHY-4141: when the source itself caps the value list, the response says so even on a full page"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (binding [custom-values/*max-rows* 3]
          (let [args {:target "dashboard" :id (:id dashboard) :parameter_id "_CARD_"}]
            (is (true? (:has_more_values (params-result args))))
            (is (re-find #"holds more values than it will return; narrow with `query`" (steering-line args))))
          (testing "and a page shorter than the capped list still reads as a floor"
            (is (re-find #"Returned 2 of at least 3"
                         (steering-line {:target "dashboard" :id (:id dashboard)
                                         :parameter_id "_CARD_" :limit 2})))))))))

(deftest query-search-test
  (testing "GHY-4141: query narrows the value list on both targets"
    (with-fixtures [{:keys [dashboard native-card]}]
      (mt/with-test-user :rasta
        (is (= [["Steakhouse"]]
               (:values (params-result {:target "dashboard" :id (:id dashboard)
                                        :parameter_id "_CATEGORY_NAME_" :query "Steak"}))))
        (is (= [["Steakhouse"]]
               (:values (params-result {:target "question" :id (:id native-card)
                                        :parameter_id "_CARD_NAME_" :query "Steak"}))))))))

(deftest question-values-test
  (testing "GHY-4141: target \"question\" resolves a card's parameters, including native template tags"
    (with-fixtures [{:keys [native-card]}]
      (mt/with-test-user :rasta
        (let [{:keys [values has_more_values]}
              (params-result {:target "question" :id (:id native-card) :parameter_id "_CARD_NAME_" :limit 3})]
          (is (= [["African"] ["American"] ["Artisan"]] values))
          (is (true? has_more_values)))))))

(deftest valueless-question-parameter-test
  (testing "GHY-4141: a question parameter with neither a values source nor a field behind it returns an
            empty list rather than an error — `card-param-values` answers nil here, which its own output
            schema rejects under dev/test instrumentation"
    (mt/with-temp [:model/Card {card-id :id}
                   {:name          "Free text"
                    :database_id   (mt/id)
                    :query_type    :native
                    :dataset_query {:database (mt/id)
                                    :type     :native
                                    :native   {:query         "SELECT 1 WHERE 1 = {{x}}"
                                               :template-tags {"x" {:name         "x"
                                                                    :display-name "X"
                                                                    :id           "_X_"
                                                                    :type         :text}}}}}]
      (mt/with-test-user :rasta
        (let [args {:target "question" :id card-id :parameter_id "_X_"}]
          (is (= {:values [] :returned 0 :has_more_values false} (params-result args)))
          (is (re-find #"No values" (steering-line args))))))))

(deftest constraints-test
  (testing "GHY-4141: constraints chain-filter this parameter against another filter's selection"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (= [["Japanese"] ["Steakhouse"]]
               (:values (params-result {:target       "dashboard"
                                        :id           (:id dashboard)
                                        :parameter_id "_CATEGORY_NAME_"
                                        :constraints  {:_PRICE_ 4}}))))))))

(deftest constraints-rejected-for-questions-test
  (testing "GHY-4141: constraints with target \"question\" is a teaching error naming the right target"
    (with-fixtures [{:keys [native-card]}]
      (mt/with-test-user :rasta
        (let [error (params-error {:target "question" :id (:id native-card)
                                   :parameter_id "_CARD_NAME_" :constraints {:_PRICE_ 4}})]
          (is (re-find #"constraints" error))
          (is (re-find #"target: \"dashboard\"" error)))))))

(deftest unknown-constraint-key-test
  (testing "GHY-4141: a constraints key that isn't a dashboard parameter is rejected, not silently dropped"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [error (params-error {:target       "dashboard"
                                   :id           (:id dashboard)
                                   :parameter_id "_CATEGORY_NAME_"
                                   :constraints  {:_NOPE_ 4}})]
          (is (re-find #"no parameter \"_NOPE_\"" error))
          (is (re-find #"_PRICE_ \(Price\)" error)))))))

(deftest unknown-parameter-id-test
  (testing "GHY-4141: an unknown parameter_id names the parameters that do exist"
    (with-fixtures [{:keys [dashboard native-card]}]
      (mt/with-test-user :rasta
        (let [error (params-error {:target "dashboard" :id (:id dashboard) :parameter_id "_NOPE_"})]
          (is (re-find #"dashboard has no parameter \"_NOPE_\"" error))
          (is (re-find #"_CATEGORY_NAME_ \(Category Name\)" error)))
        (let [error (params-error {:target "question" :id (:id native-card) :parameter_id "_NOPE_"})]
          (is (re-find #"question has no parameter \"_NOPE_\"" error))
          (is (re-find #"_CARD_NAME_" error)))))))

(deftest unmapped-parameter-test
  (testing "GHY-4141: a parameter wired to no card surfaces the backend's refusal as a teaching error"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (re-find #"does not have any Fields"
                     (params-error {:target "dashboard" :id (:id dashboard) :parameter_id "_UNMAPPED_"})))))))

(deftest permissions-test
  (testing "GHY-4141: a caller who can't read the dashboard or card gets the collapsed not-found"
    (mt/with-temp [:model/Collection collection {}
                   :model/Dashboard  {dash-id :id} {:collection_id (:id collection)
                                                    :parameters    [{:name                 "S"
                                                                     :slug                 "s"
                                                                     :id                   "_S_"
                                                                     :type                 "category"
                                                                     :values_source_type   "static-list"
                                                                     :values_source_config {:values ["a"]}}]}
                   :model/Card       {card-id :id} {:collection_id (:id collection)
                                                    :dataset_query (table-query (mt/id :venues))}]
      (mt/with-non-admin-groups-no-collection-perms collection
        (mt/with-test-user :rasta
          (is (re-find #"Dashboard .* not found"
                       (params-error {:target "dashboard" :id dash-id :parameter_id "_S_"})))
          (is (re-find #"Card .* not found"
                       (params-error {:target "question" :id card-id :parameter_id "_S_"}))))))))

(deftest scope-gate-test
  (testing "GHY-4141: the tool requires agent:resource:read"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (re-find #"Insufficient scope"
                     (params-error #{"agent:search"}
                                   {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"})))
        (is (= [["African"] ["American"] ["Asian"]]
               (:values (params-result #{"agent:resource:read"}
                                       {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"}))))))))
