(ns metabase.mcp.v2.tools.definitions
  "The v2 MCP `segment_write` and `measure_write` tools: authoring for the two table-attached
   MBQL macros. Both call the same domain create/update fns the REST endpoints use
   ([[metabase.segments.api]]/[[metabase.measures.api]]), so permission enforcement — superuser
   OR data-analyst-with-unrestricted-view-data on the table, plus the table's remote-sync
   editability — is inherited, never reimplemented. The tools' own work is id resolution behind
   read checks, definition-shape handling (MBQL 4 auto-convert for segments, MBQL 5-only for
   measures), and translating the model layer's raw validation exceptions into teaching errors."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.measures.api :as measures.api]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [metabase.segments.api :as segments.api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Shared plumbing -----------------------------------------------

(def ^:private write-result-keys
  "Keys of the created/updated row echoed back to the caller (membership only — the response is
   a map). `:definition` shows the stored MBQL 5 shape, so the caller sees the result of any
   input conversion."
  #{:id :entity_id :name :table_id :description :archived :definition})

(defn- write-result
  [row]
  (->> (-> (select-keys row write-result-keys)
           (m/update-existing :definition #(some-> % lib/prepare-for-serialization)))
       (m/remove-vals nil?)))

(defn- resolve-table
  "Resolve a numeric `table_id` behind the table's read check. \"Doesn't exist\" and \"exists but
   not readable\" collapse into the same not-found error."
  [table-id]
  (common/resolve-and-read :model/Table table-id
                           (fn [id]
                             (when-let [table (t2/select-one :model/Table :id id)]
                               (when (mi/can-read? table)
                                 table)))))

(defn- resolve-existing
  "Resolve an update's `id` (numeric or entity_id) to the row behind `model`'s read check, with
   the same not-found collapse as [[resolve-table]]. The domain update fn still runs its own
   write check."
  [model id-or-eid]
  (common/resolve-and-read model id-or-eid
                           (fn [id]
                             (when-let [row (t2/select-one model :id id)]
                               (when (mi/can-read? row)
                                 row)))))

(defn- check-method-args!
  "Reject arguments that don't apply to the dispatched method, so a caller never believes an
   ignored field took effect."
  [method args]
  (case method
    :create (doseq [k [:id :archived :revision_message]]
              (when (contains? args k)
                (common/throw-teaching-error
                 (format "`%s` applies to method \"update\" only — remove it from this create call." (name k)))))
    :update (when (contains? args :table_id)
              (common/throw-teaching-error
               "`table_id` cannot be changed on update — the server derives it from `definition`'s source table."))))

(defn- check-revision-message!
  [{:keys [revision_message]} entity]
  (when (str/blank? revision_message)
    (common/throw-teaching-error
     (format (str "`revision_message` is required when method is \"update\" — pass a short sentence describing "
                  "the change; it is recorded in the %s's revision history.")
             entity))))

;;; --------------------------------------------- Definition handling ----------------------------------------------

(defn- ellipsize
  [s limit]
  (let [s (str s)]
    (if (> (count s) limit)
      (str (subs s 0 limit) "…")
      s)))

(defn- wrap-mbql4-fragment
  "Wrap a bare MBQL 4 fragment (a map with no recognizable full-query shape, e.g.
   `{:filter [...]}`) into a legacy full query on `table` — a shape the segments domain layer
   converts to MBQL 5. Full queries, MBQL 5 or legacy, pass through unchanged. A fragment's own
   `:source-table` wins over the wrapping table, matching the model layer's merge semantics."
  [definition {table-id :id, db-id :db_id}]
  (case (lib/normalized-mbql-version definition)
    (:mbql-version/mbql5 :mbql-version/legacy) definition
    {:database db-id
     :type     :query
     :query    (merge {:source-table table-id} definition)}))

(defn- check-normalizable!
  "Probe `definition` against strict MBQL normalization before handing it to the domain layer.
   The models normalize non-strictly, where an unparseable definition silently degrades to `{}`
   and would be stored as an empty definition; failing here turns that silent data loss into a
   teaching error."
  [definition]
  (try
    (lib-be/normalize-query nil definition {:strict? true})
    (catch Exception e
      (common/throw-teaching-error
       (format "`definition` is not a valid MBQL query: %s" (ellipsize (ex-message e) 300))))))

(defn- require-mbql5-definition!
  [definition]
  (when-not (= :mbql-version/mbql5 (lib/normalized-mbql-version definition))
    (common/throw-teaching-error
     (str "`definition` must already be a single-stage MBQL 5 query — a map with \"lib/type\": \"mbql/query\", "
          "\"database\", and one entry in \"stages\" holding exactly one aggregation. MBQL 4 definitions are "
          "not accepted for measures and are not auto-converted (unlike segment_write)."))))

;;; ---------------------------------------------- Error translation -----------------------------------------------

(defn- humanized-messages
  [x]
  (cond
    (map? x)        (mapcat humanized-messages (vals x))
    (sequential? x) (mapcat humanized-messages x)
    (string? x)     [x]
    :else           []))

(defn- custom-messages
  "The `:error/message` strings schema authors wrote (surfaced by malli under `:malli/error`) —
   e.g. \"A segment must have exactly one stage\" — which teach far better than the generic
   per-key output around them."
  [x]
  (cond
    (map? x)        (concat (humanized-messages (:malli/error x))
                            (mapcat custom-messages (vals (dissoc x :malli/error))))
    (sequential? x) (mapcat custom-messages x)
    :else           []))

(defn- schema-error-summary
  [humanized]
  (->> (or (seq (distinct (custom-messages humanized)))
           (distinct (humanized-messages humanized)))
       (take 3)
       (map #(ellipsize % 200))
       (str/join "; ")))

(defn- run-domain-write
  "Call `thunk` (a domain create/update fn), translating the model layer's raw validation
   exceptions into teaching errors: Malli shape failures from `mu/validate-throw` (disallowed
   clauses, stage-count and aggregation-count rules) and the lib cycle/existence checks, none
   of which carry a client-facing status code of their own. Exceptions that do carry one pass
   through untouched, and anything unrecognized stays an internal error."
  [thunk]
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (let [data (ex-data e)]
        (cond
          (:status-code data)
          (throw e)

          ;; mu/validate-throw: pre-humanized malli explain output under :error
          (and (:error data) (= (ex-message e) "Value does not match schema"))
          (common/throw-teaching-error
           (format "Invalid `definition`: %s." (schema-error-summary (:error data))))

          ;; lib cycle detection and referenced-id existence checks
          (or (contains? data :cycle-path)
              (contains? data :segment-id)
              (contains? data :measure-id))
          (common/throw-teaching-error (ex-message e))

          :else
          (throw e))))))

;;; -------------------------------------------------- Schemas -----------------------------------------------------

(defn- write-args-schema
  [{:keys [entity definition-desc name-desc]}]
  [:map {:closed true}
   [:method
    [:enum {:description (format (str "\"create\" makes a new %s (requires `table_id`, `name`, `definition`); "
                                      "\"update\" edits the one named by `id` (requires `revision_message`).")
                                 entity)}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description (format "Numeric id of the %s to update." entity)}]
             [:string {:description (format "21-character entity_id of the %s to update." entity)}]]]]
   [:table_id {:optional true}
    [:maybe [:int {:description (str "Create only: numeric id of the table (tables have no entity_ids). Advisory — "
                                     "the server derives the stored table from `definition`'s source table and "
                                     "silently reconciles a mismatch in the definition's favor.")}]]]
   [:name {:optional true}
    [:maybe [:string {:min 1 :description name-desc}]]]
   [:definition {:optional true}
    [:maybe [:map {:description definition-desc}]]]
   [:description {:optional true}
    [:maybe [:string {:description "Optional human-readable description."}]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Update only: true moves it to the trash, false restores it. Archiving is "
                                         "the only removal path — there is no hard delete.")}]]]
   [:revision_message {:optional true}
    [:maybe [:string {:min 1 :description (str "Update only, required: a short sentence describing the change, "
                                               "recorded in the revision history.")}]]]])

;;; ------------------------------------------------ segment_write -------------------------------------------------

(def ^:private segment-write-args-schema
  (write-args-schema
   {:entity          "segment"
    :name-desc       "Create only (editable on update): display name of the segment."
    :definition-desc (str "A single-stage MBQL query holding only filters — no aggregations, breakouts, joins, "
                          "expressions, or limits. MBQL 5 is the stored shape; MBQL 4 full queries and bare MBQL 4 "
                          "filter fragments (e.g. {\"filter\": [\"=\", [\"field\", 10, null], \"active\"]}) are "
                          "auto-converted on write. Reads always return MBQL 5. May reference other segments, but "
                          "cycles are rejected.")}))

(def ^:private segment-write-entry
  {:tool-name       "segment_write"
   :create-required [:table_id :name :definition]})

(registry/deftool segment-write
  "Create or update a segment: a named, reusable MBQL filter attached to one table, referenced from other queries'
  filters. method: \"create\" requires table_id, name, and definition; method: \"update\" requires id and
  revision_message, and accepts name, description, definition, and archived (true trashes, false restores — there is
  no hard delete). definition is a single-stage MBQL query holding only filters; MBQL 4 full queries and bare filter
  fragments are auto-converted to MBQL 5 on write, and reads always return MBQL 5. The server derives the stored
  table from definition's source table, reconciling any table_id mismatch in the definition's favor. Not admin-only:
  writing requires superuser OR a data analyst with unrestricted view-data on the table, and the table must not live
  in a read-only remote-synced collection."
  {:name  "segment_write"
   :scope metabot.scope/agent-segment-write
   :args  segment-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [dispatched (common/dispatch-write segment-write-entry token-scopes args)]
    (case (first dispatched)
      :create
      (let [[_ body]   dispatched
            _          (check-method-args! :create body)
            table      (resolve-table (:table_id body))
            definition (wrap-mbql4-fragment (:definition body) table)]
        (check-normalizable! definition)
        (-> (run-domain-write #(segments.api/create-segment! {:name        (:name body)
                                                              :description (:description body)
                                                              :definition  definition}))
            write-result
            common/success-content))

      :update
      (let [[_ id body] dispatched
            _           (check-method-args! :update body)
            _           (check-revision-message! body "segment")
            segment     (resolve-existing :model/Segment id)
            body        (m/update-existing body :definition
                                           (fn [definition]
                                             (let [table   (t2/select-one :model/Table :id (:table_id segment))
                                                   wrapped (wrap-mbql4-fragment definition table)]
                                               (check-normalizable! wrapped)
                                               wrapped)))]
        (-> (run-domain-write #(segments.api/write-check-and-update-segment! (:id segment) body))
            write-result
            common/success-content)))))

;;; ------------------------------------------------ measure_write -------------------------------------------------

(def ^:private measure-write-args-schema
  (write-args-schema
   {:entity          "measure"
    :name-desc       "Create only (editable on update): display name of the measure."
    :definition-desc (str "A single-stage MBQL 5 query holding exactly one aggregation — no filters, breakouts, "
                          "joins, expressions, or limits. Must already be MBQL 5 (\"lib/type\": \"mbql/query\"); "
                          "MBQL 4 is rejected, with no auto-conversion (unlike segment_write). May reference other "
                          "measures, but not metrics, and cycles are rejected.")}))

(def ^:private measure-write-entry
  {:tool-name       "measure_write"
   :create-required [:table_id :name :definition]})

(registry/deftool measure-write
  "Create or update a measure: a named, reusable MBQL aggregation attached to one table, referenced inside another
  query's aggregation as [\"measure\", id]. A measure is not a metric — metrics are standalone saved cards that live
  in collections and can be queried on their own, while a measure belongs to a table and is only usable inside a
  query against that table. method: \"create\" requires table_id, name, and definition; method: \"update\" requires
  id and revision_message, and accepts name, description, definition, and archived (true trashes, false restores —
  there is no hard delete). definition must already be a single-stage MBQL 5 query holding exactly one aggregation;
  MBQL 4 is rejected with no auto-conversion (unlike segment_write). The server derives the stored table from
  definition's source table, reconciling any table_id mismatch in the definition's favor. Not admin-only: writing
  requires superuser OR a data analyst with unrestricted view-data on the table, and the table must not live in a
  read-only remote-synced collection."
  {:name  "measure_write"
   :scope metabot.scope/agent-measure-write
   :args  measure-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [dispatched (common/dispatch-write measure-write-entry token-scopes args)]
    (case (first dispatched)
      :create
      (let [[_ body]   dispatched
            _          (check-method-args! :create body)
            _          (resolve-table (:table_id body))
            definition (:definition body)]
        (require-mbql5-definition! definition)
        (check-normalizable! definition)
        (-> (run-domain-write #(measures.api/create-measure! {:name        (:name body)
                                                              :description (:description body)
                                                              :definition  definition}))
            write-result
            common/success-content))

      :update
      (let [[_ id body] dispatched
            _           (check-method-args! :update body)
            _           (check-revision-message! body "measure")
            measure     (resolve-existing :model/Measure id)
            body        (m/update-existing body :definition
                                           (fn [definition]
                                             (require-mbql5-definition! definition)
                                             (check-normalizable! definition)
                                             definition))]
        (-> (run-domain-write #(measures.api/write-check-and-update-measure! (:id measure) body))
            write-result
            common/success-content)))))
