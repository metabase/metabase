(ns metabase.metabot.tools.util
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn handle-agent-error
  "Return an agent output for agent errors, re-throw `e` otherwise.
   Preserves :status-code from ex-data for proper HTTP status codes in agent API."
  [e]
  (let [{:keys [agent-error? status-code]} (ex-data e)]
    (if agent-error?
      (cond-> {:output (ex-message e)}
        status-code (assoc :status-code status-code))
      (throw e))))

(defn convert-field-type
  "Return tool type for `column`."
  [column]
  (let [column (u/normalize-map column)]
    (cond
      (lib.types.isa/boolean? column)                :boolean
      (lib.types.isa/string-or-string-like? column)  :string
      (lib.types.isa/numeric? column)                :number
      (isa? (:effective-type column) :type/DateTime) :datetime
      (isa? (:effective-type column) :type/Time)     :time
      (lib.types.isa/temporal? column)               :date)))

(defn add-table-reference
  "Add table-reference to columns that have FK relationships."
  [query col]
  (cond-> col
    (and (:fk-field-id col)
         (:table-id col))
    (assoc :table-reference (->> (lib.metadata/field query (:fk-field-id col))
                                 (lib/display-name query)
                                 lib/display-name-without-id))))

(defn- column-portable-fk
  "Build the portable FK path `[db-name, schema-or-null, table-name, field-name …]` for a column
  that has a real numeric `:id`. Returns nil for expression / aggregation columns that don't
  correspond to a database field."
  [query column]
  (when (and (:id column) (:table-id column))
    (let [table (lib.metadata/table query (:table-id column))
          db    (lib.metadata/database query)
          ;; walk the `:parent-id` chain in case this is a JSON-unfolded nested field
          chain (loop [acc [(:name column)]
                       pid (:parent-id column)]
                  (if pid
                    (let [parent (lib.metadata/field query pid)]
                      (recur (cons (:name parent) acc) (:parent-id parent)))
                    acc))]
      (when (and (:name db) (:name table))
        (into [(:name db) (:schema table) (:name table)] chain)))))

(defn- fk-target-portable-fk
  "If `column` is an FK (has a non-nil `:fk-target-field-id`), return the portable FK path of
  the target field, walking the parent-id chain for JSON-unfolded targets. Returns nil for
  non-FK columns or when the target can't be resolved."
  [query column]
  (when-let [tgt-id (:fk-target-field-id column)]
    (when-let [tgt (lib.metadata/field query tgt-id)]
      (column-portable-fk query tgt))))

(defn ->result-column
  "Return tool result column for `column` of `query`.
  Uses the real field `:id` when available, falling back to column name for
  expression/aggregation columns that don't have a database field ID.

  Also includes a `:portable_fk` key with the portable foreign-key path
  `[db-name, schema, table-name, field-name …]` when the column maps to a real database field.
  The representations-format notebook query tool expects fields to be referenced by this path
  rather than by numeric id."
  [query column]
  (let [base-type         (some-> (:base-type column) u/qualified-name)
        effective-type    (some-> (:effective-type column) u/qualified-name)
        semantic-type     (some-> (:semantic-type column) u/qualified-name)
        coercion-strategy (some-> (:coercion-strategy column) u/qualified-name)
        field-id          (or (:id column)
                              (:lib/desired-column-alias column)
                              (:lib/source-column-alias column))
        portable-fk       (try (column-portable-fk query column)
                               (catch Exception _ nil))
        fk-target-fk      (try (fk-target-portable-fk query column)
                               (catch Exception _ nil))]
    (-> {:field_id field-id
         :name (or (:lib/desired-column-alias column)
                   (:lib/source-column-alias column))
         :display_name (lib/display-name query column)
         :type (convert-field-type column)}
        (m/assoc-some :description (:description column)
                      :base_type base-type
                      :effective_type (when (not= effective-type base-type) effective-type)
                      :semantic_type semantic-type
                      :database_type (:database-type column)
                      :coercion_strategy coercion-strategy
                      :field_values (:field-values column)
                      :portable_fk portable-fk
                      :fk_target_portable_fk fk-target-fk
                      :table_reference (:table-reference column)))))

(defn find-column-by-field-id
  "Find a column in `columns` by its real field ID.
  `field-id` may be an integer or a string-encoded integer.
  Returns the matching column or throws an agent error if not found."
  [field-id columns]
  (let [numeric-id (cond
                     (int? field-id) field-id
                     (string? field-id) (parse-long field-id)
                     :else nil)]
    (or (when numeric-id
          (m/find-first #(= (:id %) numeric-id) columns))
        (throw (ex-info (str "Field " field-id " not found")
                        {:agent-error? true
                         :status-code  404
                         :field-id     field-id})))))

(defn schedule->schedule-map
  "Convert a tool schedule map to the schedule-map format used by cron and pulse channels.
  E.g. {:frequency :daily :hour 9} => {:schedule_type \"daily\" :schedule_hour 9 ...}"
  [{:keys [frequency hour day-of-week day-of-month]}]
  {:schedule_type  (name frequency)
   :schedule_hour  hour
   :schedule_day   (or (some-> day-of-week name (subs 0 3) u/lower-case-en)
                       (some->> day-of-month
                                name
                                u/lower-case-en
                                (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                second))
   :schedule_frame (some->> day-of-month name (re-find #"^(?:first|mid|last)"))})

(defn get-database
  "Get the `fields` of the database with ID `id`."
  [id & fields]
  (-> (t2/select-one (into [:model/Database :id] fields) id)
      api/read-check))

(defn get-table
  "Get the `fields` of the table with ID `id`."
  [id & fields]
  (-> (t2/select-one (into [:model/Table :id] fields)
                     :id id
                     :active true)
      api/read-check))

(defn get-card
  "Retrieve the card with `id` from the app DB."
  [id]
  (-> (t2/select-one :model/Card :id id)
      api/read-check))

(defn get-card-by-entity-id
  "Retrieve a readable card by its 21-char NanoID `entity_id`, or `nil` if not found. Used by
  [[metabase.metabot.tools.construct/resolve-database-id-from-first-stage]] to look up the
  database-id of a `source-card:` stage before the metadata provider is built.

  Does NOT go through the serdes `lookup-by-id` machinery because we want `nil` on miss
  (not a thrown exception) so the caller can surface a tool-specific agent error. If the
  card exists but the current user cannot read it, `api/read-check` raises a 403 instead of
  silently letting the representations resolver use an inaccessible card."
  [entity-id]
  (some-> (t2/select-one :model/Card :entity_id entity-id)
          api/read-check))

(defn card-query
  "Return a query based on the card with ID `card-id`."
  [card-id]
  (when-let [card (get-card card-id)]
    (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
      (lib/query mp (cond-> (lib.metadata/card mp card-id)
                      ;; pivot questions have strange result-columns so we work with the dataset-query
                      (#{:question} (:type card)) (get :dataset-query))))))

(defn metric-query
  "Return a query based on the metric with ID `metric-id`."
  [metric-id]
  (when-let [card (get-card metric-id)]
    (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
      (lib/query mp (lib.metadata/metric mp metric-id)))))

(defn table-query
  "Return a query based on the table with ID `table-id`."
  [table-id]
  (when-let [table (get-table table-id :db_id)]
    (let [mp (lib-be/application-database-metadata-provider (:db_id table))]
      (lib/query mp (lib.metadata/table mp table-id)))))

(defn metabot-metrics-and-models-query
  "Return the metric and model cards in metabot scope visible to the current user.

  Takes a metabot-id and returns all metric and model cards in that metabot's collection
  and its subcollections. If the metabot has use_verified_content enabled, only verified-or-curated
  content is returned — verified, official-collection, or library-published cards.

  Ignores analytics content."
  [metabot-id & {:keys [limit] :as _opts}]
  (let [metabot (t2/select-one :model/Metabot :id metabot-id)
        metabot-collection-id (:collection_id metabot)
        use-verified-content? (:use_verified_content metabot)
        verified? (premium-features/has-feature? :content-verification)
        official? (premium-features/has-feature? :official-collections)
        library?  (premium-features/has-feature? :library)
        ;; ids of collections under a Library-type root; their metrics/models are library-published content
        library-coll-ids (when library?
                           (let [roots (t2/select :model/Collection
                                                  :type [:in (mapv name collection/library-collection-types)]
                                                  :location "/")]
                             (into (set (map :id roots)) (mapcat collection/descendant-ids roots))))
        ;; Mirror collections.curation/curated? for card scope: verified, official-collection, or
        ;; library-published (under a Library root). Each disjunct is gated on its feature.
        curated-conds (cond-> []
                        verified? (conj [:= :mr.status [:inline "verified"]])
                        official? (conj [:= :collection.authority_level [:inline "official"]])
                        (seq library-coll-ids) (conj [:in :report_card.collection_id (vec library-coll-ids)]))
        ;; Columns are qualified with report_card because the official-collections branch joins
        ;; `collection`, which shares column names (type, archived, id) — unqualified refs would be ambiguous.
        collection-filter (if metabot-collection-id
                            (let [collection (t2/select-one :model/Collection :id metabot-collection-id)
                                  collection-ids (conj (collection/descendant-ids collection) metabot-collection-id)]
                              [:in :report_card.collection_id collection-ids])
                            [:and true])
        base-query {:select [:report_card.*]
                    :from   [[:report_card]]
                    :where [:and
                            [:!= :report_card.database_id audit-app/audit-db-id]
                            collection-filter
                            [:in :report_card.type [:inline ["metric" "model"]]]
                            [:= :report_card.archived false]
                            (when api/*current-user-id*
                              (collection/visible-collection-filter-clause :report_card.collection_id))]}]
    (cond-> base-query
      verified?
      (update :left-join (fnil into []) [[:moderation_review :mr] [:and
                                                                   [:= :mr.moderated_item_id :report_card.id]
                                                                   [:= :mr.moderated_item_type [:inline "card"]]
                                                                   [:= :mr.most_recent true]]])

      official?
      (update :left-join (fnil into []) [[:collection :collection]
                                         [:= :collection.id :report_card.collection_id]])

      ;; Prioritize curated content.
      (seq curated-conds)
      (assoc :order-by [[[:case (into [:or] curated-conds) [:inline 0] :else [:inline 1]] :asc]])

      ;; Restrict to curated content only when that's desired.
      (and use-verified-content? (seq curated-conds))
      (update :where conj (into [:or] curated-conds))

      ;; Setting on but no curation features active → nothing is curated, so return nothing rather than
      ;; falling through unfiltered to uncurated cards.
      (and use-verified-content? (empty? curated-conds))
      (update :where conj [:= [:inline 1] [:inline 0]])

      (integer? limit)
      (assoc :limit limit))))

(defn get-metrics-and-models
  "Retrieve the metric and model cards for the Metabot instance with ID `metabot-id` from the app DB.

  Only cards visible to the current user are returned."
  [metabot-id & {:as opts}]
  (t2/select :model/Card (-> (metabot-metrics-and-models-query metabot-id opts)
                             ;; qualified: the official-collections branch joins `collection`, which also has `id`
                             (update :order-by (fnil conj []) [:report_card.id]))))
