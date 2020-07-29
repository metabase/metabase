(ns metabase.query-processor.middleware.add-dimension-projections
  "Middleware for adding remapping and other dimension related projections. This remaps Fields that have a corresponding
  Dimension object (which defines a remapping) in two different ways, depending on the `:type` attribute of the
  Dimension:

  `external` type Dimensions mean the Field's values will be replaced with corresponding values from a column on a
  different table, joined via a foreign key. A common use-case would be to replace FK IDs with the name of whatever it
  references, for example replacing a values of `venue.category_id` with values of `category.name`. Actual replacement
  of values happens on the frontend, so this middleware simply adds the column to be used for replacement (e.g.
  `category.name`) to the `:fields` clause in pre-processing, so the Field will be fetched. Recall that Fields
  referenced via with `:fk->` clauses imply that JOINs will take place, which are automatically handled later in the
  Query Processor pipeline. Additionally, this middleware will swap out and `:order-by` clauses referencing the
  original Field with ones referencing the remapped Field (for example, so we would sort by `category.name` instead of
  `category_id`).

  `internal` type Dimensions mean the Field's values are replaced by a user-defined map of values, stored in the
  `human_readable_values` column of a corresponding `FieldValues` object. A common use-case for this scenario would be
  to replace integer enum values with something more descriptive, for example replacing values of an enum `can_type`
  -- `0` becomes `Toucan`, `1` becomes `Pelican`, and so forth. This is handled exclusively in post-processing by
  adding extra columns and values to the results.

  In both cases, to accomplish values replacement on the frontend, the post-processing part of this middleware adds
  appropriate `:remapped_from` and `:remapped_to` attributes in the result `:cols` in post-processing.
  `:remapped_from` and `:remapped_to` are the names of the columns, e.g. `category_id` is `:remapped_to` `name`, and
  `name` is `:remapped_from` `:category_id`."
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def ^:private ExternalRemappingDimension
  "Schema for the info we fetch about `external` type Dimensions that will be used for remappings in this Query. Fetched
  by the pre-processing portion of the middleware, and passed along to the post-processing portion."
  {:name                    su/NonBlankString       ; display name for the remapping
   :field_id                su/IntGreaterThanZero   ; ID of the Field being remapped
   :human_readable_field_id su/IntGreaterThanZero}) ; ID of the FK Field to remap values to


;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

(s/defn ^:private fields->field-id->remapping-dimension :- (s/maybe {su/IntGreaterThanZero ExternalRemappingDimension})
  "Given a sequence of field clauses (from the `:fields` clause), return a map of `:field-id` clause (other clauses
  are ineligable) to a remapping dimension information for any Fields that have an `external` type dimension remapping."
  [fields :- [mbql.s/Field]]
  (when-let [field-ids (seq (map second (filter (partial mbql.u/is-clause? :field-id) fields)))]
    (u/key-by :field_id (db/select [Dimension :field_id :name :human_readable_field_id]
                          :field_id [:in (set field-ids)]
                          :type     "external"))))

(s/defn ^:private create-remap-col-tuples :- [[(s/one mbql.s/field-id            "Field")
                                               (s/one mbql.s/fk->                "remapped FK Field")
                                               (s/one ExternalRemappingDimension "remapping Dimension info")]]
  "Return tuples of `:field-id` clauses, the new remapped column `:fk->` clauses that the Field should be remapped to,
  and the Dimension that suggested the remapping, which is used later in this middleware for post-processing. Order is
  important here, because the results are added to the `:fields` column in order. (TODO - why is it important, if they
  get hidden when displayed anyway?)"
  [fields :- [mbql.s/Field]]
  (when-let [field-id->remapping-dimension (fields->field-id->remapping-dimension fields)]
    (vec
     (mbql.u/match fields
       ;; don't match Field IDs nested in other clauses
       [(_ :guard keyword?) [:field-id _] & _] nil

       [:field-id (id :guard field-id->remapping-dimension)]
       (let [dimension (field-id->remapping-dimension id)]
         [&match
          [:fk-> &match [:field-id (:human_readable_field_id dimension)]]
          dimension])))))

(s/defn ^:private update-remapped-order-by :- [mbql.s/OrderBy]
  "Order by clauses that include an external remapped column should be replace that original column in the order by with
  the newly remapped column. This should order by the text of the remapped column vs. the id of the source column
  before the remapping"
  [field->remapped-col :- {mbql.s/field-id, mbql.s/fk->}, order-by-clauses :- [mbql.s/OrderBy]]
  (vec
   (for [[direction field, :as order-by-clause] order-by-clauses]
     (if-let [remapped-col (get field->remapped-col field)]
       [direction remapped-col]
       order-by-clause))))

(s/defn ^:private add-fk-remaps :- [(s/one (s/maybe [ExternalRemappingDimension]) "external remapping dimensions")
                                    (s/one mbql.s/Query "query")]
  "Add any Fields needed for `:external` remappings to the `:fields` clause of the query, and update `:order-by`
  clause as needed. Returns a pair like `[external-remapping-dimensions updated-query]`."
  [{{:keys [fields order-by]} :query, :as query} :- mbql.s/Query]
  ;; TODO - I think we need to handle Fields in `:breakout` here as well...
  ;; fetch remapping column pairs if any exist...
  (if-let [remap-col-tuples (seq (create-remap-col-tuples fields))]
    ;; if they do, update `:fields` and `:order-by` clauses accordingly and add to the query
    (let [new-fields   (vec (concat fields (map second remap-col-tuples)))
          ;; make a map of field-id-clause -> fk-clause from the tuples
          new-order-by (update-remapped-order-by (into {} (for [[field-clause fk-clause] remap-col-tuples]
                                                            [field-clause fk-clause]))
                                                 order-by)]
      ;; return the Dimensions we are using and the query
      [(map last remap-col-tuples)
       (cond-> (assoc-in query [:query :fields] new-fields)
         (seq new-order-by) (assoc-in [:query :order-by] new-order-by))])
    ;; otherwise return query as-is
    [nil query]))


;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(s/defn ^:private add-remapping-info :- [su/Map]
  "Add `:display_name`, `:remapped_to`, and `:remapped_from` keys to columns for the results, needed by the frontend.
  To get this critical information, this uses the `remapping-dimensions` info saved by the pre-processing portion of
  this middleware for external remappings, and the internal-only remapped columns handled by post-processing
  middleware below for internal columns."
  [columns                :- [su/Map]
   remapping-dimensions   :- (s/maybe [ExternalRemappingDimension])
   internal-remap-columns :- (s/maybe [su/Map])]
  (let [column-id->column              (u/key-by :id columns)
        name->internal-remapped-to-col (u/key-by :remapped_from internal-remap-columns)
        id->remapped-to-dimension      (u/key-by :field_id                remapping-dimensions)
        id->remapped-from-dimension    (u/key-by :human_readable_field_id remapping-dimensions)]
    (for [{:keys [id], column-name :name, :as column} columns]
      (merge
       {:base_type :type/*}
       column
       ;; if one of the internal remapped columns says it's remapped from this column, add a matching `:remapped_to`
       ;; entry
       (when-let [{remapped-to-name :name} (get name->internal-remapped-to-col column-name)]
         {:remapped_to remapped-to-name})
       ;; if the pre-processing remapping Dimension info contains an entry where this Field's ID is `:field_id`, add
       ;; an entry noting the name of the Field it gets remapped to
       (when-let [{remapped-to-id :human_readable_field_id} (get id->remapped-to-dimension id)]
         {:remapped_to (:name (get column-id->column remapped-to-id))})
       ;; if the pre-processing remapping Dimension info contains an entry where this Field's ID is
       ;; `:human_readable_field_id`, add an entry noting the name of the Field it gets remapped from, and use the
       ;; `:display_name` of the Dimension
       (when-let [{dimension-name :name, remapped-from-id :field_id} (get id->remapped-from-dimension id)]
         {:display_name  dimension-name
          :remapped_from (:name (get column-id->column remapped-from-id))})))))

(defn- create-remapped-col [col-name remapped-from base-type]
  {:description   nil
   :id            nil
   :table_id      nil
   :name          col-name
   :display_name  col-name
   :target        nil
   :remapped_from remapped-from
   :remapped_to   nil
   :base_type     base-type
   :special_type  nil})

(defn- transform-values-for-col
  "Converts `values` to a type compatible with the base_type found for `col`. These values should be directly comparable
  with the values returned from the database for the given `col`."
  [{:keys [base_type] :as col} values]
  (let [transform (condp #(isa? %2 %1) base_type
                    :type/Decimal    bigdec
                    :type/Float      double
                    :type/BigInteger bigint
                    :type/Integer    int
                    :type/Text       str
                    identity)]
    (map #(some-> % transform) values)))

(def ^:private InternalDimensionInfo
  {;; index of original column
   :col-index       s/Int
   ;; names
   :from            su/NonBlankString
   :to              su/NonBlankString
   ;; map of original value -> human readable value
   :value->readable su/Map
   ;; Info about the new column we will tack on to end of `:cols`
   :new-column      su/Map})

(defn- infer-human-readable-values-type
  [values]
  (let [types (keys (group-by (fn [v]
                                (cond
                                  (string? v) :type/Text
                                  (number? v) :type/Number
                                  :else       :type/*))
                              values))]
    (if (= (count types) 1)
      (first types)
      :type/*)))

(s/defn ^:private col->dim-map :- (s/maybe InternalDimensionInfo)
  "Given a `:col` map from the results, return a map of information about the `internal` dimension used for remapping
  it."
  [idx {{remap-to :name, remap-type :type, field-id :field_id}         :dimensions
        {values :values, human-readable-values :human_readable_values} :values
        :as                                                            col}]
  (when (and field-id
             (= remap-type :internal))
    (let [remap-from (:name col)]
      {:col-index       idx
       :from            remap-from
       :to              remap-to
       :value->readable (zipmap (transform-values-for-col col values)
                                human-readable-values)
       :new-column      (create-remapped-col remap-to remap-from
                                             (infer-human-readable-values-type human-readable-values))})))

(s/defn ^:private make-row-map-fn :- (s/maybe (s/pred fn? "function"))
  "Return a function that will add internally-remapped values to each row in the results. (If there is no remapping to
  be done, this function returns `nil`.)"
  [dims :- [InternalDimensionInfo]]
  (when (seq dims)
    (let [f (apply juxt (for [{:keys [col-index value->readable]} dims]
                          (fn [row]
                            (value->readable (nth row col-index)))))]
      (fn [row]
        (into (vec row) (f row))))))

(defn- internal-columns-info
  "Info about the internal-only columns we add to the query."
  [cols]
  ;; hydrate Dimensions and FieldValues for all of the columns in the results, then make a map of dimension info for
  ;; each one that is `internal` type
  (let [internal-only-dims (->> (hydrate cols :values :dimensions)
                                (keep-indexed col->dim-map)
                                (filter identity))]
    {:internal-only-dims internal-only-dims
     ;; Get the entires we're going to add to `:cols` for each of the remapped values we add
     :internal-only-cols (map :new-column internal-only-dims)}))

(defn- add-remapped-cols
  "Add remapping info `:remapped_from` and `:remapped_to` to each existing column in the results metadata, and add
  entries for each newly added column to the end of `:cols`."
  [metadata remapping-dimensions {:keys [internal-only-cols]}]
  (update metadata :cols (fn [cols]
                           (-> cols
                               (add-remapping-info remapping-dimensions internal-only-cols)
                               (concat internal-only-cols)))))

(defn- remap-results-xform
  "Munges results for remapping after the query has been executed. For internal remappings, a new column needs to be
  added and each row flowing through needs to include the remapped data for the new column. For external remappings,
  the column information needs to be updated with what it's being remapped from and the user specified name for the
  remapped column."
  [{:keys [cols], :as metadata} {:keys [internal-only-dims]} rf]
  (if-let [remap-fn (make-row-map-fn internal-only-dims)]
    (fn
      ([]
       (rf))

      ([result]
       (rf result))

      ([result row]
       (rf result (remap-fn row))))
    rf))

(defn- remap-results-rff [remapping-dimensions rff]
  (fn [metadata]
    (let [internal-cols-info (internal-columns-info (:cols metadata))
          metadata           (add-remapped-cols metadata remapping-dimensions internal-cols-info)]
      (remap-results-xform metadata internal-cols-info (rff metadata)))))

(defn add-remapping
  "Query processor middleware. `qp` is the query processor, returns a function that works on a `query` map. Delgates to
  `add-fk-remaps` for making remapping changes to the query (before executing the query). Then delegates to
  `remap-results` to munge the results after query execution."
  [qp]
  (fn [{query-type :type, :as query} rff context]
    (if (= query-type :native)
      (qp query rff context)
      (let [[remapping-dimensions query'] (add-fk-remaps query)]
        (qp query' (remap-results-rff remapping-dimensions rff) context)))))
