(ns metabase.metabot.tools.util
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]
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

(defn add-table-reference
  "Add table-reference to columns that have FK relationships."
  [query col]
  (cond-> col
    (and (:fk-field-id col)
         (:table-id col))
    (assoc :table-reference (->> (lib.metadata/field query (:fk-field-id col))
                                 (lib/display-name query)
                                 lib/display-name-without-id))))

(defn table-field-id-prefix
  "Return the field ID prefix for `table-id`."
  [table-id]
  (str "t" table-id "-"))

(defn card-field-id-prefix
  "Return the field ID prefix for a model or a metric with ID `card-id`."
  [card-id]
  (str "c" card-id "-"))

(defn query-field-id-prefix
  "Return the field ID prefix for `query-id`."
  [query-id]
  (str "q" query-id "-"))

(def any-prefix-pattern
  "A prefix pattern accepting columns from any entity."
  #"^.*-(\d+)")

(defn ->result-database
  "Build the agent result map for a database."
  [db]
  {:id     (:id db)
   :name   (:name db)
   :engine (some-> (:engine db) name)})

(defn ->result-table
  "Build the base agent result map for a table (without `:fields`).
  Accepts either a raw t2 row (underscore keys) or a lib-shaped table (hyphenated keys)."
  [table db-engine]
  (let [table (u/kebab->snake-keys table)]
    (cond-> {:id              (:id table)
             :type            :table
             :name            (:name table)
             :display_name    (or (:display_name table)
                                  (some->> (:name table) (u.humanization/name->human-readable-name :simple)))
             :database_id     (:db_id table)
             :database_engine db-engine
             :database_schema (:schema table)}
      (:description table) (assoc :description (:description table)))))

(defn ->result-column
  "Return a tool result column for `column`. Position is determined by `index`; the field ID is
  `field-id-prefix` + `index`.

  Accepts either a raw t2 row (underscore keys) or a lib-shaped column (hyphenated keys).

  The 3-arity takes the display name directly from the column; the 4-arity computes it via
  `(lib/display-name query column)`."
  ([column index field-id-prefix]
   (let [column            (u/kebab->snake-keys column)
         base-type         (some-> (:base_type column) u/qualified-name)
         effective-type    (some-> (:effective_type column) u/qualified-name)
         semantic-type     (some-> (:semantic_type column) u/qualified-name)
         coercion-strategy (some-> (:coercion_strategy column) u/qualified-name)]
     (-> {:field_id     (str field-id-prefix index)
          ;; Prefer desired-column-alias over source-column-alias to ensure we use deduplicated names if needed
          :name         (or (:lib/desired_column_alias column)
                            (:lib/source_column_alias column)
                            (:name column))
          :display_name (:display_name column)}
         (m/assoc-some :description       (:description column)
                       :base_type         base-type
                       :effective_type    (when (not= effective-type base-type) effective-type)
                       :semantic_type     semantic-type
                       :database_type     (:database_type column)
                       :coercion_strategy coercion-strategy
                       :field_values      (:field_values column)
                       :table_reference   (:table_reference column)))))
  ([query column index field-id-prefix]
   (->result-column (assoc column :display-name (lib/display-name query column))
                    index
                    field-id-prefix)))

(defn parse-field-id
  "Parse a field-id string into its components.

  The field-id format is '<model-tag><model-id>-<field-index>' where:
  - model-tag is 't' for tables, 'c' for cards/models/metrics, or 'q' for ad-hoc queries
  - model-id is the numeric ID (for tables/cards) or nano-id (for queries)
  - field-index is the index within that model's visible columns

  Returns a map with :model-tag, :model-id, and :field-index keys, or nil if the format is invalid
  or the input is not a string.

  Examples:
    (parse-field-id \"t154-1\") => {:model-tag \"t\", :model-id 154, :field-index 1}
    (parse-field-id \"qpuL95JSvym3k23W1UUuog-0\") => {:model-tag \"q\", :model-id \"puL95JSvym3k23W1UUuog\", :field-index 0}
    (parse-field-id nil) => nil
    (parse-field-id \"invalid\") => nil"
  [field-id]
  (when (and field-id (string? field-id))
    (when-let [[_ model-tag model-id field-index] (re-matches #"^([tcq])(.+)-(\d+)$" field-id)]
      {:model-tag   model-tag
       ;; For tables and cards, model-id should be numeric; for queries it's a nano-id string
       :model-id    (if (= model-tag "q")
                      model-id
                      (parse-long model-id))
       :field-index (parse-long field-index)})))

(defn resolve-column
  "Resolve the reference `field-id` in filter `item` by finding the column in `columns` specified by `field-id`.

  The field-id format is '<model-tag><model-id>-<field-index>' where:
  - model-tag is 't' for tables, 'c' for cards/models/metrics, or 'q' for ad-hoc queries
  - model-id is the numeric ID (for tables/cards) or nano-id (for queries)
  - field-index is the index within the columns array (using wide field IDs across all visible columns)

  The `expected-prefix` parameter validates that the field-id starts with the expected prefix (e.g., 't154-' for table 154).
  This prevents accidentally using a field-id from a different entity.

  For example, 't154-1' refers to the column at index 1 in the columns array,
  and 'qpuL95JSvym3k23W1UUuog-0' refers to the column at index 0."
  [{:keys [field-id] :as item} expected-prefix columns]
  (if-let [{:keys [model-tag model-id field-index]} (parse-field-id field-id)]
    (do
      ;; Validate that the field-id matches the expected prefix
      ;; Supports both string prefixes (e.g., "t154-") and regex patterns (e.g., #"^.*-(\d+)")
      (when-not (if (string? expected-prefix)
                  (str/starts-with? field-id expected-prefix)
                  (re-matches expected-prefix field-id))
        (log/warn "Field id prefix mismatch"
                  {:field-id field-id
                   :expected-prefix expected-prefix
                   :model-tag model-tag
                   :model-id model-id})
        (throw (ex-info (str "field " field-id " does not match expected prefix " expected-prefix)
                        {:agent-error? true
                         :status-code 400
                         :field-id field-id
                         :expected-prefix expected-prefix})))
      (if-let [column (get columns field-index)]
        (assoc item :column column)
        (throw (ex-info (str "field " field-id " not found - no column at index " field-index)
                        {:agent-error? true
                         :status-code 404
                         :field-id field-id
                         :model-tag model-tag
                         :model-id model-id
                         :field-index field-index
                         :available-columns-count (count columns)}))))
    (throw (ex-info (str "Invalid field_id format: " field-id)
                    {:agent-error? true
                     :status-code 400
                     :field-id field-id}))))

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

(defn- database-filter
  "HoneySQL WHERE clause matching tables (alias `:t`) belonging to the database with `database-id`."
  [database-id]
  [:= :t.db_id database-id])

(defn- table-filter
  "HoneySQL WHERE clause keeping only user-visible tables (alias `:t`): active and not hidden,
  technical, or cruft."
  []
  [:and [:= :t.active true]
   [:or
    [:= :t.visibility_type nil]
    [:not-in :t.visibility_type [:inline ["hidden" "technical" "cruft"]]]]])

(defn- field-filter
  "HoneySQL WHERE clause keeping only user-visible fields (alias `:f`): active and not retired
  or sensitive."
  []
  [:and [:= :f.active true]
   [:or
    [:= :f.visibility_type nil]
    [:not-in :f.visibility_type [:inline ["retired" "sensitive"]]]]])

(defn list-databases
  "Get all databases the current user can read."
  []
  (->> (t2/select [:model/Database :id :name :engine])
       (filterv mi/can-read?)))

(defn get-database
  "Get the database with ID `database-id`."
  [database-id]
  (-> (t2/select-one [:model/Database :id :name :engine] :id database-id)
      api/read-check))

(defn list-database-tables
  "Get all active tables in the database with ID `database-id`."
  [database-id]
  (->> (t2/select [:model/Table :t.id :t.db_id :t.name :t.schema :t.display_name :t.description]
                  {:from  [[(t2/table-name :model/Table) :t]]
                   :where [:and (database-filter database-id) (table-filter)]})
       (filterv mi/can-read?)))

(defn list-database-table-fields
  "Get all active fields for active tables in the database with ID `database-id`."
  [database-id]
  (t2/select [:model/Field :f.id :f.table_id :f.position :f.name :f.display_name :f.description
              :f.base_type :f.effective_type :f.semantic_type :f.coercion_strategy :f.database_type]
             {:from  [[(t2/table-name :model/Field) :f]]
              :join  [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
              :where [:and (database-filter database-id) (table-filter) (field-filter)]}))

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
  and its subcollections. If the metabot has use_verified_content enabled, only verified
  content is returned.

  Ignores analytics content."
  [metabot-id & {:keys [limit] :as _opts}]
  (let [metabot (t2/select-one :model/Metabot :id metabot-id)
        metabot-collection-id (:collection_id metabot)
        use-verified-content? (:use_verified_content metabot)
        collection-filter (if metabot-collection-id
                            (let [collection (t2/select-one :model/Collection :id metabot-collection-id)
                                  collection-ids (conj (collection/descendant-ids collection) metabot-collection-id)]
                              [:in :collection_id collection-ids])
                            [:and true])
        base-query {:select [:report_card.*]
                    :from   [[:report_card]]
                    :where [:and
                            [:!= :report_card.database_id audit-app/audit-db-id]
                            collection-filter
                            [:in :type [:inline ["metric" "model"]]]
                            [:= :archived false]
                            (when api/*current-user-id*
                              (collection/visible-collection-filter-clause :collection_id))]}]
    (cond-> base-query
      ;; Prioritize verified content.
      (premium-features/has-feature? :content-verification)
      (assoc
       :left-join [[:moderation_review :mr] [:and
                                             [:= :mr.moderated_item_id :report_card.id]
                                             [:= :mr.moderated_item_type [:inline "card"]]
                                             [:= :mr.most_recent true]]]
       :order-by [[[:case [:= :mr.status [:inline "verified"]] [:inline 0]
                    :else [:inline 1]]
                   :asc]])

      ;; Filter verified items only when that's desired.
      (and (premium-features/has-feature? :content-verification)
           use-verified-content?)
      (update :where conj [:= :mr.status [:inline "verified"]])

      (integer? limit)
      (assoc :limit limit))))

(defn get-metrics-and-models
  "Retrieve the metric and model cards for the Metabot instance with ID `metabot-id` from the app DB.

  Only cards visible to the current user are returned."
  [metabot-id & {:as opts}]
  (t2/select :model/Card (-> (metabot-metrics-and-models-query metabot-id opts)
                             (update :order-by (fnil conj []) [:id]))))
