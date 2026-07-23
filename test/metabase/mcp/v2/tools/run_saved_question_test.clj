(ns metabase.mcp.v2.tools.run-saved-question-test
  "Contract tests for the v2 `run_saved_question` tool, through the same
   [[metabase.mcp.v2.registry/call-tool]] seam the JSON-RPC route uses, so scope gating,
   nil-arg stripping, Malli validation, and teaching-error conversion are exercised on every
   call. `execute_query` keyset-cursor semantics live in `metabase.mcp.v2.query-test`; QP
   parameter-substitution semantics are the query processor's own suites — this one pins the
   tool contract: what the model receives."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.registry :as registry]
   ;; registers the run_saved_question tool for the call-tool seam below
   [metabase.mcp.v2.tools.query]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- call-run-saved-question
  ([args] (call-run-saved-question nil args))
  ([token-scopes args]
   (registry/call-tool token-scopes (str (random-uuid)) "run_saved_question" args)))

(defn- tool-result
  "The decoded JSON payload of a successful call, with the steering line (the text after the
   JSON block) under `::steering`. Throws when the call errored — a tool-level error can never
   masquerade as an empty result."
  [result]
  (when (:isError result)
    (throw (ex-info (str "Tool call errored: " (-> result :content first :text))
                    {:result result})))
  (let [[payload steering] (str/split (-> result :content first :text) #"\n" 2)]
    (assoc (json/decode+kw payload) ::steering steering)))

(defn- tool-error
  "The error text of a failed call. Throws when the call succeeded — a success can never
   satisfy an error-path assertion."
  [result]
  (when-not (:isError result)
    (throw (ex-info "Expected a tool error but the call succeeded" {:result result})))
  (-> result :content first :text))

(def ^:private cat-tag-id "aaaaaaaa-bbbb-cccc-dddd-000000000001")

(defn- variable-card
  "A native card with a `{{cat}}` text variable tag over PRODUCTS."
  [card-name]
  {:name          card-name
   :dataset_query (mt/native-query
                   {:query         "SELECT ID, CATEGORY FROM PRODUCTS WHERE CATEGORY = {{cat}} ORDER BY ID"
                    :template-tags {"cat" {:id           cat-tag-id
                                           :name         "cat"
                                           :display-name "Category"
                                           :type         :text}}})})

(defn- plain-card
  "A parameterless native card over PRODUCTS (200 rows)."
  [card-name]
  {:name          card-name
   :dataset_query (mt/native-query {:query "SELECT ID, CATEGORY FROM PRODUCTS ORDER BY ID"})})

(deftest ^:parallel run-parameterless-card-test
  (testing "a parameterless card runs by numeric id: dataset shape, row_limit cap, truncation steering, and no query_handle"
    (mt/with-temp [:model/Card {card-id :id} (plain-card "rsq parameterless")]
      (mt/with-current-user (mt/user->id :rasta)
        (let [payload (tool-result (call-run-saved-question {:id card-id :row_limit 5}))]
          (is (= 5 (:returned payload)))
          (is (= 5 (count (:rows payload))))
          (is (true? (:truncated payload)))
          (is (= "returned 5 rows — narrow with `parameters`, or `export` for the full set"
                 (::steering payload)))
          (is (= ["ID" "CATEGORY"] (map :name (:cols payload))))
          (is (every? (every-pred :name :base_type :display_name) (:cols payload)))
          (testing "this tool mints no handle and no cursor"
            (is (nil? (:query_handle payload)))
            (is (nil? (:next_cursor payload)))))))))

(deftest ^:parallel run-complete-result-not-truncated-test
  (testing "a result that fits under row_limit reports truncated: false and carries no steering line"
    (mt/with-temp [:model/Card {card-id :id} (plain-card "rsq complete")]
      (mt/with-current-user (mt/user->id :rasta)
        (let [payload (tool-result (call-run-saved-question {:id card-id :row_limit 500}))]
          (is (= 200 (:returned payload)))
          (is (false? (:truncated payload)))
          (is (nil? (::steering payload))))))))

(deftest ^:parallel entity-id-parity-test
  (testing "the same card by entity_id returns the same rows as by numeric id"
    (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} (plain-card "rsq eid parity")]
      (mt/with-current-user (mt/user->id :rasta)
        (let [by-num (tool-result (call-run-saved-question {:id card-id :row_limit 5}))
              by-eid (tool-result (call-run-saved-question {:id card-eid :row_limit 5}))]
          (is (= 21 (count card-eid)))
          (is (= (:rows by-num) (:rows by-eid))))))))

(deftest ^:parallel parameters-by-slug-and-id-test
  (testing "a parameter value is addressable by slug or by the parameter's id, with identical results"
    (mt/with-temp [:model/Card {card-id :id} (variable-card "rsq by slug and id")]
      (mt/with-current-user (mt/user->id :rasta)
        (let [by-slug (tool-result (call-run-saved-question
                                    {:id card-id :parameters [{:id "cat" :value "Widget"}]}))
              by-id   (tool-result (call-run-saved-question
                                    {:id card-id :parameters [{:id cat-tag-id :value "Widget"}]}))
              by-key  (tool-result (call-run-saved-question
                                    {:id card-id :parameters [{:slug "cat" :value "Widget"}]}))]
          (is (pos? (:returned by-slug)))
          (is (= ["Widget"] (distinct (map second (:rows by-slug)))))
          (is (= (:rows by-slug) (:rows by-id) (:rows by-key)))
          (testing "an empty parameters array is the parameterless call"
            (mt/with-temp [:model/Card {plain-id :id} (plain-card "rsq empty params")]
              (is (= (:returned (tool-result (call-run-saved-question {:id plain-id})))
                     (:returned (tool-result (call-run-saved-question {:id plain-id :parameters []}))))))))))))

(deftest ^:parallel client-target-ignored-security-test
  ;; The target-swap injection surface from the task spec: `enrich-parameters-from-card`
  ;; merges the client parameter last, so a client :target passed through verbatim would let
  ;; a caller repoint a filter at an arbitrary field. The tool must forward only the stored
  ;; :target and :type.
  (testing "a client-supplied :target and :type in a parameter have no effect on which field is filtered"
    (mt/with-temp [:model/Card {card-id :id}
                   {:name          "rsq target swap"
                    :dataset_query (mt/native-query
                                    {:query         "SELECT ID, CATEGORY FROM PRODUCTS WHERE {{cat_ff}} ORDER BY ID"
                                     :template-tags {"cat_ff" {:id           "bbbbbbbb-0000-0000-0000-000000000001"
                                                               :name         "cat_ff"
                                                               :display-name "Category"
                                                               :type         :dimension
                                                               :widget-type  :string/=
                                                               :dimension    [:field (mt/id :products :category) nil]}}})}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [clean   (tool-result (call-run-saved-question
                                    {:id card-id :parameters [{:id "cat_ff" :value ["Widget" "Gadget"]}]}))
              swapped (tool-result (call-run-saved-question
                                    {:id         card-id
                                     :parameters [{:id     "cat_ff"
                                                   :value  ["Widget" "Gadget"]
                                                   :type   "number/="
                                                   :target ["dimension" ["field" (mt/id :products :rating) nil]]}]}))]
          (is (= #{"Widget" "Gadget"} (set (map second (:rows clean)))))
          (is (= (:rows clean) (:rows swapped))
              "the injected target must not repoint the filter at RATING"))))))

(deftest ^:parallel unknown-parameter-teaching-error-test
  (testing "an unknown parameter id/slug is a teaching error naming the card's valid parameter ids and slugs"
    (mt/with-temp [:model/Card {card-id :id} (variable-card "rsq unknown param")]
      (mt/with-current-user (mt/user->id :rasta)
        (let [message (tool-error (call-run-saved-question
                                   {:id card-id :parameters [{:id "nope" :value 1}]}))]
          (is (str/includes? message "Unknown parameter \"nope\""))
          (is (str/includes? message cat-tag-id))
          (is (str/includes? message "(slug \"cat\")")))))))

(deftest ^:parallel parameter-without-id-teaching-error-test
  (testing "a parameter entry with neither id nor slug is a teaching error naming the required keys"
    (mt/with-temp [:model/Card {card-id :id} (variable-card "rsq missing id")]
      (mt/with-current-user (mt/user->id :rasta)
        (is (= "Each parameter needs an `id` — the parameter's id or slug — and a `value`."
               (tool-error (call-run-saved-question
                            {:id card-id :parameters [{:value "Widget"}]}))))))))

(deftest ^:parallel wrong-value-type-teaching-error-test
  (testing "a value whose JSON type can't satisfy the parameter's stored type is a teaching error naming value, parameter, and expectation"
    (mt/with-temp [:model/Card {card-id :id}
                   {:name          "rsq number tag"
                    :dataset_query (mt/native-query
                                    {:query         "SELECT ID FROM PRODUCTS WHERE RATING > {{min_rating}}"
                                     :template-tags {"min_rating" {:id           "cccccccc-0000-0000-0000-000000000001"
                                                                   :name         "min_rating"
                                                                   :display-name "Min rating"
                                                                   :type         :number}}})}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [message (tool-error (call-run-saved-question
                                   {:id card-id :parameters [{:id "min_rating" :value "abc"}]}))]
          (is (str/includes? message "Invalid value \"abc\""))
          (is (str/includes? message "\"min_rating\""))
          (is (str/includes? message "expected a number")))
        (testing "a numeric string satisfies a number parameter"
          (is (map? (tool-result (call-run-saved-question
                                  {:id card-id :parameters [{:id "min_rating" :value "4.5"}]})))))))))

(deftest ^:parallel non-template-tag-parameter-teaching-error-test
  (testing "a declared card parameter targeting a query dimension (not a template tag) is a teaching error, not a QP failure"
    (mt/with-temp [:model/Card {card-id :id}
                   {:name          "rsq mbql param"
                    :dataset_query (lib/query (mt/metadata-provider)
                                              (lib.metadata/table (mt/metadata-provider) (mt/id :products)))
                    :parameters    [{:id     "p1"
                                     :slug   "cat_dim"
                                     :name   "Category"
                                     :type   :string/=
                                     :target [:dimension [:field (mt/id :products :category) nil]]}]}]
      (mt/with-current-user (mt/user->id :rasta)
        (is (= "Parameter \"cat_dim\" is not backed by a template tag in the card's query and cannot be set on this path."
               (tool-error (call-run-saved-question
                            {:id card-id :parameters [{:id "cat_dim" :value "Widget"}]}))))))))

;; not ^:parallel: mutates the permission graph for the temp collection.
(deftest not-found-and-unreadable-collapse-test
  (testing "an unreadable card and a nonexistent id yield string-identical errors — no existence oracle"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "rsq hidden collection"}
                   :model/Card {hidden-id :id} (assoc (plain-card "rsq hidden card")
                                                      :collection_id coll-id)]
      (perms/revoke-collection-permissions! (perms/all-users-group) coll-id)
      (mt/with-current-user (mt/user->id :rasta)
        (let [normalize  #(str/replace %1 (str %2) "<id>")
              unreadable (tool-error (call-run-saved-question {:id hidden-id}))
              missing    (tool-error (call-run-saved-question {:id 999999999}))]
          (is (= (normalize unreadable hidden-id)
                 (normalize missing 999999999))))))))

(deftest ^:parallel scope-gating-test
  (mt/with-temp [:model/Card {card-id :id} (plain-card "rsq scope")]
    (mt/with-current-user (mt/user->id :rasta)
      (testing "a token without agent:query:execute is refused"
        (is (= "Insufficient scope to call tool: run_saved_question"
               (tool-error (call-run-saved-question #{"agent:metadata:read"} {:id card-id})))))
      (testing "the identical call succeeds once the token carries the scope"
        (is (pos? (:returned (tool-result (call-run-saved-question #{"agent:query:execute"}
                                                                   {:id card-id :row_limit 5})))))))))

(deftest ^:parallel row-limit-validation-test
  (mt/with-temp [:model/Card {card-id :id} (plain-card "rsq row limit")]
    (mt/with-current-user (mt/user->id :rasta)
      (testing "row_limit above the 2000 cap is a schema-level teaching error"
        (is (str/includes? (tool-error (call-run-saved-question {:id card-id :row_limit 3000}))
                           "row_limit: should be at most 2000")))
      (testing "an id that is neither numeric nor a 21-char entity_id is a teaching error"
        (is (= "Invalid id \"garbage\" — pass a numeric id or a 21-character entity_id."
               (tool-error (call-run-saved-question {:id "garbage"}))))))))

(deftest ^:parallel pivot-card-row-cap-test
  ;; `process-query-for-card` routes a `:display :pivot` card through
  ;; `qp.pivot/run-pivot-query`, which replaces the injected `:max-results` constraints with
  ;; its own pivot ceiling — without the tool-layer cap, a pivot card returns its full pivot
  ;; row set (hundreds of rows) with `truncated: false` and no steering.
  (testing "a pivot-display card is still capped at row_limit and reports truncation"
    (mt/with-temp [:model/Card {card-id :id}
                   {:name                   "rsq pivot"
                    :display                :pivot
                    :dataset_query          (-> (lib/query (mt/metadata-provider)
                                                           (lib.metadata/table (mt/metadata-provider) (mt/id :products)))
                                                (lib/aggregate (lib/count))
                                                (lib/breakout (lib.metadata/field (mt/metadata-provider) (mt/id :products :category)))
                                                (lib/breakout (lib.metadata/field (mt/metadata-provider) (mt/id :products :vendor))))
                    :visualization_settings {:pivot_table.column_split
                                             {:rows    ["CATEGORY"]
                                              :columns ["VENDOR"]
                                              :values  ["count"]}}}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [payload (tool-result (call-run-saved-question {:id card-id :row_limit 5}))]
          (is (= 5 (:returned payload)))
          (is (= 5 (count (:rows payload))))
          (is (true? (:truncated payload)))
          (is (some? (::steering payload))))))))
