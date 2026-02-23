(ns metabase.lib.field
  (:refer-clojure :exclude [every? select-keys mapv empty? not-empty get-in #?(:clj for)])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.computed :as lib.computed]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [every? select-keys mapv empty? not-empty get-in #?(:clj for)]]
   [metabase.util.time :as u.time]))

(defn- column-metadata-effective-type
  "Effective type of a column when taking the `::temporal-unit` into account. If we have a temporal extraction like
  `:month-of-year`, then this actually returns an integer rather than the 'original` effective type of `:type/Date` or
  whatever."
  [{::keys [temporal-unit], :as column-metadata}]
  (if (and temporal-unit
           (contains? lib.schema.temporal-bucketing/datetime-extraction-units temporal-unit))
    :type/Integer
    ((some-fn :effective-type :base-type) column-metadata)))

(defmethod lib.metadata.calculation/type-of-method :metadata/column
  [_query _stage-number column-metadata]
  (column-metadata-effective-type column-metadata))

(defmethod lib.metadata.calculation/type-of-method :field
  [query stage-number [_tag {:keys [temporal-unit], :as _opts} _id-or-name :as field-ref]]
  (let [metadata (cond-> (lib.field.resolution/resolve-field-ref query stage-number field-ref)
                   temporal-unit (assoc ::temporal-unit temporal-unit))]
    (lib.metadata.calculation/type-of query stage-number metadata)))

(defmethod lib.metadata.calculation/metadata-method :metadata/column
  [_query _stage-number {field-name :name, :as field-metadata}]
  (assoc field-metadata :name field-name))

(mu/defmethod lib.metadata.calculation/metadata-method :field :- ::lib.metadata.calculation/visible-column
  [query stage-number field-ref]
  (lib.field.resolution/resolve-field-ref query stage-number field-ref))

(defn- field-nesting-path
  [metadata-providerable {:keys [display-name parent-id] :as _field-metadata}]
  (loop [field-id parent-id, path (list display-name)]
    (if field-id
      (let [{:keys [display-name parent-id]} (lib.metadata/field metadata-providerable field-id)]
        (recur parent-id (conj path display-name)))
      path)))

(defn- nest-display-name
  [metadata-providerable field-metadata]
  (let [path (field-nesting-path metadata-providerable field-metadata)]
    (when (every? some? path)
      (str/join ": " path))))

(defn- clauses-in-stage-by-uuid
  [query stage-number]
  (lib.computed/with-cache-ephemeral* query [::clauses-in-stage-by-uuid stage-number]
    (fn []
      (let [sink (volatile! (transient {}))]
        (lib.walk/walk-clauses-in-stage
         (lib.util/query-stage query stage-number)
         (fn [clause]
           (when-let [lib-uuid (lib.options/uuid clause)]
             (vswap! sink assoc! lib-uuid clause))
           nil))
        (persistent! @sink)))))

(defn- find-stage-index-and-clause-by-uuid
  "Find the clause in `query` with the given `lib-uuid`. Return a [stage-index clause] pair, if found."
  [query stage-number lib-uuid]
  (let [max-stage (lib.util/canonical-stage-index query stage-number)]
    (loop [stage-number 0]
      (if (> stage-number max-stage)
        nil
        (if-let [clause (get (clauses-in-stage-by-uuid query stage-number) lib-uuid)]
          [stage-number clause]
          (recur (inc stage-number)))))))

(defn- field-display-name-initial-display-name
  [query
   stage-number
   {field-display-name    :display-name
    field-name            :name
    join-alias            :metabase.lib.join/join-alias
    fk-field-id           :fk-field-id
    original-fk-field-id  :lib/original-fk-field-id
    parent-id             :parent-id
    ;; TODO (Cam 6/19/25) -- not sure why we need both "simple display name" and "original display name". QUE-1408
    simple-display-name   ::simple-display-name
    original-display-name :lib/original-display-name
    ref-display-name      :lib/ref-display-name
    source                :lib/source
    source-uuid           :lib/source-uuid
    :as                   col}
   style]
  (let [humanized-name     (u.humanization/name->human-readable-name :simple field-name)
        field-display-name (or ref-display-name
                               original-display-name
                               field-display-name)
        fk-field-id        (or fk-field-id original-fk-field-id)]
    (or simple-display-name
        (when (and parent-id
                   ;; check that we haven't nested yet
                   (or (nil? field-display-name)
                       (= field-display-name humanized-name)))
          (nest-display-name query col))
        (when-let [[source-index source-clause]
                   (and source-uuid
                        field-display-name
                        (= style :long)
                        (= source :source/previous-stage)
                        (not (or fk-field-id join-alias))
                        (not (str/includes? field-display-name " → "))
                        (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                          (find-stage-index-and-clause-by-uuid query previous-stage-number source-uuid)))]
          ;; The :display-name from the field metadata is probably not a :long display name, so
          ;; if the caller requested a :long name and we can lookup the original clause by the
          ;; source-uuid, use that to get the :long name. This allows display-info to get the
          ;; long display-name with join info included for aggregations over a joined field
          ;; from the previous stage, like "Max of Products -> ID" rather than "Max of ID".
          (lib.metadata.calculation/display-name query source-index source-clause style))
        field-display-name
        (when (string? field-name)
          humanized-name)
        (str field-name))))

(defn- field-display-name-add-join-alias
  [query
   stage-number
   {join-alias           :metabase.lib.join/join-alias
    original-join-alias  :lib/original-join-alias
    fk-field-id          :fk-field-id
    original-fk-field-id :lib/original-fk-field-id
    table-id             :table-id
    :as                  _col}
   style
   display-name]
  (let [join-alias        (or join-alias
                              original-join-alias)
        fk-field-id       (or fk-field-id original-fk-field-id)
        join-display-name (when (and (= style :long)
                                     ;; don't prepend a join display name if `:display-name` already contains one! Legacy
                                     ;; result metadata might include it for joined Fields, don't want to add it twice.
                                     ;; Otherwise we'll end up with display names like
                                     ;;
                                     ;;    Products → Products → Category
                                     (not (str/includes? display-name " → ")))
                            (or (when fk-field-id
                                  ;; Implicitly joined column pickers don't use the target table's name, they use the
                                  ;; FK field's name with "ID" dropped instead.
                                  ;;
                                  ;; This is very intentional: one table might have several FKs to one foreign table,
                                  ;; each with different meaning (eg. ORDERS.customer_id vs. ORDERS.supplier_id both
                                  ;; linking to a PEOPLE table). See #30109 for more details.
                                  (if-let [field (lib.metadata/field query fk-field-id)]
                                    (-> (lib.metadata.calculation/display-info query stage-number field)
                                        :display-name
                                        lib.util/strip-id)
                                    (let [table (lib.metadata/table-or-card query table-id)]
                                      (lib.metadata.calculation/display-name query stage-number table style))))
                                join-alias))]
    (if join-display-name
      (str join-display-name " → " display-name)
      display-name)))

(defn- field-display-name-add-binning
  [{binning          ::binning
    original-binning :lib/original-binning
    semantic-type    :semantic-type
    :as              _col}
   display-name]
  (let [binning    (or binning original-binning)
        bin-format #(lib.binning/ensure-ends-with-binning % binning semantic-type)
        add-bin?   (and binning
                        (not= display-name (bin-format display-name)))]
    ;; temporal unit and binning formatting are only applied if they haven't been applied yet
    (as-> display-name display-name
      (cond-> display-name add-bin? bin-format))))

(defn- field-display-name-add-bucketing
  [{inherited-temporal-unit :inherited-temporal-unit
    temporal-unit           ::temporal-unit
    :as                     _col}
   display-name]
  (let [temporal-unit   (or temporal-unit inherited-temporal-unit)
        temporal-format #(lib.temporal-bucket/ensure-ends-with-temporal-unit % temporal-unit)
        add-bucket?     (and temporal-unit
                             (not= display-name (temporal-format display-name)))]
    ;; temporal unit and binning formatting are only applied if they haven't been applied yet
    (as-> display-name display-name
      (cond-> display-name add-bucket? temporal-format))))

;;; this lives here as opposed to [[metabase.lib.metadata]] because that namespace is more of an interface namespace
;;; and moving this there would cause circular references.
(defmethod lib.metadata.calculation/display-name-method :metadata/column
  [query stage-number col style]
  ;; ALWAYS generate long display names regardless of style when the column came from the previous stage.
  ;;
  ;; > "When we cross the stage, everything is “long”" -- Alex P
  ;;
  ;; See https://metaboat.slack.com/archives/C0645JP1W81/p1750805177651009
  (let [style (if (or
                   (lib.field.util/inherited-column? col)
                   ;; TODO (Cam 6/26/25) -- not really sure whether a column that comes from a join in the current
                   ;; stage AGAINST ANOTHER CARD is 'inherited' or not... on the one hand it does come from another
                   ;; Card but on the other hand it was introduced in this stage. Either way, we do always want to use
                   ;; long display names in this case.
                   (:lib/card-id col))
                :long
                style)]
    (->> (field-display-name-initial-display-name query stage-number col style)
         (field-display-name-add-join-alias query stage-number col style)
         (field-display-name-add-binning col)
         (field-display-name-add-bucketing col))))

(defmethod lib.metadata.calculation/display-name-method :field
  [query stage-number field-ref style]
  (let [field-metadata (lib.field.resolution/resolve-field-ref query stage-number field-ref)]
    (lib.metadata.calculation/display-name query stage-number field-metadata style)))

;;; TODO (Cam 6/12/25) -- not sure what the correct name to be using here is but it's probably not `:name`. Either
;;; `:lib/source-column-alias` or `:lib/original-name` is probably the right one to use here?
(defmethod lib.metadata.calculation/column-name-method :metadata/column
  [_query _stage-number {field-name :name}]
  field-name)

(defmethod lib.metadata.calculation/column-name-method :field
  [query stage-number [_tag _id-or-name, :as field-clause]]
  (if-let [field-metadata (lib.field.resolution/resolve-field-ref query stage-number field-clause)]
    (lib.metadata.calculation/column-name query stage-number field-metadata)
    ;; mostly for the benefit of JS, which does not enforce the Malli schemas.
    "unknown_field"))

(defmethod lib.metadata.calculation/display-info-method :metadata/column
  [query stage-number col]
  (merge
   ((get-method lib.metadata.calculation/display-info-method :default) query stage-number col)
   ;; These have to be calculated even if the metadata has display-name to support nested fields
   ;; because the query processor doesn't produce nested display-names.
   {:display-name (lib.metadata.calculation/display-name query stage-number col)
    :long-display-name (lib.metadata.calculation/display-name query stage-number col :long)}
   ;; Include description and fingerprint if they're present on the column. Only proper fields or columns from a model
   ;; have these, not aggregations or expressions.
   (u/select-non-nil-keys col [:description :fingerprint])
   ;; if this column comes from a source Card (Saved Question/Model/etc.) use the name of the Card as the 'table' name
   ;; rather than the ACTUAL table name.
   (when (= (:lib/source col) :source/card)
     (when-let [card-id (:lib/card-id col)]
       (when-let [card (lib.metadata/card query card-id)]
         {:table {:name (:name card), :display-name (:name card)}})))))

;;; ---------------------------------- Temporal Bucketing ----------------------------------------

;;; TODO -- it's a little silly to make this a multimethod I think since there are exactly two implementations of it,
;;; right? Or can expression and aggregation references potentially be temporally bucketed as well? Think about
;;; whether just making this a plain function like we did for [[metabase.lib.join/with-join-alias]] makes sense or not.

(defmethod lib.temporal-bucket/temporal-bucket-method :field
  [[_tag opts _id-or-name]]
  (:temporal-unit opts))

(defmethod lib.temporal-bucket/temporal-bucket-method :metadata/column
  [metadata]
  (::temporal-unit metadata))

(defmethod lib.temporal-bucket/with-temporal-bucket-method :field
  [field-ref unit]
  (lib.temporal-bucket/add-temporal-bucket-to-ref field-ref unit))

(defmethod lib.temporal-bucket/with-temporal-bucket-method :metadata/column
  [metadata unit]
  (let [original-effective-type ((some-fn ::original-effective-type :effective-type :base-type) metadata)]
    (if unit
      (-> metadata
          (assoc ::temporal-unit unit)
          (m/assoc-some ::original-effective-type original-effective-type))
      (cond-> (dissoc metadata ::temporal-unit ::original-effective-type)
        original-effective-type (assoc :effective-type original-effective-type)))))

(defmethod lib.temporal-bucket/available-temporal-buckets-method :field
  [query stage-number field-ref]
  (lib.temporal-bucket/available-temporal-buckets query stage-number (lib.field.resolution/resolve-field-ref query stage-number field-ref)))

(defn- fingerprint-based-default-unit [fingerprint]
  (u/ignore-exceptions
    (when-let [{:keys [earliest latest]} (-> fingerprint :type :type/DateTime)]
      (let [days (u.time/day-diff (u.time/coerce-to-timestamp earliest)
                                  (u.time/coerce-to-timestamp latest))]
        (when-not (NaN? days)
          (condp > days
            1 :minute
            31 :day
            365 :week
            :month))))))

(defmethod lib.temporal-bucket/available-temporal-buckets-method :metadata/column
  [_query _stage-number field-metadata]
  (lib.temporal-bucket/available-temporal-buckets-for-type
   ((some-fn ::original-effective-type :effective-type :base-type) field-metadata)
   ;; `:inherited-temporal-unit` being set means field was bucketed on former stage. For this case, make the default nil
   ;; for next bucketing attempt (of already bucketed) field eg. through BreakoutPopover on FE, by setting `:inherited`
   ;; default unit.
   (if (or (nil? (:inherited-temporal-unit field-metadata))
           (= :default (:inherited-temporal-unit field-metadata)))
     (or (some-> field-metadata :fingerprint fingerprint-based-default-unit)
         :month)
     :inherited)
   (::temporal-unit field-metadata)))

;;; ---------------------------------------- Binning ---------------------------------------------

(defmethod lib.binning/binning-method :field
  [field-clause]
  (some-> field-clause
          lib.options/options
          :binning
          (assoc :lib/type    ::lib.binning/binning
                 :metadata-fn (fn [query stage-number]
                                (lib.field.resolution/resolve-field-ref query stage-number field-clause)))))

(defmethod lib.binning/binning-method :metadata/column
  [metadata]
  (some-> metadata
          ::binning
          (assoc :lib/type    ::lib.binning/binning
                 :metadata-fn (constantly metadata))))

(defmethod lib.binning/with-binning-method :field
  [field-clause binning]
  (lib.options/update-options field-clause u/assoc-dissoc :binning binning))

(defmethod lib.binning/with-binning-method :metadata/column
  [metadata binning]
  (u/assoc-dissoc metadata ::binning binning))

(defmethod lib.binning/available-binning-strategies-method :field
  [query stage-number field-ref]
  (lib.binning/available-binning-strategies query stage-number (lib.field.resolution/resolve-field-ref query stage-number field-ref)))

(defmethod lib.binning/available-binning-strategies-method :metadata/column
  [query _stage-number {:keys [effective-type fingerprint semantic-type] :as field-metadata}]
  (if-not (= (:lib/source field-metadata) :source/expressions)
    (let [binning?    (lib.metadata/database-supports? query :binning)
          fingerprint (get-in fingerprint [:type :type/Number])
          existing    (lib.binning/binning field-metadata)
          strategies  (cond
                        ;; Abort if the database doesn't support binning, or this column does not have a defined range.
                        (not (and binning?
                                  (:min fingerprint)
                                  (:max fingerprint)))               nil
                        (isa? semantic-type :type/Coordinate)        (lib.binning/coordinate-binning-strategies)
                        (and (isa? effective-type :type/Number)
                             (not (isa? semantic-type :Relation/*))) (lib.binning/numeric-binning-strategies))]
      ;; TODO: Include the time and date binning strategies too
      (for [strategy strategies]
        (cond-> strategy
          (or (:lib/original-binning field-metadata) existing) (dissoc :default)
          (lib.binning/strategy= strategy existing) (assoc :selected true))))
    []))

(defmethod lib.ref/ref-method :field
  [field-clause]
  field-clause)

;;; see also [[metabase.lib.field.resolution/opts-propagated-renamed-keys]]
(def ^:private field-ref-propagated-keys
  "Keys that should get copied into `:field` ref options from column metadata.

    key-in-col-metadata => key-in-opts"
  (merge
   (u/index-by
    identity
    [:base-type
     :inherited-temporal-unit
     :lib/original-binning
     ::original-effective-type])
   {:metabase.lib.field/binning       :binning
    :metabase.lib.field/temporal-unit :temporal-unit
    :lib/ref-name                     :name
    :lib/ref-display-name             :display-name}))

(def ^:private field-ref-propagated-keys-for-non-inherited-columns
  "Keys that should get copied into `:field` ref options from column metadata ONLY when the column is not inherited.

    key-in-col-metadata => key-in-opts"
  (merge
   (u/index-by
    identity
    ;; include `:metabase.lib.query/transformation-added-base-type` if this is going to be a field ID ref, so we can
    ;; remove `:base-type` if it wasn't included in the original query if we convert this ref back to legacy (mostly
    ;; important for [[metabase.query-processor.middleware.annotate/super-broken-legacy-field-ref]] purposes). But if
    ;; this will have a Field name then don't include the key because we don't want the convert code to strip out base
    ;; types -- they're required for field name refs.
    [:metabase.lib.query/transformation-added-base-type])
   {:metabase.lib.join/join-alias :join-alias
    :fk-field-id                  :source-field
    :fk-join-alias                :source-field-join-alias
    :fk-field-name                :source-field-name}))

(defn- select-renamed-keys [m old->new]
  (-> m
      (select-keys (keys old->new))
      (set/rename-keys old->new)))

(mu/defn- column-metadata->field-ref :- :mbql.clause/field
  [metadata :- ::lib.schema.metadata/column]
  (let [inherited-column? (lib.field.util/inherited-column? metadata)
        options           (merge {:lib/uuid       (str (random-uuid))
                                  :effective-type (column-metadata-effective-type metadata)}
                                 (select-renamed-keys metadata field-ref-propagated-keys)
                                 (when-not inherited-column?
                                   (select-renamed-keys metadata field-ref-propagated-keys-for-non-inherited-columns)))
        id-or-name        (or (lib.field.util/inherited-column-name metadata)
                              ((some-fn :id :lib/source-column-alias :lib/deduplicated-name :lib/original-name :name) metadata))]
    [:field options id-or-name]))

(mu/defmethod lib.ref/ref-method :metadata/column :- ::lib.schema.ref/ref
  [{source :lib/source, :as metadata} :- ::lib.schema.metadata/column]
  (case source
    :source/aggregations (lib.aggregation/column-metadata->aggregation-ref metadata)
    :source/expressions  (lib.expression/column-metadata->expression-ref metadata)
    #_else
    (column-metadata->field-ref metadata)))

(defn- expression-columns
  "Return the [[::lib.schema.metadata/column]] for all the expressions in a stage of a query."
  [query stage-number]
  (filter #(= (:lib/source %) :source/expressions)
          (lib.metadata.calculation/visible-columns
           query
           stage-number
           {:include-joined?              false
            :include-expressions?         true
            :include-implicitly-joinable? false})))

(mu/defn with-fields :- ::lib.schema/query
  "Specify the `:fields` for a query. Pass `nil` or an empty sequence to remove `:fields`."
  ([xs]
   (fn [query stage-number]
     (with-fields query stage-number xs)))

  ([query xs]
   (with-fields query -1 xs))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    xs]
   (let [xs        (not-empty (mapv lib.ref/ref xs))
         ;; If any fields are specified, include all expressions not yet included.
         expr-cols (expression-columns query stage-number)
         ;; Set of expr-cols which are *already* included.
         included  (into #{}
                         (keep #(lib.equality/find-matching-column query stage-number % expr-cols))
                         (or xs []))
         ;; Those expr-refs which must still be included.
         to-add    (remove included expr-cols)
         xs        (when xs (into xs (map lib.ref/ref) to-add))]
     (lib.util/update-query-stage query stage-number u/assoc-dissoc :fields xs))))

(mu/defn fields :- [:maybe [:ref ::lib.schema/fields]]
  "Fetches the `:fields` for a query. Returns `nil` if there are no `:fields`. `:fields` should never be empty; this is
  enforced by the Malli schema."
  ([query]
   (fields query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (:fields (lib.util/query-stage query stage-number))))

(mu/defn fieldable-columns :- ::lib.metadata.calculation/visible-columns
  "Return a sequence of column metadatas for columns that you can specify in the `:fields` of a query. This is
  basically just the columns returned by the source Table/Saved Question/Model or previous query stage.

  Includes a `:selected?` key letting you know this column is already in `:fields` or not; if `:fields` is
  unspecified, all these columns are returned by default, so `:selected?` is true for all columns (this is a little
  strange but it matches the behavior of the QB UI)."
  ([query]
   (fieldable-columns query -1))

  ([query :- ::lib.schema/query
    stage-number :- :int]
   (let [visible-columns (lib.metadata.calculation/visible-columns query
                                                                   stage-number
                                                                   {:include-joined?              false
                                                                    :include-expressions?         false
                                                                    :include-implicitly-joinable? false})
         selected-fields (fields query stage-number)]
     (if (empty? selected-fields)
       (mapv (fn [col]
               (assoc col :selected? true))
             visible-columns)
       (lib.equality/mark-selected-columns query stage-number visible-columns selected-fields)))))

(defn- populate-fields-for-stage
  "Given a query and stage, sets the `:fields` list to be the fields which would be selected by default.
  This is exactly [[lib.metadata.calculation/returned-columns]] filtered by the `:lib/source`.
  Fields from explicit joins are listed on the join itself and should not be listed in `:fields`."
  [query stage-number]
  (let [defaults (lib.metadata.calculation/default-columns-for-stage query stage-number)]
    (lib.util/update-query-stage query stage-number assoc :fields (mapv lib.ref/ref defaults))))

(defn- query-with-fields
  "If the given stage already has a `:fields` clause, do nothing. If it doesn't, populate the `:fields` clause with the
  full set of `returned-columns`. (See [[populate-fields-for-stage]] for the details.)"
  [query stage-number]
  (cond-> query
    (not (:fields (lib.util/query-stage query stage-number))) (populate-fields-for-stage stage-number)))

(defn- include-field [query stage-number column]
  (let [populated  (query-with-fields query stage-number)
        field-refs (fields populated stage-number)
        matching-ref (lib.equality/find-matching-ref column field-refs)]
    (if matching-ref
      (do
        (log/debugf "Column %s already included by ref %s, doing nothing and returning the original query"
                    (pr-str (select-keys column [:id :metabase.lib.join/join-alias :lib/source-column-alias]))
                    (pr-str matching-ref))
        query)
      (let [column-ref (lib.ref/ref column)]
        (lib.util/update-query-stage populated stage-number update :fields conj column-ref)))))

(defn- add-field-to-join [query stage-number column]
  (let [column-ref   (lib.ref/ref column)
        [join field] (first (for [join  (lib.join/joins query stage-number)
                                  :let [joinables (lib.join/joinable-columns query stage-number join)
                                        field     (lib.equality/find-matching-column
                                                   query stage-number column-ref joinables)]
                                  :when field]
                              [join field]))
        join-fields  (lib.join/join-fields join)]

    ;; Nothing to do if it's already selected, or if this join already has :fields :all.
    ;; Otherwise, append it to the list of fields.
    (if (or (= join-fields :all)
            (and field
                 (not= join-fields :none)
                 (lib.equality/find-matching-ref field join-fields)))
      query
      (lib.remove-replace/replace-join query stage-number join
                                       (lib.join/with-join-fields join
                                         (if (= join-fields :none)
                                           [column]
                                           (conj join-fields column)))))))

(defn- native-query-fields-edit-error []
  (i18n/tru "Fields cannot be adjusted on native queries. Either edit the native query, or save this question and edit the fields in a GUI question based on this one."))

(defn- source-clauses-only-fields-edit-error []
  (i18n/tru (str "Only source columns (those from a table, model, or saved question) can be adjusted on a query. "
                 "Aggregations, breakouts and expressions are always returned, and must be removed from the query or "
                 "hidden in the UI.")))

(mu/defn add-field :- ::lib.schema/query
  "Adds a given field (`ColumnMetadata`, as returned from eg. [[visible-columns]]) to the fields returned by the query.
  Exactly what this means depends on the source of the field:
  - Source table/card, previous stage of the query, custom expression, aggregation or breakout:
      - Add it to the `:fields` list
      - If `:fields` is missing, it's implicitly `:all`, so do nothing.
  - Implicit join: add it to the `:fields` list; query processor will do the right thing with it.
  - Explicit join: add it to that join's `:fields` list."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.metadata.calculation/column-metadata-with-source]
  (let [stage  (lib.util/query-stage query stage-number)
        source (:lib/source column)]
    (when (and (empty? (:fields stage))
               (not (#{:source/implicitly-joinable :source/joins} source)))
      (log/warnf "[add-field] stage :fields is empty, which means everything will already be included; attempt to add %s will no-op"
                 (pr-str ((some-fn :display-name :name) column))))
    (-> (case source
          (:source/table-defaults
           :source/card
           :source/previous-stage
           :source/expressions
           :source/aggregations)      (cond-> query
                                        (contains? stage :fields) (include-field stage-number column))
          :source/joins               (add-field-to-join query stage-number column)
          :source/implicitly-joinable (include-field query stage-number column)
          :source/native              (throw (ex-info (native-query-fields-edit-error) {:query query :stage stage-number}))
          ;; Default case - do nothing if we don't know about the incoming value.
          ;; Generates a warning, as we should aim to capture all the :source/* values here.
          (do
            (log/warnf "Cannot add-field with unknown source %s" (pr-str source))
            query))
        ;; Then drop any redundant :fields clauses.
        lib.remove-replace/normalize-fields-clauses)))

(defn- remove-matching-ref [column refs]
  (let [match (or (lib.equality/find-matching-ref column refs)
                  (log/warnf "[remove-matching-ref] Failed to find match for column\n%s\nin refs:\n%s"
                             (u/pprint-to-str column)
                             (u/pprint-to-str refs)))]
    (remove #(= % match) refs)))

(defn- exclude-field
  "This is called only for fields that plausibly need removing. If the stage has no `:fields`, this will populate it.
  It shouldn't happen that we can't find the target field, but if that does happen, this will return the original query
  unchanged. (In particular, if `:fields` did not exist before it will still be omitted.)"
  [query stage-number column]
  (let [old-fields (-> (query-with-fields query stage-number)
                       (lib.util/query-stage stage-number)
                       :fields)
        new-fields (remove-matching-ref column old-fields)]
    (u/prog1 (cond-> query
               ;; If we couldn't find the field, return the original query unchanged.
               (< (count new-fields) (count old-fields)) (lib.util/update-query-stage stage-number assoc :fields new-fields))
      (when (= <> query)
        (log/errorf "[exclude-field] Failed to remove field %s, query is unchanged." (pr-str ((some-fn :display-name :name) column)))))))

(defn- remove-field-from-join [query stage-number column]
  (let [join        (lib.join/resolve-join query stage-number (::lib.join/join-alias column))
        join-fields (lib.join/join-fields join)]
    (if (or (nil? join-fields)
            (= join-fields :none))
      ;; Nothing to do if there's already no join fields.
      query
      (let [resolved-join-fields (if (= join-fields :all)
                                   (map lib.ref/ref (lib.join/join-returned-columns-relative-to-parent-stage query stage-number join))
                                   join-fields)
            removed              (remove-matching-ref column resolved-join-fields)]
        (cond-> query
          ;; If we actually removed a field, replace the join. Otherwise return the query unchanged.
          (< (count removed) (count resolved-join-fields))
          (lib.remove-replace/replace-join stage-number join (lib.join/with-join-fields join removed)))))))

(mu/defn remove-field :- ::lib.schema/query
  "Removes the field (a `ColumnMetadata`, as returned from eg. [[visible-columns]]) from those fields returned by the
  query. Exactly what this means depends on the source of the field:
  - Source table/card, previous stage, custom expression, aggregations or breakouts:
      - If `:fields` is missing, it's implicitly `:all` - populate it with all the columns except the removed one.
      - Remove the target column from the `:fields` list
  - Implicit join: remove it from the `:fields` list; do nothing if it's not there.
      - (An implicit join only exists in the `:fields` clause, so if it's not there then it's not anywhere.)
  - Explicit join: remove it from that join's `:fields` list (handle `:fields :all` like for source tables)."
  [query      :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.metadata.calculation/column-metadata-with-source]
  (let [source (if (:lib/breakout? column)
                 ::breakouts
                 (:lib/source column))]
    (-> (case source
          (:source/table-defaults
           :source/card
           :source/previous-stage
           :source/expressions
           :source/implicitly-joinable) (exclude-field query stage-number column)
          :source/joins                 (remove-field-from-join query stage-number column)
          :source/native                (throw (ex-info (native-query-fields-edit-error)
                                                        {:query query :stage stage-number}))

          (::breakouts
           :source/aggregations)        (throw (ex-info (source-clauses-only-fields-edit-error)
                                                        {:query  query
                                                         :stage  stage-number
                                                         :source source}))
          ;; Default case: do nothing and return the query unchanged.
          ;; Generate a warning - we should aim to capture every `:source/*` value above.
          (do
            (log/warnf "Cannot remove-field with unknown source %s" (pr-str source))
            query))
        ;; Then drop any redundant :fields clauses.
        lib.remove-replace/normalize-fields-clauses)))

;; TODO: Refactor this away? The special handling for aggregations is strange.
(mu/defn find-visible-column-for-ref :- [:maybe ::lib.schema.metadata/column]
  "Return the visible column in `query` at `stage-number` referenced by `field-ref`. If `stage-number` is omitted, the
  last stage is used. This is currently only meant for use with `:field` clauses."
  ([query field-ref]
   (find-visible-column-for-ref query -1 field-ref))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    field-ref    :- some?]
   (let [;; not 100% sure why, but [[lib.metadata.calculation/visible-columns]] doesn't seem to return aggregations,
         ;; so we have to use [[lib.metadata.calculation/returned-columns]] instead.
         columns ((if (= (lib.dispatch/dispatch-value field-ref) :aggregation)
                    lib.metadata.calculation/returned-columns
                    lib.metadata.calculation/visible-columns)
                  query stage-number)]
     (lib.equality/find-matching-column query stage-number field-ref columns))))

(defn json-field?
  "Return true if field is a JSON field, false if not."
  [field]
  (some? (:nfc-path field)))

;;; yes, this is intentionally different from the version in `:metabase.lib.schema.metadata/column.has-field-values`.
;;; The FE isn't supposed to need to worry about the distinction between `:auto-list` and `:list` for filter purposes.
;;; See [[infer-has-field-values]] for more info.
(mr/def ::field-values-search-info.has-field-values
  [:enum :list :search :none])

(mr/def ::field-values-search-info
  [:map
   [:field-id         [:maybe [:ref ::lib.schema.id/field]]]
   [:search-field-id  [:maybe [:ref ::lib.schema.id/field]]]
   [:search-field     [:maybe [:ref ::lib.schema.metadata/column]]]
   [:has-field-values [:ref ::field-values-search-info.has-field-values]]])

(mu/defn infer-has-field-values :- ::field-values-search-info.has-field-values
  "Determine the value of `:has-field-values` we should return for column metadata for frontend consumption to power
  filter search widgets, either when returned by the the REST API or in MLv2 with [[field-values-search-info]].

  Note that this value is not necessarily the same as the value of `has_field_values` in the application database.
  `has_field_values` may be unset, in which case we will try to infer it. `:auto-list` is not currently understood by
  the FE filter stuff, so we will instead return `:list`; the distinction is not important to it anyway."
  [{:keys [has-field-values], :as field} :- [:map
                                             ;; this doesn't use `::lib.schema.metadata/column` because it's stricter
                                             ;; than we need and the REST API calls this function with optimized Field
                                             ;; maps that don't include some keys like `:name`
                                             [:base-type        {:optional true} [:maybe ::lib.schema.common/base-type]]
                                             [:effective-type   {:optional true} [:maybe ::lib.schema.common/base-type]]
                                             [:has-field-values {:optional true} [:maybe ::lib.schema.metadata/column.has-field-values]]]]
  (cond
    ;; if `has_field_values` is set in the DB, use that value; but if it's `auto-list`, return the value as `list` to
    ;; avoid confusing FE code, which can remain blissfully unaware that `auto-list` is a thing
    (= has-field-values :auto-list)   :list
    has-field-values                  has-field-values
    ;; otherwise if it does not have value set in DB we will infer it
    (lib.types.isa/searchable? field) :search
    :else                             :none))

(mu/defn- search-field :- [:maybe ::lib.schema.metadata/column]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column                :- ::lib.schema.metadata/column]
  (let [col (or (when (lib.types.isa/primary-key? column)
                  (when-let [name-field (:name-field column)]
                    (lib.metadata/field metadata-providerable (u/the-id name-field))))
                (lib.metadata/remapped-field metadata-providerable column)
                column)]
    (when (lib.types.isa/searchable? col)
      col)))

(mu/defn field-values-search-info :- ::field-values-search-info
  "Info about whether the column in question has FieldValues associated with it for purposes of powering a search
  widget in the QB filter modals."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column                :- ::lib.schema.metadata/column]
  (when column
    (let [column-field-id (:id column)
          search-column   (search-field metadata-providerable column)
          search-field-id (:id search-column)]
      {:field-id (when (int? column-field-id) column-field-id)
       :search-field-id (when (int? search-field-id) search-field-id)
       :search-field (when (int? search-field-id) search-column)
       :has-field-values (if (int? column-field-id)
                           (infer-has-field-values column)
                           :none)})))
