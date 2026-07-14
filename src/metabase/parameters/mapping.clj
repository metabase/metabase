(ns metabase.parameters.mapping
  "What a parameter can be wired to on a card, and the target that wires it there.

   A filter reaches a card through a *parameter mapping*: the parameter's id, the card's, and a `:target` naming what
   on that card the filter narrows — a column of an MBQL query, a field-filter tag or a variable of a native one. Which
   targets a card offers a given parameter is not obvious from the card: a date filter can only reach a temporal
   column, a category filter only a column whose values are listed, a native query offers its template tags rather than
   its columns, and a model or a metric is filtered as the query built *on* it rather than as the query inside it. That
   list is what the editor's mapping dropdown shows, and [[mapping-options]] is it.

   [[resolve-option]] is the other half: the option a target already names. A target carries a field ref, and the same
   column is spelled differently in different queries — by id here, by name there, under a join alias in a third — so
   equality is not enough to say whether two cards filter on the same column. It matches the ref against the card's
   columns instead, which is what makes \"filter every card on this dashboard by the column I just picked\" answerable
   at all."
  (:require
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; What a parameter accepts
;;; ──────────────────────────────────────────────────────────────────
;;
;; A parameter's type is a family and, sometimes, an operator — `string/=`, `date/all-options`, `number/between`. The
;; family decides which columns the parameter may filter. The operator matters in one place: a native query's
;; *variable* substitutes a single value into the SQL where it stands, so only a parameter that sets a single value can
;; drive one.

(defn- parameter-type
  [parameter]
  (keyword (:type parameter)))

(defn- parameter-family
  [parameter]
  (let [parameter-type (parameter-type parameter)]
    (keyword (or (namespace parameter-type) (name parameter-type)))))

(defn- parameter-subtype
  [parameter]
  (let [parameter-type (parameter-type parameter)]
    (when (namespace parameter-type)
      (name parameter-type))))

(defn- single-value-parameter?
  "Whether the parameter sets one value. `string/=` does; `number/between` and `string/contains` do not; a type that
   names no operator at all (`text`, `id`, `location/city`) does."
  [parameter]
  (let [parameter-type (parameter-type parameter)]
    (or (nil? (:operator (lib.schema.parameter/types parameter-type)))
        (= "=" (parameter-subtype parameter)))))

(defn- listed-values?
  "Whether the column's values come back as a list to pick from — what a `category` filter needs."
  [column]
  (contains? #{:list :auto-list} (:has-field-values column)))

(defn- filterable-column?
  "Whether a column is one of the kind a parameter of `family` filters. `temporal-bucketable?` is the one fact that
   needs the query around the column, so it arrives already computed."
  [family column temporal-bucketable?]
  (case family
    :date          (lib.types.isa/temporal? column)
    :id            (lib.types.isa/id? column)
    :category      (listed-values? column)
    :location      (and (lib.types.isa/string-or-string-like? column) (lib.types.isa/address? column))
    :number        (and (lib.types.isa/numeric? column) (not (lib.types.isa/id? column)))
    :boolean       (lib.types.isa/boolean? column)
    :string        (and (or (lib.types.isa/string-or-string-like? column)
                            (and (lib.types.isa/boolean? column) (listed-values? column)))
                        (not (lib.types.isa/address? column)))
    :temporal-unit temporal-bucketable?
    false))

(defn- filterable-by?
  [parameter query stage-number column]
  (filterable-column? (parameter-family parameter)
                      column
                      (boolean (seq (lib/available-temporal-buckets query stage-number column)))))

(defn- field-filterable-by?
  "Whether `parameter` may filter a Field — the check for a native query's field-filter tag, which names a Field rather
   than a column of a query, and so has no bucketing of its own to offer."
  [parameter field]
  (filterable-column? (parameter-family parameter) field false))

(defn- variable-drivable-by?
  "Whether `parameter` may drive a native query's raw-value tag: it has to set a single value, and the tag has to hold
   the kind of value it sets."
  [parameter {tag-type :type}]
  (and (single-value-parameter? parameter)
       (case (parameter-family parameter)
         :date                     (and (= "single" (parameter-subtype parameter)) (= :date tag-type))
         (:location :id :category) (contains? #{:number :text} tag-type)
         :number                   (= :number tag-type)
         :string                   (= :text tag-type)
         :boolean                  (= :boolean tag-type)
         :temporal-unit            (= :temporal-unit tag-type)
         false)))

;;; ──────────────────────────────────────────────────────────────────
;;; The card's columns
;;; ──────────────────────────────────────────────────────────────────

(defn- card-query
  "The query whose columns `card` is filtered by. A model or a metric is filtered as a question built on it rather than
   as the query stored inside it — filtering the definition would reach the columns the model curated away. A query
   that groups gets a stage appended, so a filter can narrow the groups as well as the rows they were counted from; a
   pivot table is the exception, because it cannot carry that stage."
  [{:keys [database_id dataset_query display] :as card}]
  (when (and (seq dataset_query) (pos-int? database_id))
    (let [metadata-provider (lib-be/application-database-metadata-provider database_id)
          query             (lib/query metadata-provider
                                       (if (= :question (keyword (:type card)))
                                         dataset_query
                                         (lib.metadata/card metadata-provider (:id card))))]
      (cond-> query
        (not= :pivot (keyword display)) lib/ensure-filter-stage))))

(defn- column-option
  "One column, as an option — unless it cannot be named by a ref a mapping can carry. A column produced by an
   aggregation in the very stage being filtered is such a column: it is referenced by position, and a position means
   nothing on the card the wiring is copied to."
  [query stage-number column]
  (let [column-ref (lib/ref column)]
    (when (contains? #{:field :expression} (first column-ref))
      {:name         (lib/display-name query stage-number column)
       ;; a parameter target holds a *legacy* ref, and that is the schema, not a choice this namespace gets to make
       :target       [:dimension #_{:clj-kondo/ignore [:discouraged-var]} (lib/->legacy-MBQL column-ref)
                      {:stage-number stage-number}]
       :column       column
       :stage-number stage-number})))

(defn- column-options
  [query parameter]
  (keep (fn [[stage-number column]]
          (when (filterable-by? parameter query stage-number column)
            (column-option query stage-number column)))
        (for [stage-number (range (lib/stage-count query))
              column       (lib/filterable-columns query stage-number)]
          [stage-number column])))

(defn- temporal-unit-options
  "A temporal-unit parameter does not filter rows — it re-buckets a grouping — so the only things it wires to are the
   query's own date groupings."
  [query parameter]
  (let [stage-number (dec (lib/stage-count query))]
    (keep (fn [breakout]
            (when-let [column (lib/breakout-column query stage-number breakout)]
              (when (filterable-by? parameter query stage-number column)
                (column-option query stage-number column))))
          (lib/breakouts query stage-number))))

(defn- template-tag-options
  "A native query is wired through the tags its SQL declares rather than through its columns: a field filter
   (`{{created_at}}` typed as a dimension) becomes a `WHERE` clause Metabase writes, and a raw-value tag is substituted
   where it stands."
  [query card parameter]
  (let [stage-number (dec (lib/stage-count query))]
    (keep (fn [[tag-name tag]]
            (let [tag-type (keyword (:type tag))
                  field    (when (= :dimension tag-type)
                             (when-let [field-id (some-> (:dimension tag) lib/field-ref-id)]
                               (lib.metadata/field query field-id)))]
              (when (case tag-type
                      :dimension                                (and field (field-filterable-by? parameter field))
                      (:text :number :date :boolean
                             :temporal-unit)                    (variable-drivable-by? parameter tag)
                      false)
                {:name   (or (:display-name tag) tag-name)
                 :target (case tag-type
                           :dimension     [:dimension [:template-tag tag-name] {:stage-number stage-number}]
                           ;; a temporal-unit tag re-buckets the query rather than substituting a value into it, and so
                           ;; rides in a `:dimension` like the grouping it changes
                           :temporal-unit [:dimension [:template-tag tag-name] {:stage-number 0}]
                           [:variable [:template-tag tag-name]])})))
          (lib/all-template-tags-map (lib-be/normalize-query (:dataset_query card))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The options, and the one a target names
;;; ──────────────────────────────────────────────────────────────────

(mu/defn mapping-options :- [:sequential [:map [:name :string] [:target :any]]]
  "Every way `parameter` can be wired to `card`, each as `{:name, :target}` — the name a person would pick it by, and
   the target that persists the choice. Empty when the card offers the parameter nothing: a date filter over a card
   with no date column has nothing to narrow."
  [card parameter]
  (if-let [query (card-query card)]
    (vec
     (cond
       (lib/native-only-query? query)                  (template-tag-options query card parameter)
       (= :temporal-unit (parameter-family parameter)) (temporal-unit-options query parameter)
       :else                                           (column-options query parameter)))
    []))

(mu/defn resolve-option :- [:maybe [:map [:name :string] [:target :any]]]
  "The option on `card` that `target` names, or nil when the card offers none.

   A target that is already one of the card's options matches outright. A target from *another* card matches when it
   names a column this card also has — the same Field spelled by id here and by name there — so the ref is matched
   against the card's columns rather than compared to their refs. That match is what auto-wiring is."
  [card parameter target]
  (let [target  (lib/normalize ::lib.schema.parameter/target target)
        options (mapping-options card parameter)]
    (or (m/find-first #(= target (:target %)) options)
        (when-let [field-ref (lib/parameter-target-field-ref target)]
          (let [stage-number (lib/parameter-target-stage-number target)
                candidates   (filterv #(= stage-number (:stage-number %)) options)]
            (when-let [column (lib/find-matching-column field-ref (mapv :column candidates))]
              (m/find-first #(= column (:column %)) candidates)))))))
