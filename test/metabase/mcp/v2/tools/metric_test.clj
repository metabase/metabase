(ns metabase.mcp.v2.tools.metric-test
  "Contract tests for the `metric_write` v2 MCP tool, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free. A metric is a Card of type `metric`, so the card write/permission stack itself is owned
   by `metabase.queries.*` and the metric shape rule by `metabase.lib.query`; this suite pins the
   tool's own contract on top of them: the `definition` query sources, the shape gate's teaching
   errors, and the refusal to retype a question into a metric."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.macros.scope :as scope]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tools the assertions below drive.
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.mcp.v2.tools.metric :as tools.metric]
   [metabase.mcp.v2.tools.query :as tools.query]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(comment tools.content/keep-me tools.metric/keep-me tools.query/keep-me)

;;; ------------------------------------------------- Harness ------------------------------------------------------

(defn- call-tool!
  "Drive `tool` through the real dispatch seam as `user` (test-user keyword or user id) with
   bearer-style `scopes` (nil = internal caller, which bypasses the scope gate). `session-id` is
   fresh per call unless the caller threads one through, so query handles are scoped like a real
   client's."
  ([user scopes tool args] (call-tool! user scopes tool args (str (random-uuid))))
  ([user scopes tool args session-id]
   (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
     (registry/call-tool scopes session-id tool args))))

(defn- tool-result
  "Decoded success payload of a tool response; throws when the call errored, so a tool-level
   error can never masquerade as a result."
  [response]
  (when (:isError response)
    (throw (ex-info (str "tool call failed: " (-> response :content first :text))
                    {:response response})))
  (-> response :content first :text json/decode+kw))

(defn- tool-error
  "Tool-level error text of a tool response; throws when the call succeeded, so a passing call
   can never satisfy an error assertion."
  [response]
  (when-not (:isError response)
    (throw (ex-info "expected a tool error, got success" {:response response})))
  (-> response :content first :text))

(defn- wire
  "Round-trip a value through JSON, producing exactly the keywordized shape tool arguments have
   after transport decoding (keyword values like :mbql/query become strings)."
  [x]
  (-> x json/encode json/decode+kw))

(def ^:private create-scope #{"agent:metric:create"})
(def ^:private write-scopes #{"agent:metric:create" "agent:metric:update"})

;;; ------------------------------------------------ Definitions ---------------------------------------------------

(defn- orders-fk
  "The portable FK path the external dialect names the orders table (or one of its fields) by."
  [& field-names]
  (into [(t2/select-one-fn :name :model/Database :id (mt/id)) "PUBLIC" "ORDERS"] field-names))

(defn- mbql5-definition
  "A hand-shaped single-stage MBQL 5 definition on orders, defaulting to one count aggregation and
   overlaying `stage-clauses` onto that stage — as an MCP client sends it: numeric source table,
   an options map on every clause."
  [& {:as stage-clauses}]
  (wire {:lib/type "mbql/query"
         :database (mt/id)
         :stages   [(merge {:lib/type     "mbql.stage/mbql"
                            :source-table (mt/id :orders)
                            :aggregation  [["count" {}]]}
                           stage-clauses)]}))

(defn- count-definition
  "The canonical valid metric: one stage, exactly one aggregation, no breakout."
  []
  (mbql5-definition))

(defn- orders-query
  "A Lib query over ORDERS — a runnable `:dataset_query` for card fixtures that only need the card
   to have one."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- orders-count-query
  "[[orders-query]] plus the single count aggregation that makes it a valid metric."
  []
  (lib/aggregate (orders-query) (lib/count)))

(defn- lib-count-definition
  "The same metric built through lib rather than by hand, so the tool is proven against a query
   that carries every `:lib/type` and uuid a lib-produced query does."
  []
  (wire (orders-count-query)))

(defn- portable-count-definition
  "The same metric in the portable external dialect — FK path source, named field refs — which is
   what `execute_query` takes and `get_content` returns."
  []
  (wire {:lib/type "mbql/query"
         :stages   [{:lib/type     "mbql.stage/mbql"
                     :source-table (orders-fk)
                     :aggregation  [["count" {}]]}]}))

(defn- temporal-breakout-definition
  "One aggregation plus a single date breakout — the other shape a metric is allowed to have."
  []
  (mbql5-definition :breakout [["field" {:temporal-unit "month"} (mt/id :orders :created_at)]]))

;;; ------------------------------------------- Argument validation ------------------------------------------------

(deftest ^:parallel malli-validation-test
  (testing "GHY-4146: schema-level failures are teaching errors from the registry, not handler crashes"
    (testing "missing method"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "metric_write" {}))
                            "Invalid arguments")))
    (testing "a method outside the enum (there is no delete — archive instead)"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "metric_write" {:method "delete"}))
                            "Invalid arguments")))
    (testing "an unknown key on the closed schema"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "metric_write" {:method "create" :bogus 1}))
                            "Invalid arguments")))
    (testing "a non-map definition never reaches the handler"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "metric_write"
                                                    {:method "create" :name "x" :definition "not a query"}))
                            "Invalid arguments")))
    (testing "card_type is not an argument — a metric_write call always writes a metric"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "metric_write"
                                                    {:method "create" :name "x" :card_type "question"
                                                     :definition (count-definition)}))
                            "Invalid arguments")))))

(deftest ^:parallel create-required-args-test
  (testing "GHY-4146: `name` is enforced at create with a teaching error naming it"
    (is (= "`name` is required when method is \"create\"."
           (tool-error (call-tool! :crowberto create-scope "metric_write"
                                   {:method "create" :definition (count-definition)})))))
  (testing "GHY-4146: create with no query source names both sources"
    (let [msg (tool-error (call-tool! :crowberto create-scope "metric_write"
                                      {:method "create" :name "metric-test no source"}))]
      (is (str/includes? msg "definition"))
      (is (str/includes? msg "query_handle"))))
  (testing "GHY-4146: create with both query sources is a teaching error, not a silent precedence rule"
    (is (re-find #"exactly one"
                 (tool-error (call-tool! :crowberto create-scope "metric_write"
                                         {:method "create" :name "metric-test two sources"
                                          :definition (count-definition)
                                          :query_handle (str (random-uuid))}))))))

(deftest ^:parallel update-required-args-test
  (testing "GHY-4146: update without id is a teaching error"
    (is (= "`id` is required when method is \"update\"."
           (tool-error (call-tool! :crowberto write-scopes "metric_write" {:method "update" :name "x"})))))
  (testing "GHY-4146: an id that is neither numeric nor a 21-char entity_id teaches the two accepted shapes"
    (is (= "Invalid id \"abc\" — pass a numeric id or a 21-character entity_id."
           (tool-error (call-tool! :crowberto write-scopes "metric_write" {:method "update" :id "abc"})))))
  (testing "GHY-4146: create-only fields on update are rejected, so a caller never believes an ignored field took effect"
    (is (= "`archived` applies to method \"update\" only — remove it from this create call."
           (tool-error (call-tool! :crowberto create-scope "metric_write"
                                   {:method "create" :name "x" :archived true
                                    :definition (count-definition)}))))))

;;; ---------------------------------------------- Create / update -------------------------------------------------

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest metric-write-lifecycle-test
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (let [created (tool-result (call-tool! :crowberto create-scope "metric_write"
                                             {:method "create"
                                              :name "metric-test lifecycle"
                                              :description "how many orders"
                                              :collection_id coll-id
                                              :definition (count-definition)}))]
        (testing "GHY-4146: create returns the metric's concise read shape plus a portable id and a link"
          (is (=? {:id            pos-int?
                   :entity_id     string?
                   :name          "metric-test lifecycle"
                   :description   "how many orders"
                   :type          "metric"
                   :collection_id coll-id
                   :archived      false
                   :url           string?}
                  created))
          (is (str/includes? (:url created) (str "/metric/" (:id created)))
              "the url points at the metric, not the generic question route"))
        (testing "GHY-4146: the row really is a metric card, not a question"
          (is (= :metric (t2/select-one-fn :type :model/Card :id (:id created)))))
        (testing "GHY-4146: update resolves an entity_id and applies only the fields passed"
          (let [updated (tool-result (call-tool! :crowberto write-scopes "metric_write"
                                                 {:method "update" :id (:entity_id created)
                                                  :name "metric-test renamed"}))]
            (is (= (:id created) (:id updated)))
            (is (= "metric-test renamed" (:name updated)))
            (is (= "how many orders" (:description updated))
                "an untouched field is not wiped by a partial update")))
        (testing "GHY-4146: the definition can be swapped for another valid metric shape"
          (tool-result (call-tool! :crowberto write-scopes "metric_write"
                                   {:method "update" :id (:id created)
                                    :definition (temporal-breakout-definition)}))
          (is (= 1 (count (get-in (t2/select-one-fn :dataset_query :model/Card :id (:id created))
                                  [:stages 0 :breakout])))))
        (testing "GHY-4146: archived true trashes and archived false restores — the only removal path"
          (is (true? (:archived (tool-result (call-tool! :crowberto write-scopes "metric_write"
                                                         {:method "update" :id (:id created) :archived true})))))
          (is (false? (:archived (tool-result (call-tool! :crowberto write-scopes "metric_write"
                                                          {:method "update" :id (:id created) :archived false}))))))))))

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest create-collection-target-test
  (mt/with-model-cleanup [:model/Card]
    (let [create! (fn [args]
                    (tool-result (call-tool! :crowberto create-scope "metric_write"
                                             (merge {:method "create" :definition (count-definition)} args))))]
      (testing "GHY-4146: omitted collection_id saves to the caller's personal collection"
        (let [personal-id (:id (collection/user->personal-collection (mt/user->id :crowberto)))]
          (is (= personal-id
                 (t2/select-one-fn :collection_id :model/Card
                                   :id (:id (create! {:name "metric-test personal"})))))))
      (testing "GHY-4146: collection_id \"root\" saves to the root collection"
        (is (nil? (t2/select-one-fn :collection_id :model/Card
                                    :id (:id (create! {:name "metric-test root" :collection_id "root"}))))))
      (testing "GHY-4146: collection_position pins the metric"
        (is (= 1 (:collection_position
                  (t2/select-one [:model/Card :collection_position]
                                 :id (:id (create! {:name "metric-test pinned"
                                                    :collection_id "root"
                                                    :collection_position 1}))))))))))

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest update-moves-collection-test
  (testing "GHY-4146: collection_id on update moves the metric"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (let [created (tool-result (call-tool! :crowberto create-scope "metric_write"
                                               {:method "create" :name "metric-test move"
                                                :collection_id "root"
                                                :definition (count-definition)}))]
          (tool-result (call-tool! :crowberto write-scopes "metric_write"
                                   {:method "update" :id (:id created) :collection_id coll-id}))
          (is (= coll-id (t2/select-one-fn :collection_id :model/Card :id (:id created)))))))))

;;; --------------------------------------------- Metric shape gate ------------------------------------------------

(deftest ^:parallel metric-shape-teaching-test
  (testing "GHY-4146: a query that isn't a valid metric is a teaching error naming the rule, never an internal error"
    (doseq [[label definition]
            {"no aggregation"           (wire {:lib/type "mbql/query"
                                               :database (mt/id)
                                               :stages   [{:lib/type     "mbql.stage/mbql"
                                                           :source-table (mt/id :orders)}]})
             "two aggregations"         (mbql5-definition :aggregation [["count" {}] ["count" {}]])
             "a non-temporal breakout"  (mbql5-definition
                                         :breakout [["field" {} (mt/id :orders :quantity)]])
             "two breakouts"            (mbql5-definition
                                         :breakout [["field" {:temporal-unit "month"} (mt/id :orders :created_at)]
                                                    ["field" {:temporal-unit "year"} (mt/id :orders :created_at)]])
             "more than one stage"      (wire {:lib/type "mbql/query"
                                               :database (mt/id)
                                               :stages   [{:lib/type     "mbql.stage/mbql"
                                                           :source-table (mt/id :orders)
                                                           :aggregation  [["count" {}]]}
                                                          {:lib/type "mbql.stage/mbql"}]})}]
      (testing label
        (let [msg (tool-error (call-tool! :crowberto create-scope "metric_write"
                                          {:method "create" :name (str "metric-test " label)
                                           :definition definition}))]
          (is (re-find #"exactly one aggregation" msg))
          (is (re-find #"at most one date" msg))
          (is (not= "Internal error" msg)))))))

;; not ^:parallel: creates a row through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest update-shape-gate-test
  (testing "GHY-4146: the shape gate runs on update too, and a rejected update leaves the metric untouched"
    (mt/with-model-cleanup [:model/Card]
      (let [created (tool-result (call-tool! :crowberto create-scope "metric_write"
                                             {:method "create" :name "metric-test update gate"
                                              :collection_id "root"
                                              :definition (count-definition)}))
            before  (t2/select-one-fn :dataset_query :model/Card :id (:id created))
            msg     (tool-error (call-tool! :crowberto write-scopes "metric_write"
                                            {:method "update" :id (:id created)
                                             :definition (mbql5-definition
                                                          :aggregation [["count" {}] ["count" {}]])}))]
        (is (re-find #"exactly one aggregation" msg))
        (is (= before (t2/select-one-fn :dataset_query :model/Card :id (:id created))))))))

(deftest ^:parallel invalid-definition-teaching-test
  (testing "GHY-4146: a definition that isn't a well-formed query is a teaching error, not an internal error"
    (let [msg (tool-error (call-tool! :crowberto create-scope "metric_write"
                                      {:method "create" :name "metric-test garbage"
                                       :definition {:not "a query"}}))]
      (is (str/includes? msg "definition"))
      (is (not= "Internal error" msg)))))

;;; ---------------------------------------------- Query sources ---------------------------------------------------

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest definition-dialects-test
  (testing "GHY-4146: every dialect an agent can hold a metric query in is accepted"
    (mt/with-model-cleanup [:model/Card]
      (doseq [[label definition] {"hand-shaped MBQL 5"          (count-definition)
                                  "a lib-produced MBQL 5 query" (lib-count-definition)
                                  "the portable external dialect execute_query takes"
                                  (portable-count-definition)}]
        (testing label
          (let [created (tool-result (call-tool! :crowberto create-scope "metric_write"
                                                 {:method "create" :name (str "metric-test " label)
                                                  :collection_id "root"
                                                  :definition definition}))]
            (is (= :metric (t2/select-one-fn :type :model/Card :id (:id created))))
            (is (= (mt/id :orders)
                   (get-in (t2/select-one-fn :dataset_query :model/Card :id (:id created))
                           [:stages 0 :source-table]))
                "the stored query names its source by numeric id whichever dialect it arrived in")))))))

(defn- mint-handle!
  "Mint a query handle the way an agent does — `execute_query` with `validate_only`, on `session-id`.
   Its response is a JSON object followed by a steering line, so only the first line is decoded."
  [session-id query]
  (let [response (call-tool! :crowberto nil "execute_query"
                             {:query query :validate_only true} session-id)]
    (when (:isError response)
      (throw (ex-info (str "execute_query failed: " (-> response :content first :text)) {:response response})))
    (-> response :content first :text str/split-lines first json/decode+kw :query_handle)))

;; not ^:parallel: creates a row through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest query-handle-source-test
  (testing "GHY-4146: a query_handle minted by execute_query saves as a metric — the agent's build-then-save flow"
    (mt/with-model-cleanup [:model/Card]
      (let [session-id (str (random-uuid))
            handle     (mint-handle! session-id (portable-count-definition))]
        (is (string? handle) "execute_query mints a handle on validate_only")
        (let [created (tool-result (call-tool! :crowberto create-scope "metric_write"
                                               {:method "create" :name "metric-test from handle"
                                                :collection_id "root"
                                                :query_handle handle}
                                               session-id))]
          (is (= :metric (t2/select-one-fn :type :model/Card :id (:id created)))))))))

(deftest ^:parallel unknown-query-handle-test
  (testing "GHY-4146: an expired or unknown handle teaches the recovery, rather than failing opaquely"
    (is (re-find #"run the query again"
                 (tool-error (call-tool! :crowberto create-scope "metric_write"
                                         {:method "create" :name "metric-test bad handle"
                                          :query_handle (str (random-uuid))}))))))

(deftest ^:parallel native-definition-rejected-test
  (testing "GHY-4146: a native (SQL) query can't be a metric — the error names question_write as the way to save it"
    (let [msg (tool-error (call-tool! :crowberto create-scope "metric_write"
                                      {:method "create" :name "metric-test native"
                                       :definition (wire {:lib/type "mbql/query"
                                                          :database (mt/id)
                                                          :stages   [{:lib/type "mbql.stage/native"
                                                                      :native   "SELECT count(*) FROM orders"}]})}))]
      (is (str/includes? msg "question_write"))
      (is (not= "Internal error" msg)))))

;;; --------------------------------------------- Round-tripping ---------------------------------------------------

(defn- read-definition!
  "The `definition` section `get_content` returns for one metric, exactly as it comes off the wire."
  [id]
  (-> (call-tool! :crowberto nil "get_content" {:items [{:type "metric" :id id}] :include ["definition"]})
      tool-result
      :results
      first
      :definition))

;; not ^:parallel: creates a row through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest definition-round-trip-test
  (testing "GHY-4146: get_content's `definition` feeds straight back into metric_write, as its description promises"
    (mt/with-model-cleanup [:model/Card]
      (let [created   (tool-result (call-tool! :crowberto create-scope "metric_write"
                                               {:method "create" :name "metric-test round-trip"
                                                :collection_id "root"
                                                :definition (temporal-breakout-definition)}))
            read-back (read-definition! (:id created))]
        (testing "the read is a full query in the portable dialect, not a bare clause"
          (is (map? read-back))
          (is (seq (:stages read-back))))
        (tool-result (call-tool! :crowberto write-scopes "metric_write"
                                 {:method "update" :id (:id created) :definition (wire read-back)}))
        (is (= 1 (count (get-in (t2/select-one-fn :dataset_query :model/Card :id (:id created))
                                [:stages 0 :breakout])))
            "the metric survives the round-trip as the same shape")))))

;;; ---------------------------------------------- Card-type guard -------------------------------------------------

(deftest ^:parallel update-rejects-non-metric-card-test
  (testing "GHY-4146: metric_write refuses to retype a question or model — the error names the tool that owns it"
    (doseq [card-type [:question :model]]
      (mt/with-temp [:model/Card {card-id :id} {:type          card-type
                                                :name          "metric-test not a metric"
                                                :dataset_query (orders-query)}]
        (testing (name card-type)
          (let [msg (tool-error (call-tool! :crowberto write-scopes "metric_write"
                                            {:method "update" :id card-id :name "nope"}))]
            (is (str/includes? msg "question_write"))
            (is (str/includes? msg (name card-type)))
            (is (= "metric-test not a metric" (t2/select-one-fn :name :model/Card :id card-id))
                "the card is untouched")))))))

;;; ----------------------------------------------- Permissions ----------------------------------------------------

(deftest ^:parallel update-not-found-test
  (testing "GHY-4146: an update against a nonexistent id is a not-found teaching error"
    (is (re-find #"not found"
                 (tool-error (call-tool! :crowberto write-scopes "metric_write"
                                         {:method "update" :id 13371337 :name "x"}))))))

;; not ^:parallel: revokes the all-users group's permissions on the temp collection
(deftest existence-oracle-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Card {metric-id :id} {:type          :metric
                                              :collection_id coll-id
                                              :dataset_query (orders-count-query)}]
    (perms/revoke-collection-permissions! (perms/all-users-group) coll-id)
    (let [norm (fn [msg] (str/replace msg #"\d+" "N"))]
      (testing "GHY-4146: an unreadable id and a nonexistent id must be indistinguishable — no existence oracle"
        (is (= (norm (tool-error (call-tool! :rasta write-scopes "metric_write"
                                             {:method "update" :id metric-id :name "x"})))
               (norm (tool-error (call-tool! :rasta write-scopes "metric_write"
                                             {:method "update" :id 13371337 :name "x"})))))))))

;;; ------------------------------------------------- Scopes -------------------------------------------------------

(deftest ^:parallel scope-gating-test
  (testing "GHY-4146: a bearer token without the create scope can't call the tool at all"
    (is (= "Insufficient scope to call tool: metric_write"
           (tool-error (call-tool! :crowberto #{"agent:search"} "metric_write"
                                   {:method "update" :id 13371337 :name "x"})))))
  (testing "GHY-4146: the create scope alone lists and calls the tool, but is refused on method: update"
    (is (re-find #"method: update"
                 (tool-error (call-tool! :crowberto create-scope "metric_write"
                                         {:method "update" :id 13371337 :name "x"})))))
  (testing "GHY-4146: with both scopes the identical call reaches the id lookup"
    (is (re-find #"not found"
                 (tool-error (call-tool! :crowberto write-scopes "metric_write"
                                         {:method "update" :id 13371337 :name "x"})))))
  (testing "GHY-4146: the wildcard the metabot permission bucket grants passes too"
    (is (re-find #"not found"
                 (tool-error (call-tool! :crowberto #{"agent:metric:*"} "metric_write"
                                         {:method "update" :id 13371337 :name "x"}))))))

(deftest ^:parallel metric-write-scopes-registered-test
  (testing "GHY-4146: both scopes the tool checks are grantable — advertised through registered-scopes"
    (is (set/subset? #{"agent:metric:create" "agent:metric:update"}
                     (registry/registered-scopes))))
  (testing "GHY-4146: the metabot NLQ permission bucket covers both"
    (let [scopes (metabot.scope/user-metabot-perms->scopes {:permission/metabot-nlq :yes})]
      (is (mcp.scope/matches? scopes "agent:metric:create"))
      (is (mcp.scope/matches? scopes "agent:metric:update")))))

(deftest ^:parallel tools-list-visibility-test
  (testing "GHY-4146: the tool is visible exactly to tokens carrying its create scope"
    (is (some #(= "metric_write" (:name %)) (registry/list-tools create-scope)))
    (is (not (some #(= "metric_write" (:name %)) (registry/list-tools #{"agent:search"}))))))

(deftest ^:parallel internal-caller-bypasses-scopes-test
  (testing "GHY-4146: a cookie-session caller (the unrestricted sentinel) is not scope-gated"
    (is (re-find #"not found"
                 (tool-error (call-tool! :crowberto #{::scope/unrestricted} "metric_write"
                                         {:method "update" :id 13371337 :name "x"}))))))
