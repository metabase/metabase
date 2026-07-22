(ns metabase.mcp.v2.tools.definitions-test
  "Contract tests for the `segment_write` and `measure_write` v2 MCP tools, driven through
   [[metabase.mcp.v2.registry/call-tool]] — the same seam the JSON-RPC route uses — so scope
   gating, `drop-nil-args`, Malli validation, and teaching-error conversion are exercised for
   free. Segment/measure domain semantics (definition normalization, revision diffs, the
   permission predicates themselves) are owned by `metabase.segments.api-test`,
   `metabase.measures.api-test`, and the model tests; this suite pins the tools' contract on
   top of them."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.registry :as registry]
   ;; Registers the tools the assertions below drive.
   [metabase.mcp.v2.tools.content :as tools.content]
   [metabase.mcp.v2.tools.definitions :as tools.definitions]
   [metabase.measures.api :as measures.api]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.permissions.core :as perms]
   [metabase.segments.api :as segments.api]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(comment tools.content/keep-me tools.definitions/keep-me)

;;; ------------------------------------------------- Harness ------------------------------------------------------

(defn- call-tool!
  "Drive `tool` through the real dispatch seam as `user` (test-user keyword or user id) with
   bearer-style `scopes` (nil = internal caller, which bypasses the scope gate)."
  [user scopes tool args]
  (mt/with-current-user (if (keyword? user) (mt/user->id user) user)
    (registry/call-tool scopes nil tool args)))

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

(defn- venues-filter-definition
  "A real MBQL 5 lib query on venues holding one filter, in wire shape."
  []
  (let [mp (mt/metadata-provider)]
    (wire (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
              (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 3))))))

(defn- venues-count-definition
  "A real MBQL 5 lib query on venues holding one count aggregation, in wire shape."
  []
  (let [mp (mt/metadata-provider)]
    (wire (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
              (lib/aggregate (lib/count))))))

(defn- count-definition
  "Hand-shaped single-aggregation MBQL 5 definition on `table-id`, as an MCP client would send it."
  [table-id]
  {:lib/type "mbql/query"
   :database (mt/id)
   :stages   [{:lib/type     "mbql.stage/mbql"
               :source-table table-id
               :aggregation  [["count" {}]]}]})

(def ^:private mbql4-fragment
  {:filter ["=" 1 1]})

(defn- latest-revision-message
  [model-name id]
  (t2/select-one-fn :message :model/Revision
                    :model model-name :model_id id
                    {:order-by [[:id :desc]]}))

(defn- read-definition!
  "The `definition` section `get_content` returns for one item, exactly as it comes off the wire.
   Driven through the real dispatch seam so the assertions see the shape an agent sees."
  [type id]
  (-> (call-tool! :crowberto nil "get_content" {:items [{:type type :id id}] :include ["definition"]})
      tool-result
      :results
      first
      :definition))

(defn- venues-fk
  "The portable FK path the external dialect names the venues table (or one of its fields) by."
  [& field-names]
  (into [(t2/select-one-fn :name :model/Database :id (mt/id)) "PUBLIC" "VENUES"] field-names))

(defn- without-uuids
  "Strip `lib/uuid`s, which are regenerated on every resolve and so are never equal across a
   round-trip even when the query is."
  [x]
  (cond
    (map? x)        (into {} (map (fn [[k v]] [k (without-uuids v)])) (dissoc x :lib/uuid))
    (sequential? x) (mapv without-uuids x)
    :else           x))

;;; ------------------------------------------- Argument validation ------------------------------------------------

(deftest ^:parallel malli-validation-test
  (testing "GHY-4137: schema-level failures are teaching errors from the registry, not handler crashes"
    (testing "missing method"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "segment_write" {}))
                            "Invalid arguments")))
    (testing "a method outside the enum (there is no delete — archive instead)"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "segment_write" {:method "delete"}))
                            "Invalid arguments")))
    (testing "an unknown key on the closed schema"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "measure_write" {:method "create" :bogus 1}))
                            "Invalid arguments")))
    (testing "a string table_id — tables have no entity_ids, only numeric ids"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "segment_write"
                                                    {:method "create" :table_id "abc"
                                                     :name "x" :definition mbql4-fragment}))
                            "Invalid arguments")))))

(deftest ^:parallel create-required-args-test
  (testing "GHY-4137: each \"(create)\" field is enforced at runtime with a teaching error naming it"
    (doseq [tool    ["segment_write" "measure_write"]
            missing [:table_id :name :definition]]
      (testing (str tool " without " (name missing))
        (let [args (dissoc {:method "create" :table_id (mt/id :venues) :name "x" :definition mbql4-fragment}
                           missing)]
          (is (= (format "`%s` is required when method is \"create\"." (name missing))
                 (tool-error (call-tool! :crowberto nil tool args)))))))))

(deftest ^:parallel update-required-args-test
  (doseq [tool ["segment_write" "measure_write"]]
    (testing tool
      (testing "GHY-4137: update without id is a teaching error"
        (is (= "`id` is required when method is \"update\"."
               (tool-error (call-tool! :crowberto nil tool {:method "update" :revision_message "x"})))))
      (testing "GHY-4137: update without revision_message is the tool's own teaching error, never the bare REST 400"
        (is (re-find #"`revision_message` is required"
                     (tool-error (call-tool! :crowberto nil tool {:method "update" :id 13371337 :description "d"})))))
      (testing "GHY-4137: a whitespace-only revision_message is rejected the same way"
        (is (re-find #"`revision_message` is required"
                     (tool-error (call-tool! :crowberto nil tool {:method "update" :id 13371337 :revision_message " "}))))))))

(deftest ^:parallel method-exclusive-args-test
  (doseq [tool ["segment_write" "measure_write"]]
    (testing tool
      (testing "GHY-4137: update-only fields on create are rejected, so a caller never believes an ignored field took effect"
        (doseq [[k v] {:id 1, :archived true, :revision_message "x"}]
          (is (= (format "`%s` applies to method \"update\" only — remove it from this create call." (name k))
                 (tool-error (call-tool! :crowberto nil tool
                                         {:method "create" :table_id (mt/id :venues) :name "x"
                                          :definition mbql4-fragment
                                          k v}))))))
      (testing "GHY-4137: table_id on update is rejected — the server derives it from the definition"
        (is (= "`table_id` cannot be changed on update — the server derives it from `definition`'s source table."
               (tool-error (call-tool! :crowberto nil tool
                                       {:method "update" :id 13371337 :revision_message "x"
                                        :table_id (mt/id :venues)}))))))))

(deftest ^:parallel invalid-id-shape-test
  (testing "GHY-4137: an id that is neither numeric nor a 21-char entity_id teaches the two accepted shapes"
    (is (= "Invalid id \"abc\" — pass a numeric id or a 21-character entity_id."
           (tool-error (call-tool! :crowberto nil "segment_write"
                                   {:method "update" :id "abc" :revision_message "x"}))))))

;;; ---------------------------------------------- segment_write ---------------------------------------------------

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest segment-write-lifecycle-test
  (mt/with-model-cleanup [:model/Segment :model/Revision]
    (let [create!  (fn [name definition]
                     (tool-result (call-tool! :crowberto #{"agent:segment:write"} "segment_write"
                                              {:method "create" :table_id (mt/id :venues)
                                               :name name :definition definition})))
          created  (create! "definitions-test segment A"
                            {:filter ["=" ["field" (mt/id :venues :price) nil] 3]})]
      (testing "GHY-4137: create from a bare MBQL 4 filter fragment succeeds and returns the stored MBQL 5 shape"
        (is (=? {:id        pos-int?
                 :entity_id string?
                 :table_id  (mt/id :venues)
                 :name      "definitions-test segment A"
                 :archived  false}
                created))
        (is (= 1 (count (get-in created [:definition :stages]))))
        (is (some? (get-in created [:definition :stages 0 :filters])))
        (is (nil? (get-in created [:definition :filter]))
            "the legacy fragment shape must not survive the write")
        (is (not (contains? created :description))
            "an unset description is omitted from the response, not null"))
      (testing "GHY-4137: update resolves an entity_id, applies the change, and records the revision message"
        (let [updated (tool-result (call-tool! :crowberto #{"agent:segment:write"} "segment_write"
                                               {:method "update" :id (:entity_id created)
                                                :description "price of three"
                                                :revision_message "add description"}))]
          (is (= (:id created) (:id updated)))
          (is (= "price of three" (:description updated)))
          (is (= "add description" (latest-revision-message "Segment" (:id created))))))
      (testing "GHY-4137: a fragment on update is wrapped onto the segment's existing table"
        (let [updated (tool-result (call-tool! :crowberto #{"agent:segment:write"} "segment_write"
                                               {:method "update" :id (:id created)
                                                :definition {:filter ["=" ["field" (mt/id :venues :price) nil] 4]}
                                                :revision_message "loosen filter"}))]
          (is (= (mt/id :venues) (:table_id updated)))
          (is (= 1 (count (get-in updated [:definition :stages]))))))
      (testing "GHY-4137: archived true trashes and archived false restores — the only removal path"
        (is (true? (:archived (tool-result (call-tool! :crowberto #{"agent:segment:write"} "segment_write"
                                                       {:method "update" :id (:id created)
                                                        :archived true :revision_message "trash"})))))
        (is (false? (:archived (tool-result (call-tool! :crowberto #{"agent:segment:write"} "segment_write"
                                                        {:method "update" :id (:id created)
                                                         :archived false :revision_message "restore"}))))))
      (testing "GHY-4137: MBQL 4 full queries and MBQL 5 queries are accepted on create too"
        (doseq [[label definition] {"legacy full query" {:database (mt/id)
                                                         :type     "query"
                                                         :query    {:source-table (mt/id :venues)
                                                                    :filter ["=" ["field" (mt/id :venues :price) nil] 2]}}
                                    "MBQL 5 query"      (venues-filter-definition)}]
          (testing label
            (let [result (create! (str "definitions-test segment " label) definition)]
              (is (= 1 (count (get-in result [:definition :stages])))))))))))

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest segment-cycle-teaching-error-test
  (mt/with-model-cleanup [:model/Segment :model/Revision]
    (testing "GHY-4137: a self-referencing definition surfaces the cycle as a teaching error, not an internal error"
      (let [{:keys [id]} (tool-result (call-tool! :crowberto nil "segment_write"
                                                  {:method "create" :table_id (mt/id :venues)
                                                   :name "definitions-test cycle segment"
                                                   :definition mbql4-fragment}))
            msg          (tool-error (call-tool! :crowberto nil "segment_write"
                                                 {:method "update" :id id :revision_message "cycle"
                                                  :definition {:filter ["segment" id]}}))]
        (is (re-find #"cycle detected" msg))
        (is (not= "Internal error" msg))))))

;;; ---------------------------------------------- measure_write ---------------------------------------------------

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest measure-write-lifecycle-test
  (mt/with-model-cleanup [:model/Measure :model/Revision]
    (let [created (tool-result (call-tool! :crowberto #{"agent:measure:write"} "measure_write"
                                           {:method "create" :table_id (mt/id :venues)
                                            :name "definitions-test measure A"
                                            :definition (venues-count-definition)}))]
      (testing "GHY-4137: create with a single-aggregation MBQL 5 definition succeeds"
        (is (=? {:id        pos-int?
                 :entity_id string?
                 :table_id  (mt/id :venues)
                 :name      "definitions-test measure A"
                 :archived  false}
                created))
        (is (= 1 (count (get-in created [:definition :stages 0 :aggregation])))))
      (testing "GHY-4137: update applies the change and records the revision message"
        (let [updated (tool-result (call-tool! :crowberto #{"agent:measure:write"} "measure_write"
                                               {:method "update" :id (:entity_id created)
                                                :description "how many venues"
                                                :revision_message "clarify"}))]
          (is (= "how many venues" (:description updated)))
          (is (= "clarify" (latest-revision-message "Measure" (:id created))))))
      (testing "GHY-4137: a definition on a different table moves the measure — table_id is derived, not caller-set"
        (let [updated (tool-result (call-tool! :crowberto #{"agent:measure:write"} "measure_write"
                                               {:method "update" :id (:id created)
                                                :definition (count-definition (mt/id :checkins))
                                                :revision_message "move to checkins"}))]
          (is (= (mt/id :checkins) (:table_id updated)))))
      (testing "GHY-4137: archived true trashes and archived false restores"
        (is (true? (:archived (tool-result (call-tool! :crowberto #{"agent:measure:write"} "measure_write"
                                                       {:method "update" :id (:id created)
                                                        :archived true :revision_message "trash"})))))
        (is (false? (:archived (tool-result (call-tool! :crowberto #{"agent:measure:write"} "measure_write"
                                                        {:method "update" :id (:id created)
                                                         :archived false :revision_message "restore"})))))))))

(deftest ^:parallel measure-rejects-mbql4-test
  (testing "GHY-4137: measure definitions are MBQL 5 only; MBQL 4 gets a teaching error, never a silent conversion"
    (testing "a bare aggregation fragment"
      (let [msg (tool-error (call-tool! :crowberto nil "measure_write"
                                        {:method "create" :table_id (mt/id :venues) :name "m"
                                         :definition {:aggregation [["count"]]}}))]
        (is (re-find #"MBQL 5" msg))
        (is (re-find #"not auto-converted" msg))))
    (testing "a legacy full query — rejected even though it names a source table"
      (is (re-find #"MBQL 5"
                   (tool-error (call-tool! :crowberto nil "measure_write"
                                           {:method "create" :table_id (mt/id :venues) :name "m"
                                            :definition {:database (mt/id)
                                                         :type     "query"
                                                         :query    {:source-table (mt/id :venues)
                                                                    :aggregation [["count"]]}}})))))
    (testing "the update path enforces the same rule"
      (mt/with-temp [:model/Measure {measure-id :id} {:name       "definitions-test mbql4 update"
                                                      :table_id   (mt/id :venues)
                                                      :creator_id (mt/user->id :crowberto)
                                                      :definition {}}]
        (is (re-find #"MBQL 5"
                     (tool-error (call-tool! :crowberto nil "measure_write"
                                             {:method "update" :id measure-id :revision_message "x"
                                              :definition {:aggregation [["count"]]}}))))))))

;;; --------------------------------------------- Round-tripping ---------------------------------------------------

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest segment-definition-round-trip-test
  (testing "GHY-4153: get_content's `definition` feeds straight back into segment_write, as its description promises"
    (mt/with-model-cleanup [:model/Segment :model/Revision]
      (let [created  (tool-result (call-tool! :crowberto nil "segment_write"
                                              {:method "create" :table_id (mt/id :venues)
                                               :name "definitions-test round-trip segment"
                                               :definition (venues-filter-definition)}))
            read-back (read-definition! "segment" (:id created))]
        (testing "the read is the bare clause form — an array of filter clauses, not a query map"
          (is (vector? read-back))
          (is (= "=" (ffirst read-back))))
        (let [updated (tool-result (call-tool! :crowberto nil "segment_write"
                                               {:method "update" :id (:id created)
                                                :definition (wire read-back)
                                                :revision_message "round-trip the read definition"}))]
          (is (= (mt/id :venues) (:table_id updated))
              "table_id is derived from the clause form's reassembly onto the segment's own table")
          (is (= 1 (count (get-in updated [:definition :stages]))))
          (is (= (without-uuids read-back)
                 (without-uuids (read-definition! "segment" (:id created))))
              "the stored definition reads back identically after the round-trip"))))))

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest measure-definition-round-trip-test
  (testing "GHY-4154: get_content's `definition` feeds straight back into measure_write"
    (mt/with-model-cleanup [:model/Measure :model/Revision]
      (let [created   (tool-result (call-tool! :crowberto nil "measure_write"
                                               {:method "create" :table_id (mt/id :venues)
                                                :name "definitions-test round-trip measure"
                                                :definition (venues-count-definition)}))
            read-back (read-definition! "measure" (:id created))]
        (testing "the read is the bare clause form — a one-element array holding the aggregation"
          (is (vector? read-back))
          (is (= 1 (count read-back)))
          (is (= "count" (ffirst read-back))))
        (let [updated (tool-result (call-tool! :crowberto nil "measure_write"
                                               {:method "update" :id (:id created)
                                                :definition (wire read-back)
                                                :revision_message "round-trip the read definition"}))]
          (is (= (mt/id :venues) (:table_id updated)))
          (is (= 1 (count (get-in updated [:definition :stages 0 :aggregation]))))
          (is (= (without-uuids read-back)
                 (without-uuids (read-definition! "measure" (:id created))))
              "the stored definition reads back identically after the round-trip"))
        (testing "the bare clause is accepted too, not only the one-element array get_content emits"
          (let [updated (tool-result (call-tool! :crowberto nil "measure_write"
                                                 {:method "update" :id (:id created)
                                                  :definition (wire (first read-back))
                                                  :revision_message "bare clause"}))]
            (is (= 1 (count (get-in updated [:definition :stages 0 :aggregation]))))))))))

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest clause-form-create-test
  (testing "GHY-4153/GHY-4154: create accepts the clause form, reassembling it onto table_id"
    (mt/with-model-cleanup [:model/Segment :model/Measure :model/Revision]
      (let [field-ref ["field" {} (venues-fk "PRICE")]
            segment   (tool-result (call-tool! :crowberto nil "segment_write"
                                               {:method "create" :table_id (mt/id :venues)
                                                :name "definitions-test clause-form segment"
                                                :definition (wire [["=" {} field-ref 3]])}))
            measure   (tool-result (call-tool! :crowberto nil "measure_write"
                                               {:method "create" :table_id (mt/id :venues)
                                                :name "definitions-test clause-form measure"
                                                :definition (wire [["count" {}]])}))]
        (is (= (mt/id :venues) (:table_id segment)))
        (is (= 1 (count (get-in segment [:definition :stages 0 :filters]))))
        (is (= (mt/id :venues) (:table_id measure)))
        (is (= 1 (count (get-in measure [:definition :stages 0 :aggregation]))))))))

;; not ^:parallel: creates rows through the tool; with-model-cleanup's id watermark is not parallel-safe
(deftest portable-full-query-create-test
  (testing "GHY-4153: a full query in the external dialect — what execute_query takes — is accepted as a definition"
    (mt/with-model-cleanup [:model/Segment :model/Revision]
      (let [created (tool-result
                     (call-tool! :crowberto nil "segment_write"
                                 {:method "create" :table_id (mt/id :venues)
                                  :name "definitions-test portable segment"
                                  :definition (wire {:lib/type "mbql/query"
                                                     :stages   [{:lib/type     "mbql.stage/mbql"
                                                                 :source-table (venues-fk)
                                                                 :filters      [["=" {}
                                                                                 ["field" {} (venues-fk "PRICE")]
                                                                                 3]]}]})}))]
        (is (= (mt/id :venues) (:table_id created)))
        (is (= 1 (count (get-in created [:definition :stages 0 :filters]))))))))

;;; ------------------------------------------ Definition validation -----------------------------------------------

(deftest ^:parallel definition-validation-teaching-test
  (testing "GHY-4137: the model layer's raw Malli failures reach the caller as teaching errors naming the rule"
    (testing "a segment definition with an aggregation"
      (let [msg (tool-error (call-tool! :crowberto nil "segment_write"
                                        {:method "create" :table_id (mt/id :venues)
                                         :name "definitions-test agg segment"
                                         :definition {:database (mt/id)
                                                      :type     "query"
                                                      :query    {:source-table (mt/id :venues)
                                                                 :aggregation  [["count"]]
                                                                 :filter       ["=" 1 1]}}}))]
        (is (str/includes? msg "Segments cannot use :aggregation"))
        (is (not= "Internal error" msg))))
    (testing "a measure definition with two aggregations"
      (let [definition (update-in (count-definition (mt/id :venues)) [:stages 0 :aggregation]
                                  conj ["count" {}])
            msg        (tool-error (call-tool! :crowberto nil "measure_write"
                                               {:method "create" :table_id (mt/id :venues)
                                                :name "definitions-test two aggs"
                                                :definition definition}))]
        (is (str/includes? msg "exactly one aggregation"))
        (is (not= "Internal error" msg))))
    (testing "a definition that fails MBQL normalization outright — the models would silently store {} for it"
      (is (str/includes? (tool-error (call-tool! :crowberto nil "segment_write"
                                                 {:method "create" :table_id (mt/id :venues)
                                                  :name "definitions-test garbage"
                                                  :definition {:database 0 :type "query" :query {:source-table 0}}}))
                         "`definition` is not a valid MBQL query")))))

(deftest ^:parallel definition-shape-teaching-test
  (testing "GHY-4153/GHY-4154: a definition in neither accepted shape names both shapes"
    (doseq [[tool definition] {"segment_write" {:database 0 :type "query" :query {:source-table 0}}
                               "measure_write" {:not "a query"}}]
      (testing tool
        (let [msg (tool-error (call-tool! :crowberto nil tool
                                          {:method "create" :table_id (mt/id :venues)
                                           :name "definitions-test bad shape" :definition definition}))]
          (is (str/includes? msg "bare clause form"))
          (is (str/includes? msg "full single-stage"))
          (is (not= "Internal error" msg)))))
    (testing "an unresolvable clause array is a teaching error naming both shapes, not an internal error"
      (let [msg (tool-error (call-tool! :crowberto nil "segment_write"
                                        {:method "create" :table_id (mt/id :venues)
                                         :name "definitions-test bad clauses"
                                         :definition [["nonsense-operator" {} 1]]}))]
        (is (str/includes? msg "bare clause form"))
        (is (not= "Internal error" msg))))
    (testing "a scalar definition never reaches the handler — the schema rejects both accepted shapes' negation"
      (is (str/starts-with? (tool-error (call-tool! :crowberto nil "segment_write"
                                                    {:method "create" :table_id (mt/id :venues)
                                                     :name "x" :definition "not a definition"}))
                            "Invalid arguments")))))

;;; ------------------------------------------------- Scopes -------------------------------------------------------

(deftest ^:parallel scope-gating-test
  (doseq [[tool scope] {"segment_write" "agent:segment:write"
                        "measure_write" "agent:measure:write"}
          :let [args {:method "update" :id 13371337 :revision_message "x"}]]
    (testing tool
      (testing "GHY-4137: a bearer token without the write scope is refused before dispatch"
        (is (= (str "Insufficient scope to call tool: " tool)
               (tool-error (call-tool! :crowberto #{"agent:search"} tool args)))))
      (testing "GHY-4137: the exact scope passes the gate — the identical call reaches the id lookup"
        (is (re-find #"not found" (tool-error (call-tool! :crowberto #{scope} tool args)))))
      (testing "GHY-4137: the wildcard the metabot permission bucket grants passes too"
        (is (re-find #"not found" (tool-error (call-tool! :crowberto
                                                          #{(str/replace scope #"write$" "*")}
                                                          tool args))))))))

(deftest ^:parallel write-scopes-grantable-test
  (testing "GHY-4137: a scope a tool checks must be grantable — advertised through registered-scopes"
    (is (set/subset? #{"agent:segment:write" "agent:measure:write"}
                     (registry/registered-scopes))))
  (testing "GHY-4137: the metabot sql-generation permission bucket covers both scopes via its wildcards"
    (let [scopes (metabot.scope/user-metabot-perms->scopes {:permission/metabot-sql-generation :yes})]
      (is (mcp.scope/matches? scopes "agent:segment:write"))
      (is (mcp.scope/matches? scopes "agent:measure:write")))))

(deftest ^:parallel tools-list-visibility-test
  (testing "GHY-4137: each tool is visible exactly to tokens carrying its scope"
    (doseq [[tool scope] {"segment_write" "agent:segment:write"
                          "measure_write" "agent:measure:write"}]
      (is (some #(= tool (:name %)) (registry/list-tools #{scope})))
      (is (not (some #(= tool (:name %)) (registry/list-tools #{"agent:search"})))))))

;;; ----------------------------------------------- Permissions ----------------------------------------------------

;; not ^:parallel: with-no-data-perms-for-all-users! rewrites global data perms, and rows are
;; created through the tool under with-model-cleanup
(deftest permission-tiers-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-model-cleanup [:model/Segment :model/Measure :model/Revision]
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {analyst-id :id} {:is_data_analyst true}
                     :model/User {plain-id :id} {}
                     :model/User {blind-analyst-id :id} {:is_data_analyst true}]
        (doseq [user-id [analyst-id plain-id]]
          (perms/add-user-to-group! user-id group-id))
        (perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (perms/set-table-permission! group-id (mt/id :venues) :perms/create-queries :query-builder)
        (let [segment-args {:method "create" :table_id (mt/id :venues)
                            :name "definitions-test perms segment" :definition mbql4-fragment}
              measure-args {:method "create" :table_id (mt/id :venues)
                            :name "definitions-test perms measure"
                            :definition (count-definition (mt/id :venues))}]
          (testing "GHY-4137: not admin-only — a data analyst with unrestricted view-data creates both"
            (is (=? {:id pos-int?} (tool-result (call-tool! analyst-id nil "segment_write" segment-args))))
            (is (=? {:id pos-int?} (tool-result (call-tool! analyst-id nil "measure_write" measure-args)))))
          (testing "GHY-4137: the same table grants without the data-analyst role are a permission denial, not a not-found"
            (is (= "You don't have permissions to do that."
                   (tool-error (call-tool! plain-id nil "segment_write"
                                           (assoc segment-args :name "definitions-test denied segment")))))
            (is (= "You don't have permissions to do that."
                   (tool-error (call-tool! plain-id nil "measure_write"
                                           (assoc measure-args :name "definitions-test denied measure"))))))
          (testing "GHY-4137: a data analyst without unrestricted view-data is denied — data analysts always read
                    table metadata, so the table resolves and the domain permission check refuses the write"
            (is (= "You don't have permissions to do that."
                   (tool-error (call-tool! blind-analyst-id nil "segment_write"
                                           (assoc segment-args :name "definitions-test blind segment")))))))))))

;; not ^:parallel: narrows the all-users group's view-data on the temp database
(deftest existence-oracle-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Table {table-id :id} {:db_id db-id}
                 :model/Segment {segment-id :id} {:table_id table-id}
                 :model/Measure {measure-id :id} {:name       "definitions-test oracle measure"
                                                  :table_id   table-id
                                                  :creator_id (mt/user->id :crowberto)
                                                  :definition {}}]
    (perms/set-database-permission! (perms/all-users-group) db-id :perms/view-data :blocked)
    (let [norm (fn [msg] (str/replace msg #"\d+" "N"))]
      (testing "GHY-4137: an unreadable id and a nonexistent id must be indistinguishable — no existence oracle"
        (testing "segment update"
          (is (= (norm (tool-error (call-tool! :rasta nil "segment_write"
                                               {:method "update" :id segment-id :revision_message "x"})))
                 (norm (tool-error (call-tool! :rasta nil "segment_write"
                                               {:method "update" :id 13371337 :revision_message "x"}))))))
        (testing "measure update"
          (is (= (norm (tool-error (call-tool! :rasta nil "measure_write"
                                               {:method "update" :id measure-id :revision_message "x"})))
                 (norm (tool-error (call-tool! :rasta nil "measure_write"
                                               {:method "update" :id 13371337 :revision_message "x"}))))))
        (testing "create against an unreadable vs nonexistent table"
          (let [args {:method "create" :name "definitions-test oracle" :definition mbql4-fragment}]
            (is (= (norm (tool-error (call-tool! :rasta nil "segment_write" (assoc args :table_id table-id))))
                   (norm (tool-error (call-tool! :rasta nil "segment_write" (assoc args :table_id 13371337))))))))))))

;;; ------------------------------------------------ Redaction -----------------------------------------------------

;; not ^:parallel: with-dynamic-fn-redefs on the shared domain fns
(deftest unexpected-error-redaction-test
  (testing "GHY-4137: an unexpected domain failure is redacted to a generic internal error — its message may embed
            SQL or schema detail and must never reach the caller"
    (mt/with-dynamic-fn-redefs [segments.api/create-segment!
                                (fn [_] (throw (java.sql.SQLException. "relation \"secret_accounts\" does not exist")))
                                measures.api/create-measure!
                                (fn [_] (throw (java.sql.SQLException. "relation \"secret_accounts\" does not exist")))]
      (doseq [[tool definition] {"segment_write" mbql4-fragment
                                 "measure_write" (count-definition (mt/id :venues))}]
        (let [msg (tool-error (call-tool! :crowberto nil tool
                                          {:method "create" :table_id (mt/id :venues)
                                           :name "definitions-test redaction" :definition definition}))]
          (is (= "Internal error" msg))
          (is (not (str/includes? msg "secret_accounts"))))))))
