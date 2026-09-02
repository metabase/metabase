(ns metabase.mcp.v2.tools.parameters-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.parameters]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.field.search-values-query :as search-values-query]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.test-util]
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
                   ;; Wired to no dashcard at all, so nothing can supply it values.
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

(deftest offset-past-end-of-capped-list-test
  (testing "GHY-4141: past the end of a source-capped list the steering line stays a floor — naming a
            flat total would contradict the has_more_values the payload still carries, and would read
            as an exhausted list when the source holds more"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (binding [custom-values/*max-rows* 3]
          (let [args {:target "dashboard" :id (:id dashboard) :parameter_id "_CARD_" :offset 10}]
            (is (true? (:has_more_values (params-result args))))
            (is (re-find #"narrow with `query`" (steering-line args)))
            (is (not (re-find #"3 available" (steering-line args))))))))))

(deftest query-search-test
  (testing "GHY-4141: query narrows the value list on both targets"
    (with-fixtures [{:keys [dashboard native-card]}]
      (mt/with-test-user :rasta
        (is (= [["Steakhouse"]]
               (:values (params-result {:target "dashboard" :id (:id dashboard)
                                        :parameter_id "_CATEGORY_NAME_" :query "Steak"}))))
        (is (= [["Steakhouse"]]
               (:values (params-result {:target "question" :id (:id native-card)
                                        :parameter_id "_CARD_NAME_" :query "Steak"}))))
        (testing "a search that returned everything it found does not claim more exist — the strict
                  question path counts its own rows, so reporting a floor of `true` for every query
                  would tell the agent to keep narrowing a list it already has in full"
          (let [args {:target "question" :id (:id native-card)
                      :parameter_id "_CARD_NAME_" :query "Steak"}]
            (is (false? (:has_more_values (params-result args))))
            (is (nil? (steering-line args)))))))))

(deftest blank-query-test
  (testing "GHY-4141: a whitespace-only query is a teaching error on both targets — the backends
            reject it as a non-blank string, and uninstrumented it would match nothing at all"
    (with-fixtures [{:keys [dashboard native-card]}]
      (mt/with-test-user :rasta
        (is (re-find #"`query` .* blank"
                     (params-error {:target "dashboard" :id (:id dashboard)
                                    :parameter_id "_CATEGORY_NAME_" :query "   "})))
        (is (re-find #"`query` .* blank"
                     (params-error {:target "question" :id (:id native-card)
                                    :parameter_id "_CARD_NAME_" :query "   "})))))))

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

(deftest unresolvable-constraint-key-test
  (testing "GHY-4141: a constraints key that exists but resolves to no queryable field is rejected —
            chain filtering silently drops such a key (unmapped, or mapped only via field-refs or a
            SQL text variable), handing back unnarrowed values the agent believes were filtered"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [error (params-error {:target       "dashboard"
                                   :id           (:id dashboard)
                                   :parameter_id "_CATEGORY_NAME_"
                                   :constraints  {:_UNMAPPED_ "anything"}})]
          (is (re-find #"_UNMAPPED_" error))
          (is (re-find #"queryable field" error)))))))

(deftest constraints-rejected-for-valued-target-test
  (testing "GHY-4141: constraints against a target whose values come from a static list (or card) are
            rejected — that value source never consults the chain-filter constraints, so applying them
            would be a silent no-op"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [error (params-error {:target       "dashboard"
                                   :id           (:id dashboard)
                                   :parameter_id "_STATIC_"
                                   :constraints  {:_PRICE_ 4}})]
          (is (re-find #"fixed list or a card" error)))))))

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
  (testing "GHY-4141: a dashboard filter wired to no card returns an empty value list — the same answer
            target \"question\" gives for a parameter with nothing behind it, rather than an error"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [args {:target "dashboard" :id (:id dashboard) :parameter_id "_UNMAPPED_"}]
          (is (= {:values [] :returned 0 :has_more_values false} (params-result args)))
          (is (re-find #"No values" (steering-line args))))))))

(defn- tool-manifest-entry
  []
  (some #(when (= "get_parameter_values" (:name %)) %) (registry/list-tools nil)))

(defn- tool-description
  []
  (:description (tool-manifest-entry)))

(defn- arg-description
  "The description a client sees for one argument, dug out of the published inputSchema rather than
   the Malli source — that string is what reaches the model."
  [arg]
  (->> (get-in (tool-manifest-entry) [:inputSchema :properties arg :oneOf])
       (some :description)))

(deftest offset-description-test
  (testing "GHY-4141: the offset description names the source cap and points at query — an agent paging
            a long list can't reach past the cap, and nothing else in the schema says so"
    (is (re-find #"1000" (arg-description :offset)))
    (is (re-find #"`query`" (arg-description :offset)))))

(deftest date-parameter-values-test
  (testing "GHY-4141: a date parameter mapped to a column returns that column's distinct values"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp [:model/Dashboard {dash-id :id}
                     {:parameters [{:name "Date" :slug "date" :id "_DATE_" :type "date/all-options"}]}
                     :model/Card {card-id :id} {:database_id   (mt/id)
                                                :table_id      (mt/id :checkins)
                                                :dataset_query (table-query (mt/id :checkins))}
                     :model/DashboardCard _ {:card_id            card-id
                                             :dashboard_id       dash-id
                                             :parameter_mappings [{:parameter_id "_DATE_"
                                                                   :card_id      card-id
                                                                   :target       [:dimension (mt/$ids checkins $date)]}]}]
        (mt/with-test-user :rasta
          (let [{:keys [values returned]} (params-result {:target "dashboard" :id dash-id
                                                          :parameter_id "_DATE_" :limit 3})]
            (is (= 3 returned))
            (is (every? #(re-find #"^\d{4}-\d{2}-\d{2}" (first %)) values)))))))
  (testing "GHY-4141: so the description must not promise that date parameters return none"
    (is (not (re-find #"Date and free-text parameters have no value list" (tool-description))))))

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

(deftest constraint-not-join-reachable-test
  (testing "GHY-4141: a constraint whose field has no FK join path to the target is rejected, not
            silently dropped — chain filtering would ignore it and return unnarrowed values the
            caller believes were filtered"
    (mt/with-full-data-perms-for-all-users!
      ;; The target (categories.name in test-data) and the constraint (places.name in the separate
      ;; places-cam-likes database) share no FK graph — `add-filters` can't join across databases and
      ;; silently drops the constraint. `filterable-field-ids` returns empty for this pair (verified),
      ;; so the reachability check must reject it. Loading places-cam-likes first registers that DB.
      (mt/dataset places-cam-likes
        (let [places-name-id (mt/id :places :name)]
          (mt/with-temp
            [:model/Card {places-card :id} {:database_id   (mt/id)
                                            :table_id      (mt/id :places)
                                            :dataset_query (table-query (mt/id :places))}]
            (mt/dataset test-data
              (mt/with-temp
                [:model/Dashboard {dash-id :id}
                 {:parameters [{:name "Category Name" :slug "category_name" :id "_CATEGORY_NAME_" :type "category"}
                               {:name "Place" :slug "place" :id "_PLACE_" :type "category"}]}
                 :model/Card {venues-card :id} {:database_id   (mt/id)
                                                :table_id      (mt/id :venues)
                                                :dataset_query (table-query (mt/id :venues))}
                 :model/DashboardCard _ {:card_id            venues-card
                                         :dashboard_id       dash-id
                                         :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                               :card_id      venues-card
                                                               :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}
                 :model/DashboardCard _ {:card_id            places-card
                                         :dashboard_id       dash-id
                                         :parameter_mappings [{:parameter_id "_PLACE_"
                                                               :card_id      places-card
                                                               :target       [:dimension [:field places-name-id nil]]}]}]
                (mt/with-test-user :rasta
                  (is (re-find #"no join path"
                               (params-error {:target "dashboard" :id dash-id :parameter_id "_CATEGORY_NAME_"
                                              :constraints {:_PLACE_ "x"}}))
                      "cross-database non-joinable constraint must be rejected")
                  (testing "the target's own field is still fetchable without constraints"
                    (is (seq (:values (params-result {:target "dashboard" :id dash-id
                                                      :parameter_id "_CATEGORY_NAME_"}))))))))))))))

(deftest param-values-without-table-perms-test
  (testing "GHY-4141: a caller with collection read but NO data-query permission on the underlying
            table still gets a field-backed parameter's values — the *param-values-query* relaxation
            is the whole reason this tool takes content-read scope rather than a query scope"
    (mt/with-temp
      [:model/Collection collection {}
       :model/Dashboard {dash-id :id}
       {:collection_id (:id collection)
        :parameters    [{:name "Category Name" :slug "category_name" :id "_CATEGORY_NAME_" :type "category"}]}
       :model/Card {card-id :id} {:collection_id (:id collection)
                                  :database_id   (mt/id)
                                  :table_id      (mt/id :venues)
                                  :dataset_query (table-query (mt/id :venues))}
       :model/DashboardCard _ {:card_id            card-id
                               :dashboard_id       dash-id
                               :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                     :card_id      card-id
                                                     :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}]
      ;; Grant collection read, but revoke create-queries on the database — so the caller can't author
      ;; an ad-hoc query, yet the parameter-values path (bound *param-values-query* true, which relaxes
      ;; exactly the create-queries/Field-read gate while still enforcing view-data) still returns
      ;; values. If the tool stopped binding that var, this test would flip to a permission error.
      ;; `with-restored-data-perms!` snapshots + reinstates DataPermissions in a finally — with-temp
      ;; restores rows, not perms, so without this the All Users create-queries revocation would leak
      ;; into every later test in the JVM.
      (perms.test-util/with-restored-data-perms!
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :no)
        (mt/with-test-user :rasta
          (let [{:keys [values]} (params-result {:target "dashboard" :id dash-id
                                                 :parameter_id "_CATEGORY_NAME_" :limit 3})]
            (is (= [["African"] ["American"] ["Artisan"]] values)
                "filter values come back despite the caller having no table query permission")))))))

(deftest scope-gate-test
  (testing "GHY-4141: the tool requires agent:resource:read"
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (is (re-find #"Insufficient scope"
                     (params-error #{"agent:sql:run"}
                                   {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"})))
        (is (= [["African"] ["American"] ["Asian"]]
               (:values (params-result #{"agent:content:read"}
                                       {:target "dashboard" :id (:id dashboard) :parameter_id "_STATIC_"}))))))))

;;; ------------------------------------- C1: the question path must not lie -------------------------------------

(defn- do-with-people-name-card!
  "A native question whose sole parameter (`_PN_`) is a `{{name}}` field filter on `people.name` — a column with
   more than the 1000-row field-search cap of distinct values, so the field-backed question path exercises the cap."
  [f]
  (mt/with-full-data-perms-for-all-users!
    (mt/with-temp [:model/Card {card-id :id}
                   {:name          "People by name"
                    :database_id   (mt/id)
                    :query_type    :native
                    :dataset_query {:database (mt/id)
                                    :type     :native
                                    :native   {:query         "SELECT COUNT(*) FROM people WHERE {{name}}"
                                               :template-tags {"name" {:name         "name"
                                                                       :display-name "Name"
                                                                       :id           "_PN_"
                                                                       :type         :dimension
                                                                       :dimension    [:field (mt/id :people :name) nil]
                                                                       :widget-type  :string/=}}}}}]
      (mt/with-test-user :rasta
        (f card-id)))))

(deftest question-cap-is-a-floor-test
  (testing "GHY-4141: a field-backed question parameter whose column has more distinct values than the 1000-row
            field-search cap reports has_more_values true and steers toward `query` — the underlying
            search-values-from-field-id hardcodes has_more_values false at the cap, which would tell the agent a
            truncated list is the whole column"
    (do-with-people-name-card!
     (fn [card-id]
       (let [args {:target "question" :id card-id :parameter_id "_PN_" :limit 1000}
             {:keys [returned has_more_values]} (params-result args)]
         (is (= 1000 returned) "the fetch fills the 1000-row cap")
         (is (true? has_more_values) "and the cap is reported as a floor, not a complete set")
         (is (re-find #"narrow with `query`" (steering-line args))
             "with a steering line telling the agent to narrow rather than trust the list as exhaustive"))))))

(deftest question-fetch-error-is-not-empty-values-test
  (testing "GHY-4141: a fetch error on the field-backed question path surfaces as a tool error, NOT an empty value
            list — search-values swallows the Throwable into [], which the tool would otherwise render as
            {values [] has_more_values false} + \"No values available\", telling the agent the column is empty when
            the fetch actually failed (the dashboard path re-throws; the question path must not diverge)"
    (do-with-people-name-card!
     (fn [card-id]
       (with-redefs [search-values-query/search-values-query
                     (fn [& _] (throw (ex-info "simulated warehouse timeout" {:simulated true})))]
         (let [error (params-error {:target "question" :id card-id :parameter_id "_PN_"})]
           (is (re-find #"[Ee]rror" error) "the failure is reported as an error")
           (is (not (re-find #"No values available" error))
               "and never as the no-values-available steering line")))))))

;;; --------------------------- I2: the constraint check must match what chain-filter runs ---------------------------

(deftest remapped-target-constraint-verdict-matches-fetch-test
  (testing "GHY-4141: on a Field->Field-remapped target (category_id->categories.name, the fixture's common case) the
            join-path check's verdict matches what chain-filter actually does — it accepts the price constraint AND
            that constraint genuinely narrows the values (a check that accepted a silently-dropped constraint would
            return the same values with and without it)"
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp
        [:model/Dashboard {dash-id :id}
         {:parameters [{:name "Category Name" :slug "category_name" :id "_CATEGORY_NAME_" :type "category"}
                       {:name "Price" :slug "price" :id "_PRICE_" :type "category"}]}
         :model/Card {vc :id} {:database_id (mt/id) :table_id (mt/id :venues) :dataset_query (table-query (mt/id :venues))}
         :model/DashboardCard _ {:card_id            vc
                                 :dashboard_id       dash-id
                                 :parameter_mappings [{:parameter_id "_CATEGORY_NAME_" :card_id vc
                                                       :target [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                      {:parameter_id "_PRICE_" :card_id vc
                                                       :target [:dimension (mt/$ids venues $price)]}]}]
        (mt/with-test-user :rasta
          (let [base        {:target "dashboard" :id dash-id :parameter_id "_CATEGORY_NAME_"}
                unnarrowed  (:values (params-result base))
                narrowed    (:values (params-result (assoc base :constraints {:_PRICE_ 4})))]
            (is (= [["Japanese"] ["Steakhouse"]] narrowed)
                "the check accepts the constraint and it narrows to price=4's categories")
            (is (not= (count unnarrowed) (count narrowed))
                "which is a real narrowing — the accepted constraint was not silently dropped")))))))

(deftest multi-field-target-constraint-intersection-test
  (testing "GHY-4141: for a multi-field target the constraint must be reachable from EVERY target field, not just one.
            _MULTI_ is mapped to categories.name (which price reaches via venues) AND people.name (which it does not).
            The fetch runs a chain-filter per field and unions values, so accepting the constraint would apply it on
            the categories run but silently drop it on the people run, leaking every unnarrowed person name into the
            result. The check must reject."
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp
        [:model/Dashboard {dash-id :id}
         {:parameters [{:name "Multi" :slug "multi" :id "_MULTI_" :type "category"}
                       {:name "Price" :slug "price" :id "_PRICE_" :type "category"}]}
         :model/Card {venues-card :id} {:database_id (mt/id) :table_id (mt/id :venues) :dataset_query (table-query (mt/id :venues))}
         :model/Card {people-card :id} {:database_id (mt/id) :table_id (mt/id :people) :dataset_query (table-query (mt/id :people))}
         ;; _MULTI_ reaches price only through the venues card; the people card's run cannot.
         :model/DashboardCard _ {:card_id            venues-card
                                 :dashboard_id       dash-id
                                 :parameter_mappings [{:parameter_id "_MULTI_" :card_id venues-card
                                                       :target [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                      {:parameter_id "_PRICE_" :card_id venues-card
                                                       :target [:dimension (mt/$ids venues $price)]}]}
         :model/DashboardCard _ {:card_id            people-card
                                 :dashboard_id       dash-id
                                 :parameter_mappings [{:parameter_id "_MULTI_" :card_id people-card
                                                       :target [:dimension (mt/$ids people $name)]}]}]
        (mt/with-test-user :rasta
          (testing "the constraint reachable from only some target fields is rejected, not silently applied"
            (let [error (params-error {:target       "dashboard"
                                       :id           dash-id
                                       :parameter_id "_MULTI_"
                                       :constraints  {:_PRICE_ 4}})]
              (is (re-find #"_PRICE_" error))
              (is (re-find #"silently ignore it" error))))
          (testing "and without any constraint the multi-field target still returns its values"
            (is (seq (:values (params-result {:target "dashboard" :id dash-id :parameter_id "_MULTI_"}))))))))))

(deftest unparseable-date-constraint-test
  (testing "GHY-4141: a constraint on a temporal field whose value isn't a date string chain filtering can parse is
            rejected, not silently dropped. `chain-filter/add-filter` takes a date branch for a string value on a
            temporal field and catches a parse failure into `nil`, dropping that filter — so the fetch returns
            unnarrowed values the agent believes were filtered. This is the same silent-drop class as the unmapped
            and unreachable cases, reached through the value rather than the field."
    (mt/with-full-data-perms-for-all-users!
      (mt/with-temp
        [:model/Dashboard {dash-id :id}
         {:parameters [{:name "Venue" :slug "venue" :id "_VENUE_" :type "category"}
                       {:name "Date" :slug "date" :id "_DATE_" :type "date/all-options"}]}
         :model/Card {checkins-card :id} {:database_id   (mt/id)
                                          :table_id      (mt/id :checkins)
                                          :dataset_query (table-query (mt/id :checkins))}
         :model/DashboardCard _ {:card_id            checkins-card
                                 :dashboard_id       dash-id
                                 :parameter_mappings [{:parameter_id "_VENUE_" :card_id checkins-card
                                                       :target [:dimension (mt/$ids checkins $venue_id)]}
                                                      {:parameter_id "_DATE_" :card_id checkins-card
                                                       :target [:dimension (mt/$ids checkins $date)]}]}]
        (mt/with-test-user :rasta
          (let [base {:target "dashboard" :id dash-id :parameter_id "_VENUE_"}]
            (testing "an unparseable date value is rejected"
              (let [error (params-error (assoc base :constraints {:_DATE_ "sometime last spring"}))]
                (is (re-find #"_DATE_" error))
                (is (re-find #"date" error))))
            (testing "a parseable date range is still accepted, and genuinely narrows"
              (let [unnarrowed (:values (params-result base))
                    narrowed   (:values (params-result (assoc base :constraints
                                                              {:_DATE_ "2015-01-01~2015-01-31"})))]
                (is (seq narrowed) "the constrained fetch still returns values")
                (is (< (count narrowed) (count unnarrowed))
                    "and fewer than the unconstrained fetch — the accepted constraint was applied")))))))))

(deftest constraints-with-query-test
  (testing "GHY-4141: constraints and `query` narrow together — the search runs inside the chain-filtered set rather
            than over the whole column. This is the tool's only route through `chain-filter-search` with constraints
            (and the `*allow-implicit-uuid-field-remapping*` binding the search path pins), and neither
            constraints-test nor query-search-test reaches it."
    (with-fixtures [{:keys [dashboard]}]
      (mt/with-test-user :rasta
        (let [base {:target "dashboard" :id (:id dashboard) :parameter_id "_CATEGORY_NAME_"}]
          (testing "both narrowings apply"
            (is (= [["Steakhouse"]]
                   (:values (params-result (assoc base :query "Steak" :constraints {:_PRICE_ 4}))))))
          (testing "a value matching the query but excluded by the constraint is absent — the constraint is not
                    dropped just because a query is also present"
            (is (= [["African"]] (:values (params-result (assoc base :query "African"))))
                "African is a real category, so the query alone finds it")
            (is (= [] (:values (params-result (assoc base :query "African" :constraints {:_PRICE_ 4}))))
                "but no price-4 venue is African, so the chain-filtered search excludes it")))))))

(deftest no-match-for-query-blames-the-query-test
  (testing "GHY-4141: when a `query` matches nothing the steering line must name the query as the reason. The
            generic zero-values sentence offers only causes the agent can't act on — empty source, sandboxed away,
            free-text filter — and reads as \"this parameter is broken\" when the actual recovery is to search for
            something else. Both targets, since both reach the same line."
    (with-fixtures [{:keys [dashboard native-card]}]
      (mt/with-test-user :rasta
        (doseq [args [{:target "dashboard" :id (:id dashboard) :parameter_id "_CATEGORY_NAME_" :query "zzzznope"}
                      {:target "question" :id (:id native-card) :parameter_id "_CARD_NAME_" :query "zzzznope"}]]
          (testing (:target args)
            (is (= {:values [] :returned 0 :has_more_values false} (params-result args)))
            (let [line (steering-line args)]
              (is (re-find #"zzzznope" line)
                  "the line quotes the search that found nothing")
              (is (not (re-find #"source may be empty" line))
                  "and doesn't offer causes that can't explain a failed search"))))))))
