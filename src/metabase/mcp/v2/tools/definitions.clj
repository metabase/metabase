(ns metabase.mcp.v2.tools.definitions
  "The v2 MCP `segment_write` and `measure_write` tools: authoring for the two table-attached
   MBQL macros. Both call the same domain create/update fns the REST endpoints use
   ([[metabase.segments.api]]/[[metabase.measures.api]]), so permission enforcement — superuser
   OR data-analyst-with-unrestricted-view-data on the table, plus the table's remote-sync
   editability — is inherited, never reimplemented. The tools' own work is id resolution behind
   read checks, definition-shape handling (the bare clause form `get_content` returns, full
   queries in the portable external dialect, and MBQL 4 auto-convert for segments), and
   translating the model layer's raw validation exceptions into teaching errors."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.measures.api :as measures.api]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metabot.tools.construct :as metabot.construct]
   [metabase.models.interface :as mi]
   [metabase.segments.api :as segments.api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Shared plumbing -----------------------------------------------

(defn- write-result
  "The created/updated row echoed to the caller: `kind`'s concise read projection — so the echo
   and a concise get_content read carry the same identity fields by construction — plus
   `:entity_id` (a portable id to update by) and `:definition`, the stored MBQL 5 shape, so the
   caller sees the result of any input conversion. Nils drop out: an unset description is omitted,
   not null."
  [row kind]
  ;; The :segment/:measure projections are registered by metabase.mcp.v2.tools.content, which
  ;; metabase.mcp.v2.api loads alongside this ns — so the registry is populated before any tool
  ;; dispatch reaches here.
  (->> (-> (projections/project kind :concise row)
           (assoc :entity_id  (:entity_id row)
                  :definition (some-> (:definition row) lib/prepare-for-serialization)))
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
  "Inject the tool's `table` into a bare MBQL 4 fragment (a map with no full-query shape, e.g.
   `{:filter [...]}`) by wrapping it in a legacy full query, so `create-segment!` can derive a
   source table from a fragment that names none — the segment REST endpoint takes no `table_id`
   and 400s on such a fragment. Full queries (MBQL 5 or legacy) pass through unchanged. This is
   not what converts MBQL 4 to MBQL 5: the segment model's before-insert normalizes any MBQL 4
   definition on store, and would convert an unwrapped fragment identically. A fragment's own
   `:source-table` wins over `table`, matching that same model merge."
  [definition {table-id :id, db-id :db_id}]
  (case (lib/normalized-mbql-version definition)
    (:mbql-version/mbql5 :mbql-version/legacy) definition
    {:database db-id
     :type     :query
     :query    (merge {:source-table table-id} definition)}))

(defn- accepted-shapes
  "The sentence every definition-shape teaching error ends with, naming both accepted shapes."
  [kind]
  (case kind
    :segment (str "`definition` accepts either the bare clause form — the array of filter clauses get_content's "
                  "\"definition\" include returns for a segment, reassembled onto `table_id` — or a full "
                  "single-stage query holding only filters (MBQL 5, or MBQL 4 which is auto-converted).")
    :measure (str "`definition` accepts either the bare clause form — the aggregation clause get_content's "
                  "\"definition\" include returns for a measure, as the one-element array or the bare clause, "
                  "reassembled onto `table_id` — or a full single-stage MBQL 5 query holding exactly one "
                  "aggregation. MBQL 4 is not accepted for measures and is not auto-converted (unlike "
                  "segment_write).")))

(defn- check-normalizable!
  "Probe `definition` against strict MBQL normalization before handing it to the domain layer.
   The models normalize non-strictly, where an unparseable definition silently degrades to `{}`
   and would be stored as an empty definition; failing here turns that silent data loss into a
   teaching error."
  [kind definition]
  (try
    (lib-be/normalize-query nil definition {:strict? true})
    (catch Exception e
      (common/throw-teaching-error
       (format "`definition` is not a valid MBQL query: %s %s"
               (ellipsize (ex-message e) 300) (accepted-shapes kind))))))

;; measure_write is deliberately MBQL-5-only, stricter than POST /api/measure — that endpoint
;; auto-converts MBQL 4 via measures.api/normalize-input-definition, but MBQL 4 is a Cypress-e2e
;; affordance, not an agent path (agents author MBQL 5 from execute_query / get_content). Keeping
;; the narrower contract here teaches the model the one dialect it should speak.
(defn- require-mbql5-definition!
  [definition]
  (when-not (= :mbql-version/mbql5 (lib/normalized-mbql-version definition))
    (common/throw-teaching-error
     (str "This `definition` is a full query but not MBQL 5 — a full query must be a map with "
          "\"lib/type\": \"mbql/query\", \"database\", and one entry in \"stages\". "
          (accepted-shapes :measure)))))

(defn- portable-table-fk
  "The portable FK path `[db-name schema table-name]` the external dialect names a source table by."
  [{table-name :name, schema :schema, db-id :db_id}]
  [(t2/select-one-fn :name :model/Database :id db-id) schema table-name])

(defn- portable-query?
  "True when `definition` is a full query whose first stage names its source the way the portable
   external dialect does — an FK path or a card entity_id rather than a numeric id. Those forms
   mean nothing to [[lib-be/normalize-query]]; they need the representations pipeline."
  [definition]
  (let [stage (first (:stages definition))]
    (or (vector? (:source-table stage))
        (string? (:source-card stage)))))

(defn- resolve-external-query
  "Resolve a full query in the portable external dialect through the same pipeline `execute_query`
   runs a fresh `query` through — repair, portable-FK resolution, and the runnable/editor gates —
   and return the serialized MBQL 5 query. Resolution only: the pipeline does not execute.
   Surfaces the pipeline's own agent-facing failures as teaching errors; permission failures and
   anything unrecognized pass through."
  [kind external-query]
  (try
    (-> (metabot.construct/execute-representations-query external-query)
        (get-in [:structured-output :query])
        lib/prepare-for-serialization)
    (catch clojure.lang.ExceptionInfo e
      (if (:agent-error? (ex-data e))
        (common/throw-teaching-error
         (format "`definition` could not be resolved: %s %s"
                 (ellipsize (ex-message e) 300) (accepted-shapes kind)))
        (throw e)))))

(defn- clause-form->definition
  "Reassemble the bare clause form onto `table` and resolve it. The clause form names no source of
   its own, so `table` — `table_id` on create, the row's own table on update — is what makes it a
   query at all. A caller may pass the array get_content returns or a single bare clause; a clause
   is distinguished from an array of clauses by its string head."
  [kind definition table]
  (let [clauses (if (string? (first definition)) [definition] (vec definition))]
    (resolve-external-query
     kind
     {:lib/type "mbql/query"
      :stages   [(assoc {:lib/type     "mbql.stage/mbql"
                         :source-table (portable-table-fk table)}
                        (case kind :segment :filters :measure :aggregation)
                        clauses)]})))

(defn- prepare-definition
  "Resolve a caller-supplied `definition` into the MBQL 5 query the domain layer stores, accepting
   both the bare clause form (reassembled onto `table`) and a full single-stage query. Throws a
   teaching error naming both shapes when neither resolves."
  [kind definition table]
  (cond
    (sequential? definition)
    (clause-form->definition kind definition table)

    (portable-query? definition)
    (resolve-external-query kind definition)

    :else
    (case kind
      :segment (let [wrapped (wrap-mbql4-fragment definition table)]
                 (check-normalizable! kind wrapped)
                 wrapped)
      :measure (do (require-mbql5-definition! definition)
                   (check-normalizable! kind definition)
                   definition))))

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
    [:maybe [:int {:description (str "Create only: numeric id of the table (tables have no entity_ids). Load-bearing "
                                     "when `definition` is the bare clause form — that form names no source, so the "
                                     "clauses are reassembled into a query on this table. When `definition` is a full "
                                     "query it is advisory: the server derives the stored table from the definition's "
                                     "source table and silently reconciles a mismatch in the definition's favor.")}]]]
   [:name {:optional true}
    [:maybe [:string {:min 1 :description name-desc}]]]
   [:definition {:optional true}
    [:maybe [:or {:description definition-desc}
             [:map]
             [:sequential :any]]]]
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
    :definition-desc (str "Either shape: (a) an array of filter clauses in the external dialect — exactly what "
                          "get_content's \"definition\" include returns for a segment, and what execute_query takes "
                          "in stages[0].filters — reassembled onto `table_id`; or (b) a full single-stage query "
                          "holding only filters. Either way: no aggregations, breakouts, joins, expressions, or "
                          "limits. MBQL 5 is the stored shape; MBQL 4 full queries and bare MBQL 4 filter fragments "
                          "(e.g. {\"filter\": [\"=\", [\"field\", 10, null], \"active\"]}) are auto-converted on "
                          "write. May reference other segments, but cycles are rejected.")}))

(def ^:private segment-write-entry
  {:tool-name       "segment_write"
   :create-required [:table_id :name :definition]})

(registry/deftool segment-write
  "Create or update a segment: a named, reusable MBQL filter attached to one table, referenced from other queries'
  filters. method: \"create\" requires table_id, name, and definition; method: \"update\" requires id and
  revision_message, and accepts name, description, definition, and archived (true trashes, false restores — there is
  no hard delete). definition holds only filters and comes in either shape: the array of filter clauses get_content's
  \"definition\" include returns for a segment (the same clauses execute_query takes in stages[0].filters), which is
  reassembled onto table_id; or a full single-stage query, where MBQL 4 full queries and bare filter fragments are
  auto-converted to MBQL 5 on write. Reads always return MBQL 5. For a full query the server derives the stored table
  from definition's source table, reconciling any table_id mismatch in the definition's favor. Not admin-only:
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
            definition (prepare-definition :segment (:definition body) table)]
        (-> (run-domain-write #(segments.api/create-segment! {:name        (:name body)
                                                              :description (:description body)
                                                              :definition  definition}))
            (write-result :segment)
            common/success-content))

      :update
      (let [[_ id body] dispatched
            _           (check-method-args! :update body)
            _           (check-revision-message! body "segment")
            segment     (resolve-existing :model/Segment id)
            body        (m/update-existing body :definition
                                           (fn [definition]
                                             (prepare-definition
                                              :segment definition
                                              (t2/select-one :model/Table :id (:table_id segment)))))]
        (-> (run-domain-write #(segments.api/write-check-and-update-segment! (:id segment) body))
            (write-result :segment)
            common/success-content)))))

;;; ------------------------------------------------ measure_write -------------------------------------------------

(def ^:private measure-write-args-schema
  (write-args-schema
   {:entity          "measure"
    :name-desc       "Create only (editable on update): display name of the measure."
    :definition-desc (str "Either shape: (a) the aggregation clause in the external dialect — exactly what "
                          "get_content's \"definition\" include returns for a measure (the one-element array, or "
                          "the bare clause), and what execute_query takes in stages[0].aggregation — reassembled "
                          "onto `table_id`; or (b) a full single-stage MBQL 5 query holding exactly one aggregation. "
                          "Either way: no filters, breakouts, joins, expressions, or limits. A full query must be "
                          "MBQL 5 (\"lib/type\": \"mbql/query\"); MBQL 4 is rejected, with no auto-conversion "
                          "(unlike segment_write). May reference other measures, but not metrics, and cycles are "
                          "rejected.")}))

(def ^:private measure-write-entry
  {:tool-name       "measure_write"
   :create-required [:table_id :name :definition]})

(registry/deftool measure-write
  "Create or update a measure: a named, reusable MBQL aggregation attached to one table, referenced inside another
  query's aggregation as [\"measure\", id]. A measure is not a metric — metrics are standalone saved cards that live
  in collections and can be queried on their own, while a measure belongs to a table and is only usable inside a
  query against that table. method: \"create\" requires table_id, name, and definition; method: \"update\" requires
  id and revision_message, and accepts name, description, definition, and archived (true trashes, false restores —
  there is no hard delete). definition holds exactly one aggregation and comes in either shape: the aggregation clause
  get_content's \"definition\" include returns for a measure (the same clause execute_query takes in
  stages[0].aggregation), as the one-element array or the bare clause, which is reassembled onto table_id; or a full
  single-stage MBQL 5 query, where MBQL 4 is rejected with no auto-conversion (unlike segment_write). For a full query
  the server derives the stored table from definition's source table, reconciling any table_id mismatch in the
  definition's favor. Not admin-only: writing
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
            table      (resolve-table (:table_id body))
            definition (prepare-definition :measure (:definition body) table)]
        (-> (run-domain-write #(measures.api/create-measure! {:name        (:name body)
                                                              :description (:description body)
                                                              :definition  definition}))
            (write-result :measure)
            common/success-content))

      :update
      (let [[_ id body] dispatched
            _           (check-method-args! :update body)
            _           (check-revision-message! body "measure")
            measure     (resolve-existing :model/Measure id)
            body        (m/update-existing body :definition
                                           (fn [definition]
                                             (prepare-definition
                                              :measure definition
                                              (t2/select-one :model/Table :id (:table_id measure)))))]
        (-> (run-domain-write #(measures.api/write-check-and-update-measure! (:id measure) body))
            (write-result :measure)
            common/success-content)))))
