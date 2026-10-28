(ns metabase.metabot.tools.util
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.core :as tools]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defn handle-agent-error
  "Return an agent output for agent errors, re-throw `e` otherwise.
   Preserves :status-code and :terminal-error? from ex-data."
  [e]
  (let [{:keys [agent-error? status-code terminal-error?]} (ex-data e)]
    (if agent-error?
      (cond-> {:output (ex-message e)}
        status-code     (assoc :status-code status-code)
        terminal-error? (assoc :terminal-error? true))
      (throw e))))

(defn handle-agent-or-api-error
  "Return an agent output for agent errors and API check refusals, re-throw `e` otherwise. A refusal is an exception
  with a 4xx `:status-code`, like the 403 or 404 from [[api/read-check]]."
  [e]
  (let [{:keys [agent-error? status-code]} (ex-data e)]
    (if (and (not agent-error?) (int? status-code) (<= 400 status-code 499))
      {:output (ex-message e) :status-code status-code}
      (handle-agent-error e))))

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

(defn- table-reference
  "Return the name of the FK an implicitly joined `col` comes through, like \"User\" for `User ID`."
  [query col]
  (when (and (:fk-field-id col)
             (:table-id col))
    (some->> (lib.metadata/field query (:fk-field-id col))
             (lib/display-name query)
             lib/display-name-without-id)))

(defn- table-portable-path
  "Return the portable path `[db-name, schema-or-null, table-name]` of the table with `table-id`.

    (table-portable-path query venues-id) ;=> [\"test-data (h2)\" \"PUBLIC\" \"VENUES\"]

  Returns nil when the database or the table has no name."
  [query table-id]
  (let [table (lib.metadata/table query table-id)
        db    (lib.metadata/database query)]
    (when (and (:name db) (:name table))
      [(:name db) (:schema table) (:name table)])))

(defn- column-portable-fk
  "Build the portable FK path `[db-name, schema-or-null, table-name, field-name …]` for a column
  that has a real numeric `:id`. Returns nil for expression / aggregation columns that don't
  correspond to a database field."
  [query column]
  (when (and (:id column) (:table-id column))
    (let [;; walk the `:parent-id` chain in case this is a JSON-unfolded nested field
          chain (loop [acc [(:name column)]
                       pid (:parent-id column)]
                  (if pid
                    (let [parent (lib.metadata/field query pid)]
                      (recur (cons (:name parent) acc) (:parent-id parent)))
                    acc))]
      (some-> (table-portable-path query (:table-id column))
              (into chain)))))

(defn- fk-target-portable-fk
  "If `column` is an FK (has a non-nil `:fk-target-field-id`), return the portable FK path of
  the target field, walking the parent-id chain for JSON-unfolded targets. Returns nil for
  non-FK columns or when the target can't be resolved."
  [query column]
  (when-let [tgt-id (:fk-target-field-id column)]
    (when-let [tgt (lib.metadata/field query tgt-id)]
      (column-portable-fk query tgt))))

(defn column-field-id
  "Return the physical field ID or column alias used as a column's `field_id`."
  [column]
  (or (:id column)
      (:lib/desired-column-alias column)
      (:lib/source-column-alias column)))

(defn- renamed-field-column?
  "Return true when `column` is a database field whose output name differs from the field's own name.

  A card over VENUES joined to VENUES returns the joined copy of `NAME` as `NAME_2`, with the `:id` of `NAME`:
  that copy is renamed. A portable FK path for it names no real column, and the physical path names the first copy."
  [query column]
  (boolean
   (when-let [field (some->> (:id column) (lib.metadata/field query))]
     (not= (:name column) (:name field)))))

(defn ->result-column
  "Return tool result column for `column` of `query`.
  Uses the real field `:id` when available, falling back to column name for
  expression/aggregation columns that don't have a database field ID.

  Also includes a `:portable_fk` key with the portable foreign-key path
  `[db-name, schema, table-name, field-name …]` when the column maps to a real database field.
  The representations-format notebook query tool expects fields to be referenced by this path
  rather than by numeric id.

  A renamed copy of a field, like the joined copy `NAME_2` of `NAME` on a card stage, has no `:portable_fk`; its
  `:field_id` is its output name."
  [query column]
  (let [base-type         (some-> (:base-type column) u/qualified-name)
        effective-type    (some-> (:effective-type column) u/qualified-name)
        semantic-type     (some-> (:semantic-type column) u/qualified-name)
        coercion-strategy (some-> (:coercion-strategy column) u/qualified-name)
        renamed?          (try (renamed-field-column? query column)
                               (catch Exception _ false))
        field-id          (if renamed? (:name column) (column-field-id column))
        portable-fk       (when-not renamed?
                            (try (column-portable-fk query column)
                                 (catch Exception _ nil)))
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
                      :table_reference (table-reference query column)))))

(defn find-column-by-field-id
  "Find a column by its emitted field ID, returning nil if no column matches.

    (find-column-by-field-id 48 columns)                  ;=> the column with field ID 48
    (find-column-by-field-id card-query \"NAME_2\" columns) ;=> the renamed copy with output name NAME_2

  Accepts physical field IDs as integers or numeric strings, and aliases for virtual columns. With `query`, it also
  accepts the output name of a renamed field copy of `query`, like `\"NAME_2\"`. A numeric ID shared by a field and
  its copy finds the first of them."
  ([field-id columns]
   (when (some? field-id)
     (let [numeric-id (cond
                        (int? field-id) field-id
                        (string? field-id) (parse-long field-id))]
       (or (m/find-first #(= (column-field-id %) field-id) columns)
           (when numeric-id
             (m/find-first #(= (:id %) numeric-id) columns))
           (m/find-first #(= (column-field-id %) (str field-id)) columns)))))
  ([query field-id columns]
   (or (find-column-by-field-id field-id columns)
       (when (string? field-id)
         (m/find-first #(and (= (:name %) field-id) (renamed-field-column? query %)) columns)))))

(defn- renamed-column-source-table
  "Return the portable path of the table of a renamed field copy, or nil for any other column.

    (renamed-column-source-table query name-2-column) ;=> [\"test-data (h2)\" \"PUBLIC\" \"VENUES\"]"
  [query column]
  (try
    (when (renamed-field-column? query column)
      (table-portable-path query (:table-id column)))
    (catch Exception _ nil)))

(defn- fk-path
  "Return the FK column that an implicitly joined `column` comes through, as `[fk-field-id fk-field-name]`.

    (fk-path categories-name-via-peer) ;=> [49 \"Peer__CATEGORY_ID\"]

  A card over VENUES joined to VENUES returns `CATEGORY_ID` twice, with one field id. Only the name distinguishes the
  CATEGORIES columns reached through each copy."
  [column]
  ((juxt :fk-field-id :fk-field-name) column))

(defn- multi-fk-table-ids
  "Return the ids of the tables that `columns` reach through more than one FK column.

    (multi-fk-table-ids venues-with-peer-columns) ;=> #{categories-id}"
  [columns]
  (->> (filter :fk-field-id columns)
       (group-by :table-id)
       (keep (fn [[table-id cols]]
               (when (< 1 (count (into #{} (map fk-path) cols)))
                 table-id)))
       set))

(defn- fk-column-label
  "Return the label of the FK column of `columns` that implicitly joined `column` comes through, without \"ID\".

    (fk-column-label query columns categories-name-via-peer) ;=> \"Peer → Category\""
  [query columns column]
  (let [[fk-id fk-name] (fk-path column)]
    (some->> columns
             (m/find-first #(and (= fk-id (:id %))
                                 (= fk-name (:lib/source-column-alias %))))
             (lib/display-name query)
             lib/display-name-without-id)))

(defn- multi-fk-field-clause
  "Return the field clause that reaches `column` through its own FK column, with `source-field` and
  `source-field-name`.

    (multi-fk-field-clause query categories-name-via-peer)
    ;=> [\"field\"
    ;    {\"source-field\" [\"test-data (h2)\" \"PUBLIC\" \"VENUES\" \"CATEGORY_ID\"]
    ;     \"source-field-name\" \"Peer__CATEGORY_ID\"}
    ;    [\"test-data (h2)\" \"PUBLIC\" \"CATEGORIES\" \"NAME\"]]

  Returns nil when a portable path cannot be built."
  [query column]
  (let [source-field (column-portable-fk query (lib.metadata/field query (:fk-field-id column)))
        target       (column-portable-fk query column)]
    (when (and source-field target)
      ["field" {"source-field" source-field "source-field-name" (:fk-field-name column)} target])))

(defn- multi-fk-dimension
  "Return the `:table_reference` and `:reference` that distinguish `column` from the same column through another FK.

    (multi-fk-dimension query columns categories-name-via-peer)
    ;=> {:table_reference \"Peer → Category\", :reference [\"field\" {...} [...]]}"
  [query columns column]
  (try
    (m/assoc-some {}
                  :table_reference (fk-column-label query columns column)
                  :reference       (multi-fk-field-clause query column))
    (catch Exception _ nil)))

(defn- multi-fk-row
  "Add the [[multi-fk-dimension]] of `column` to its dimension `row`. Without a `:reference`, drop the portable FK.

    (multi-fk-row query columns column {:portable_fk [db \"PUBLIC\" \"CATEGORIES\" \"NAME\"] ...})
    ;=> {:reference [\"field\" {...} [...]], :table_reference \"Peer → Category\", ...}
    ;   or, when no clause can be built: {:source_table [db \"PUBLIC\" \"CATEGORIES\"], ...}"
  [query columns column row]
  (let [row (merge row (multi-fk-dimension query columns column))]
    (if (:reference row)
      row
      ;; The bare portable FK cannot distinguish the FK columns on a card stage, so it fails as ambiguous.
      (-> (dissoc row :portable_fk)
          (m/assoc-some :source_table (some->> (:portable_fk row) (take 3) vec))))))

(defn metric-dimensions
  "Return the dimension rows of a metric for `columns` of its query `query`.

    (metric-dimensions query columns) ;=> [{:field_id 48 :portable_fk [...] ...} {:field_id \"NAME_2\" ...} ...]

  Each row is a [[->result-column]]. A renamed field copy also gets `:source_table`, the portable path of its table.
  On a stage over a card, a column that the card reaches through more than one FK column gets the label of its own FK
  column as `:table_reference`, and a `:reference` field clause that joins through that FK column. When that clause
  cannot be built, the row has no reference: it keeps only its table, as `:source_table`."
  [query columns]
  (let [multi-fk-ids (when (lib/primary-source-card-id query)
                       (multi-fk-table-ids columns))]
    (mapv (fn [column]
            (-> (->result-column query column)
                (m/assoc-some :source_table (renamed-column-source-table query column))
                (cond->> (and (:fk-field-id column) (contains? multi-fk-ids (:table-id column)))
                  (multi-fk-row query columns column))))
          columns)))

(defn schedule->schedule-map
  "Convert a tool schedule map to the schedule-map format used by cron and pulse channels.
  Keys can be snake_case, as the tool schemas define them, or kebab-case.
  E.g. {:frequency :daily :hour 9} => {:schedule_type \"daily\" :schedule_hour 9 ...}"
  [schedule]
  (let [{:keys [frequency hour day-of-week day-of-month]} (u/normalize-map schedule)]
    {:schedule_type  (name frequency)
     :schedule_hour  hour
     :schedule_day   (or (some->> day-of-week
                                  name
                                  u/lower-case-en
                                  (re-find #"^(?:mon|tue|wed|thu|fri|sat|sun)"))
                         (some->> day-of-month
                                  name
                                  u/lower-case-en
                                  (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                  second))
     :schedule_frame (some->> day-of-month name (re-find #"^(?:first|mid|last)"))}))

(defn get-database
  "Get the `fields` of the database with ID `id`."
  [id & fields]
  (-> (metabot.db/database-with-columns (into [:model/Database :id] fields) id)
      api/read-check))

(defn get-table
  "Get the `fields` of the table with ID `id`."
  [id & fields]
  (-> (metabot.db/active-table-with-columns (into [:model/Table :id] fields) id)
      api/read-check))

(tools/defrecoverable wrong-source-type!
  "The card ID identifies a different kind of data source."
  {:payload [:map {:closed true}
             [:id :int]
             [:expected-type [:enum :model :question :metric]]
             [:actual-type [:enum :model :metric :question]]]}
  [{:keys [id expected-type actual-type]}]
  {:message (str (if (= expected-type :metric) "Card " "ID ")
                 id " is a " (name actual-type) ", not a " (name expected-type) ".")
   :recovery [{:text (str "Retry using a " (name expected-type) " ID.") :uses #{}}]})

(defn get-card
  "Retrieve a readable card by ID, optionally requiring a particular card type."
  ([id]
   (-> (metabot.db/card id)
       api/read-check))
  ([id expected-type]
   (let [card (get-card id)]
     (when-not (= expected-type (:type card))
       (wrong-source-type! {:id id :expected-type expected-type :actual-type (:type card)}))
     card)))

(defn get-card-by-entity-id
  "Retrieve a readable card by its 21-char NanoID `entity_id`, or `nil` if not found. Used by
  [[metabase.metabot.tools.construct/resolve-database-id-from-first-stage]] to look up the
  database-id of a `source-card:` stage before the metadata provider is built.

  Does NOT go through the serdes `lookup-by-id` machinery because we want `nil` on miss
  (not a thrown exception) so the caller can surface a tool-specific agent error. If the
  card exists but the current user cannot read it, `api/read-check` raises a 403 instead of
  silently letting the representations resolver use an inaccessible card."
  [entity-id]
  (some-> (metabot.db/card-by-entity-id entity-id)
          api/read-check))

(defn card-query-metadata
  "Return an MBQL pivot question's underlying query, or the card metadata for other cards."
  [card card-metadata]
  (if (and (= :question (:type card))
           (= :pivot (:display card))
           (not (lib/native-only-query? (:dataset-query card-metadata))))
    (:dataset-query card-metadata)
    card-metadata))

(defn card-query
  "Return a query for the model or question with ID `card-id` and card type `expected-type`."
  [card-id expected-type]
  (when-let [card (get-card card-id expected-type)]
    (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
      (lib/query mp (card-query-metadata card (lib.metadata/card mp card-id))))))

(defn card-results-query
  "Return a query over the result columns of the card with ID `card-id`, whatever its type: what the card exposes,
  rather than what its definition reads. [[card-query]] widens this to the definition for questions. With
  `expected-type`, the card must be of that type, as for [[card-query]]."
  ([card-id]
   (card-results-query card-id nil))
  ([card-id expected-type]
   (when-let [card (if expected-type (get-card card-id expected-type) (get-card card-id))]
     (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
       (lib/query mp (lib.metadata/card mp card-id))))))

(defn card-definition-table-ids
  "The ids of the Tables the definition of the card with ID `card-id` reads, plus the Tables one FK hop away from
  them, following source Cards to their own definitions (ten levels at most), or nil when the card is missing or
  its query can't be built. A native definition names no Tables and contributes none: its result metadata can map
  a column to any Field, so it is not trusted to say which Tables it exposes."
  [card-id]
  (when-let [card (get-card card-id)]
    (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
      (try
        (loop [todo #{card-id} seen #{} tables #{} depth 0]
          (if (or (empty? todo) (= depth 10))
            tables
            (let [queries (into []
                                (comp (keep (fn [{:keys [dataset-query]}] (some->> dataset-query (lib/query mp))))
                                      (remove lib/any-native-stage?))
                                (lib.metadata/bulk-metadata mp :metadata/card todo))
                  refs    (if (seq queries)
                            (lib/all-referenced-entity-ids queries {:include-implicitly-joinable? true})
                            {})
                  seen    (into seen todo)]
              (recur (into #{} (remove seen) (:card refs))
                     seen
                     (into tables (:table refs))
                     (inc depth)))))
        (catch Exception e
          (log/debug e "Can't walk the card's definition; treating its tables as unknown")
          nil)))))

(defn table-query
  "Return a query based on the table with ID `table-id`."
  [table-id]
  (when-let [table (get-table table-id :db_id)]
    (let [mp (lib-be/application-database-metadata-provider (:db_id table))]
      (lib/query mp (lib.metadata/table mp table-id)))))

(defn- destination-db-ids
  "Returns the subset of `db-ids` that back a destination (routed) database -- routing internals
  reachable only through their router database (see
  [[metabase.metabot.tools.resources/check-resource-database]])."
  [db-ids]
  (when (seq db-ids)
    (metabot.db/destination-database-ids db-ids)))

(defn get-metrics-and-models
  "Retrieve the metric and model cards for the Metabot instance with ID `metabot-id` from the app DB.

  Only cards visible to the current user are returned, excluding those backed by a destination
  (routed) database (see [[destination-db-ids]])."
  [metabot-id & {:keys [limit]}]
  (let [cards (metabot.db/metabot-metrics-and-models metabot-id limit)
        destination-ids (destination-db-ids (into #{} (keep :database_id) cards))]
    (if (seq destination-ids)
      (remove #(contains? destination-ids (:database_id %)) cards)
      cards)))

;;; ------------------------------------------ metric sources ------------------------------------------

(defn metric-card-shape-get
  "Read `kebab-k` from a lib metadata card or `snake-k` from a Toucan row.

  A lib metadata card throws on snake_case keys, even when the corresponding kebab-case value is nil."
  [card kebab-k snake-k]
  (if (:lib/type card)
    (get card kebab-k)
    (get card snake-k)))

(defn readable-source-cards
  "Return readable cards from `card-ids` as `{card-id -> row}`, or nil for empty input.

  Read the cards in one query, including `:name`, `:entity_id`, and the columns needed by `can-read?`.
  Missing and unreadable cards are omitted."
  [card-ids]
  (when (seq card-ids)
    (into {}
          (comp (filter mi/can-read?) (map (juxt :id identity)))
          (metabot.db/card-source-rows card-ids))))

(defn card-source-table-id
  "Return the ID of the table that the card with `card-id` reads from, following its source cards.

  Unlike `report_card.table_id`, which is written only when a card is saved, this reads each card's current query, so
  it reflects an upstream card that has since moved to another table. Return nil when the chain ends in a native query
  or a missing card."
  [metadata-providerable card-id]
  (loop [card-id card-id, seen #{}]
    (when-let [query (and card-id
                          (not (seen card-id))
                          (not-empty (:dataset-query (lib.metadata/card metadata-providerable card-id))))]
      (or (lib.util/source-table-id query)
          (recur (lib.util/source-card-id query) (conj seen card-id))))))

(defn metric-required-source
  "Return the source required to use metric `card`, or nil when its definition cannot be read.

  Return `{:kind :card, :card-id C}` for a single-stage definition on card C. Otherwise return
  `{:kind :table, :table-id T, :bare-table-only? boolean}`. A single-stage table metric also works on a card over T;
  a multi-stage metric requires a stage directly on T, even when its definition starts from a card. For such a
  definition, T is the table that the card reads from, per [[card-source-table-id]].
  A nil table ID means there is no usable table source. Read source cards through `metadata-providerable` when
  supplied, or an app-DB metadata provider for the definition's database otherwise.

  This follows `splice-compatible-metrics` in [[metabase.query-processor.middleware.metrics]]. The query processor
  compares the metric's last stage, so the first stage's `report_card.source_card_id` is insufficient.
  Legacy definitions are converted to MBQL 5 before classification. Missing, blank, or unconvertible definitions
  return nil."
  ([card]
   (metric-required-source nil card))
  ([metadata-providerable card]
   (let [definition (metric-card-shape-get card :dataset-query :dataset_query)
         stages     (or (not-empty (:stages definition))
                        (when (seq definition)
                          (try
                            (:stages (lib/->mbql5 definition))
                            (catch Exception _ nil))))]
     (when (seq stages)
       (if-let [card-id (and (= 1 (count stages)) (:source-card (first stages)))]
         {:kind :card, :card-id card-id}
         {:kind             :table
          :table-id         (or (:source-table (first stages))
                                (some->> (:source-card (first stages))
                                         (card-source-table-id
                                          (or metadata-providerable
                                              (lib-be/application-database-metadata-provider
                                               (:database definition))))))
          :bare-table-only? (> (count stages) 1)})))))

(defn- table-breakouts
  "Return the stage 0 breakouts of `definition` that a query on table `table-query` can also break out by.

    (table-breakouts orders-model-metric-query orders-query) ;=> [created-at-column-with-day-bucket]

  A breakout matches a column of the table by field `:id` and FK field id, and keeps its temporal bucket. A breakout
  on a column that only the card has, like an expression, is dropped."
  [definition table-query]
  (let [table-columns (into {}
                            (map (juxt (juxt :id :fk-field-id) identity))
                            (lib/breakoutable-columns table-query))
        ;; A card column from an implicit join keeps its FK as `:lib/original-fk-field-id`.
        column-key    (juxt :id (some-fn :fk-field-id :lib/original-fk-field-id))]
    (keep (fn [[clause column]]
            (when-let [table-column (get table-columns (column-key column))]
              (lib/with-temporal-bucket table-column (lib/temporal-bucket clause))))
          (map vector (lib/breakouts definition 0) (lib/breakouts-metadata definition 0)))))

(defn- table-metric-query
  "Return a query on table `table-id` that aggregates `metric-card`.

    (table-metric-query mp orders-model-metric orders-id) ;=> {:stages [{:source-table orders-id ...}]}

  It keeps the stage 0 breakouts of the metric's definition that work on the table, as [[table-breakouts]] says."
  [mp metric-card table-id]
  (let [query (lib/query mp (lib.metadata/table mp table-id))]
    (-> (reduce lib/breakout query (table-breakouts (lib/query mp (:dataset-query metric-card)) query))
        (lib/aggregate (lib.metadata/metric mp (:id metric-card))))))

(defn metric-dimension-query
  "Return the query whose columns are the dimensions of `metric-card`, framed on the source that `required` names.

    (metric-dimension-query mp orders-model-metric {:kind :table, :table-id orders-id, :bare-table-only? true})
    ;=> a query on ORDERS with the metric as its aggregation

  A multi-stage metric whose definition starts from a card works only on a bare stage on that card's table, so its
  dimensions are the table's. Other metrics, and a metric whose card chain has no table, get lib's metric query.
  `required` comes from [[metric-required-source]]."
  [mp metric-card required]
  (let [metric-query (lib/query mp metric-card)]
    (if (and (:bare-table-only? required)
             (:table-id required)
             (lib/primary-source-card-id metric-query))
      (table-metric-query mp metric-card (:table-id required))
      metric-query)))

(defn metric-query
  "Return the query whose columns are the dimensions of the metric with ID `metric-id`.

    (metric-query 12) ;=> a query on ORDERS with the metric as its aggregation

  See [[metric-dimension-query]]. Throws an agent error that names the card's type when the card is a question or
  model."
  [metric-id]
  (when-let [card (get-card metric-id :metric)]
    (let [mp     (lib-be/application-database-metadata-provider (:database_id card))
          metric (lib.metadata/metric mp metric-id)]
      (metric-dimension-query mp metric (metric-required-source mp metric)))))

(defn metric-compatible-with-stage?
  "Return whether `required` permits a metric on the stage's source.

  `required` comes from [[metric-required-source]]. `stage-table-id` is the resolved primary table ID, including
  for card sources; `stage-card-id` identifies the source card. Throw for an unrecognized source kind."
  [required {:keys [stage-card-id stage-table-id]}]
  (case (:kind required)
    :card  (= (:card-id required) stage-card-id)
    :table (and (some? (:table-id required))
                (= (:table-id required) stage-table-id)
                (or (not (:bare-table-only? required))
                    (nil? stage-card-id)))
    (throw (ex-info "Unrecognized metric source kind" {:required required}))))

(defn metric-source-fields
  "Return the LLM fields identifying a metric's usable source.

  A `source-card` with `:id`, `:name`, and `:entity_id` produces `:source_card_*` fields. A `source-table` with
  `:id`, `:schema`, and `:name` produces `:base_table_*` fields; `database-name` is needed for the portable FK.
  The caller must check access and supply the source selected by [[metric-required-source]].
  When neither is usable, return `{:source_unavailable true}` so the LLM knows to skip the metric."
  [{:keys [source-card source-table database-name]}]
  (cond
    source-card
    {:source_card_id                 (:id source-card)
     :source_card_name               (:name source-card)
     :source_card_portable_entity_id (:entity_id source-card)}

    source-table
    (cond-> {:base_table_id     (:id source-table)
             :base_table_name   (:name source-table)
             :base_table_schema (:schema source-table)}
      database-name (assoc :base_table_portable_fk [database-name (:schema source-table) (:name source-table)]))

    :else
    {:source_unavailable true}))
