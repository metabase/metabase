(ns metabase.mcp.v2.tools.metric
  "The v2 MCP `metric_write` tool. A metric is a Card with `type: \"metric\"` — the same table and
   the same REST endpoint as a saved question — so this tool routes through the shared card check
   stack ([[metabase.queries.core]]) that `POST`/`PUT /api/card` and `question_write` run, never
   reimplementing permissions or persistence.

   Its own work is the metric authoring contract: one `definition` query source (a full query in
   the portable external dialect `get_content` returns, plain MBQL 5, or a `query_handle` from an
   execute tool), the metric shape gate (`lib/can-save?`: one stage, exactly one aggregation, at
   most one date/datetime breakout), and refusing to retype an existing question or model."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private accepted-shapes
  "The sentence every definition-shape teaching error ends with, naming what `definition` accepts."
  (str "`definition` accepts a full single-stage query holding exactly one aggregation: either the "
       "portable external dialect — what get_content's \"definition\" include returns for a metric "
       "and what execute_query takes — or MBQL 5 with numeric ids. Alternatively pass a "
       "query_handle from an execute tool instead of `definition`."))

(def ^:private shape-rule
  "The metric shape rule, quoted verbatim in every gate error so the caller learns it once."
  (str "A metric needs exactly one aggregation and at most one date/datetime grouping, in a single "
       "query stage."))

;;; --------------------------------------------- Definition handling ----------------------------------------------

(defn- normalize-definition
  "Normalize a numeric-ref query — hand-written MBQL 5, MBQL 4 (which normalizes into it), a
   resolved portable query, or a handle's stored query — into the canonical MBQL 5 the card layer
   takes. Strict, so a malformed definition is a teaching error here rather than silently degrading
   to `{}` on store; the result carries the metadata provider the card write checks require."
  [definition]
  (try
    (lib-be/normalize-query nil definition {:strict? true})
    (catch Exception e
      (common/throw-teaching-error
       (format "`definition` is not a valid MBQL query: %s %s"
               (common/ellipsize (ex-message e) 300) accepted-shapes)))))

(defn- resolve-definition
  "Resolve the caller's query source to the query the metric card stores. Exactly one of
   `definition` (portable external dialect or MBQL 5) and `query_handle` (a handle from an execute
   tool, re-checked for shape and permissions on resolve) may be present; `nil` when neither is,
   which on update means \"leave the stored query alone\"."
  [{:keys [definition query_handle]} session-id]
  (when (and definition query_handle)
    (common/throw-teaching-error
     "Pass exactly one query source: `definition` (the metric's query) or `query_handle` (a handle from an execute tool)."))
  (some-> (cond
            definition   (if (common/portable-query? definition)
                           (common/resolve-external-query definition accepted-shapes)
                           definition)
            query_handle (:query (common/resolve-query-handle-for-save! session-id api/*current-user-id* query_handle)))
          normalize-definition))

(defn- check-metric-shape!
  "Throw a teaching error unless `dataset-query` is a saveable metric. `lib/can-save?` reads field
   metadata to type-check the breakout, which the query carries: [[normalize-definition]] leaves a
   metadata provider attached. Restates the rule rather than reusing
   [[metabase.queries.core/check-card-can-be-saved!]]'s REST-facing 400, whose message an agent
   can't act on — and which the update-side check stack doesn't run at all."
  [dataset-query]
  (when (lib/native-only-query? dataset-query)
    (common/throw-teaching-error
     (str "A metric can't be built from a native (SQL) query — metrics are MBQL so other queries can "
          "reuse them. Save it with question_write instead, or rebuild the aggregation with execute_query.")))
  (when-not (lib/can-save? dataset-query :metric)
    (common/throw-teaching-error
     (format "This query can't be saved as a metric. %s Build it with execute_query first — a single summarize (count, sum, average…) with at most one date grouping."
             shape-rule))))

;;; ------------------------------------------------- Responses ----------------------------------------------------

(defn- frontend-url
  "Prefix a `channel.urls` relative `path` with the configured site URL, returning it relative
   when site-url is unset so the tool never emits an absolute URL with an empty host."
  [path]
  (let [base (channel.urls/site-url)]
    (if (str/blank? base)
      path
      (str base path))))

(defn- write-result
  "The created/updated metric echoed to the caller: the `:metric` concise read projection — so the
   echo and a concise `get_content` read carry the same fields by construction — plus `:entity_id`
   (a portable id to update by), `:archived`, and the metric's URL."
  [card]
  (assoc (projections/project :metric :concise card)
         :entity_id (:entity_id card)
         :archived  (boolean (:archived card))
         :url       (frontend-url (channel.urls/metric-path (:id card)))))

;;; -------------------------------------------------- Create ------------------------------------------------------

(defn- create!
  "Run the shared REST create check stack on the resolved query and target collection, then save a
   `metric` card. An omitted `collection_id` means the caller's personal collection, as the v1
   create_metric tool and `question_write` both do."
  [{:keys [name description collection_position] :as args} session-id]
  (let [dataset-query (or (resolve-definition args session-id)
                          (common/throw-teaching-error
                           "Pass the metric's query: `definition` (inline) or `query_handle` (from an execute tool)."))
        collection-id (if (contains? args :collection_id)
                        (common/resolve-collection-id (:collection_id args))
                        (:id (collection/user->personal-collection api/*current-user-id*)))]
    (check-metric-shape! dataset-query)
    (queries/check-allowed-to-create-card! {:dataset_query dataset-query :collection_id collection-id} :metric)
    (-> (queries/create-card!
         (u/remove-nils
          {:name                   name
           :type                   :metric
           :dataset_query          dataset-query
           ;; REST requires both on create; a metric has no display picker in the tool's contract,
           ;; so it gets the app's default for a single aggregation.
           :display                :scalar
           :visualization_settings {}
           :description            description
           :collection_id          collection-id
           :collection_position    collection_position})
         {:id api/*current-user-id*})
        write-result)))

;;; -------------------------------------------------- Update ------------------------------------------------------

(defn- check-is-metric!
  "Refuse to write a metric's contract onto a question or model, so a caller can't retype a card by
   addressing it with the wrong tool."
  [card]
  (when-not (= :metric (:type card))
    (common/throw-teaching-error
     (format "Card %d is a %s, not a metric — use question_write to update it."
             (:id card) (name (:type card))))))

(defn- update!
  "Write-check the existing metric, patch only the caller-supplied fields, then run the shared REST
   update check stack before persisting. A `definition`/`query_handle` re-runs the metric shape
   gate; omitting both leaves the stored query untouched."
  [id {:keys [name description collection_position archived] :as args} session-id]
  (let [card-before  (common/resolve-and-read
                      :model/Card id
                      (fn [cid] (api/write-check :model/Card cid)))
        _            (check-is-metric! card-before)
        card-id      (:id card-before)
        new-query    (resolve-definition args session-id)
        _            (some-> new-query check-metric-shape!)
        raw-updates  (cond-> {}
                       (contains? args :name)                (assoc :name name)
                       (contains? args :description)         (assoc :description description)
                       (contains? args :collection_id)       (assoc :collection_id (common/resolve-collection-id (:collection_id args)))
                       (contains? args :collection_position) (assoc :collection_position collection_position)
                       (contains? args :archived)            (assoc :archived (boolean archived))
                       new-query                             (assoc :dataset_query new-query))
        card-updates (api/updates-with-archived-directly card-before raw-updates)]
    (when-some [query (:dataset_query card-updates)]
      (queries/check-no-save-cycle! card-id query))
    (queries/check-allowed-to-update-card! card-before card-updates)
    (queries/update-card! {:card-before-update    card-before
                           :card-updates          card-updates
                           :actor                 @api/*current-user*
                           :delete-old-dashcards? false})
    (write-result (t2/select-one :model/Card :id card-id))))

;;; -------------------------------------------------- The tool ----------------------------------------------------

(def ^:private metric-write-args-schema
  [:map {:closed true}
   [:method
    [:enum {:description (str "\"create\" makes a new metric (requires `name` and one query source); "
                              "\"update\" edits the one named by `id`.")}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the metric to update."}]
             [:string {:description "21-character entity_id of the metric to update."}]]]]
   [:name {:optional true}
    [:maybe [:string {:min 1 :description "Create only (editable on update): display name of the metric."}]]]
   [:definition {:optional true}
    [:maybe [:map {:description (str "The metric's query: a full single-stage query holding exactly one aggregation "
                                     "and at most one date/datetime breakout. Accepts the portable external dialect "
                                     "— what get_content's \"definition\" include returns for a metric and what "
                                     "execute_query takes — or MBQL 5 with numeric ids. Pass this or query_handle, "
                                     "not both.")}]]]
   [:query_handle {:optional true}
    [:maybe [:string {:min 1 :description (str "A query_handle from execute_query — saves exactly the query that ran. "
                                               "Pass this or definition, not both.")}]]]
   [:description {:optional true}
    [:maybe [:string {:description "Optional human-readable description."}]]]
   [:collection_id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the collection to save the metric in."}]
             [:string {:description "21-character entity_id of the collection, or \"root\" for the root collection."}]]]]
   [:collection_position {:optional true}
    [:maybe [:int {:description "Pins the metric at this position in its collection."}]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Update only: true moves the metric to the trash, false restores it. "
                                         "Archiving is the only removal path — there is no hard delete.")}]]]])

(def ^:private metric-write-entry
  {:tool-name       "metric_write"
   :update-scope    metabot.scope/agent-metric-update
   :create-required [:name]})

(registry/deftool metric-write
  "Create or update a metric: a saved, reusable aggregation that lives in a collection and can be queried on its own
  or referenced from other queries. A metric is not a measure — a measure belongs to one table and is only usable
  inside a query against that table, while a metric is standalone content. method: \"create\" requires name and one
  query source; method: \"update\" requires id and accepts archived (true trashes, false restores — there is no hard
  delete). Pass the query as definition (a full single-stage query in the portable external dialect execute_query
  takes and get_content's \"definition\" include returns, or MBQL 5 with numeric ids) or as a query_handle from
  execute_query — one or the other, not both. The query must have exactly one aggregation (count, sum, average…) and
  at most one date/datetime grouping; anything else is a teaching error, so build it with execute_query first. Native
  SQL cannot be a metric — save it with question_write. Optional: description, collection_id (omit to save to your
  personal collection; pass \"root\" for the root collection), collection_position to pin. Updating a card that is a
  question or a model is refused rather than retyping it. Requires write permission on the metric and curate
  permission on the target collection."
  {:name         "metric_write"
   :scope        metabot.scope/agent-metric-create
   :update-scope metabot.scope/agent-metric-update
   :annotations  {:readOnlyHint false :destructiveHint false}
   :args         metric-write-args-schema}
  [args {:keys [token-scopes session-id]}]
  (let [dispatched (common/dispatch-write metric-write-entry token-scopes args)
        payload    (case (first dispatched)
                     :create
                     (let [[_ body] dispatched]
                       (when (contains? body :archived)
                         (common/throw-teaching-error
                          "`archived` applies to method \"update\" only — remove it from this create call."))
                       (create! body session-id))

                     :update
                     (let [[_ id body] dispatched]
                       (update! id body session-id)))]
    (common/success-content payload payload)))
