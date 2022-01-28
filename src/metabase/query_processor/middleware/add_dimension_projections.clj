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
  Query Processor pipeline. Additionally, this middleware will swap out `:breakout` and `:order-by` clauses
  referencing the original Field with ones referencing the remapped Field (for example, so we would sort by
  `category.name` instead of `category_id`).

  `internal` type Dimensions mean the Field's values are replaced by a user-defined map of values, stored in the
  `human_readable_values` column of a corresponding `FieldValues` object. A common use-case for this scenario would be
  to replace integer enum values with something more descriptive, for example replacing values of an enum `can_type`
  -- `0` becomes `Toucan`, `1` becomes `Pelican`, and so forth. This is handled exclusively in post-processing by
  adding extra columns and values to the results.

  In both cases, to accomplish values replacement on the frontend, the post-processing part of this middleware adds
  appropriate `:remapped_from` and `:remapped_to` attributes in the result `:cols` in post-processing.
  `:remapped_from` and `:remapped_to` are the names of the columns, e.g. `category_id` is `:remapped_to` `name`, and
  `name` is `:remapped_from` `:category_id`."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(def ^:private ExternalRemappingDimensionInitialInfo
  "External remapping dimensions when they're first fetched from the app DB. We'll add extra info to this."
  {:id                      su/IntGreaterThanZero   ; unique ID for the remapping
   :name                    su/NonBlankString       ; display name for the remapping
   :field_id                su/IntGreaterThanZero   ; ID of the Field being remapped
   :human_readable_field_id su/IntGreaterThanZero}) ; ID of the FK Field to remap values to

(def ^:private ExternalRemappingDimension
  "Schema for the info we fetch about `external` type Dimensions that will be used for remappings in this Query. Fetched
  by the pre-processing portion of the middleware, and passed along to the post-processing portion."
  (assoc ExternalRemappingDimensionInitialInfo
         :field_name                su/NonBlankString   ; Name of the Field being remapped
         :human_readable_field_name su/NonBlankString)) ; Name of the FK field to remap values to


;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

(s/defn ^:private fields->field-id->remapping-dimension :- (s/maybe {su/IntGreaterThanZero ExternalRemappingDimensionInitialInfo})
  "Given a sequence of field clauses (from the `:fields` clause), return a map of `:field-id` clause (other clauses
  are ineligable) to a remapping dimension information for any Fields that have an `external` type dimension remapping."
  [fields :- [mbql.s/Field]]
  (when-let [field-ids (not-empty (set (mbql.u/match fields [:field (id :guard integer?) _] id)))]
    (letfn [(thunk []
              (u/key-by :field_id (db/select [Dimension :id :field_id :name :human_readable_field_id]
                                    :field_id [:in field-ids]
                                    :type     "external")))]
      (if (qp.store/initialized?)
        (qp.store/cached [::fetch-dimensions field-ids]
          (thunk))
        (thunk)))))

(s/defn ^:private create-remap-col-tuples :- [[(s/one mbql.s/field            "Field")
                                               (s/one mbql.s/field            "remapped FK Field")
                                               (s/one ExternalRemappingDimension "remapping Dimension info")]]
  "Return tuples of `:field-id` clauses, the new remapped column `:fk->` clauses that the Field should be remapped to
  and the Dimension that suggested the remapping, which is used later in this middleware for post-processing. Order is
  important here, because the results are added to the `:fields` column in order. (TODO - why is it important, if they
  get hidden when displayed anyway?)"
  [fields :- [mbql.s/Field]]
  (when-let [field-id->remapping-dimension (fields->field-id->remapping-dimension fields)]
    ;; Reconstruct how we uniquify names in [[metabase.query-processor.middleware.annotate]]
    ;;
    ;; Not sure this isn't broken. Probably better to have [[metabase.query-processor.util.add-alias-info]] do the name
    ;; deduplication instead.
    (let [unique-name (comp (mbql.u/unique-name-generator) :name Field)]
      (vec
       (mbql.u/match fields
         ;; don't match Fields that have been joined from another Table
         [:field (id :guard (every-pred integer? field-id->remapping-dimension)) (_ :guard (complement (some-fn :join-alias :source-field)))]
         (let [dimension (field-id->remapping-dimension id)]
           [&match
            [:field (:human_readable_field_id dimension) {:source-field id, ::source-dimension (u/the-id dimension)}]
            (assoc dimension
              :field_name                (-> dimension :field_id unique-name)
              :human_readable_field_name (-> dimension :human_readable_field_id unique-name))]))))))

(s/defn ^:private update-remapped-order-by :- [mbql.s/OrderBy]
  "Order by clauses that include an external remapped column should be replace that original column in the order by with
  the newly remapped column. This should order by the text of the remapped column vs. the id of the source column
  before the remapping"
  [field->remapped-col :- {mbql.s/field mbql.s/field}, order-by-clauses :- [mbql.s/OrderBy]]
  (->> (for [[direction field, :as order-by-clause] order-by-clauses]
         (if-let [remapped-col (get field->remapped-col field)]
           [direction remapped-col]
           order-by-clause))
       distinct
       vec))

(defn- update-remapped-breakout
  [field->remapped-col breakout-clause]
  (->> breakout-clause
       (mapcat (fn [field]
                 (if-let [remapped-col (get field->remapped-col field)]
                   [remapped-col field]
                   [field])))
       distinct
       vec))

(defn- add-target-dimension-info
  [field->remapped-col fields]
  (mapv
   (fn [field]
     (let [[_ _ {::keys [source-dimension]}] (get field->remapped-col field)]
       (cond-> field
         source-dimension (mbql.u/update-field-options assoc ::target-dimension source-dimension))))
   fields))

(s/defn ^:private add-fk-remaps :- [(s/one (s/maybe [ExternalRemappingDimension]) "external remapping dimensions")
                                    (s/one mbql.s/Query "query")]
  "Add any Fields needed for `:external` remappings to the `:fields` clause of the query, and update `:order-by`
  and `breakout` clauses as needed. Returns a pair like `[external-remapping-dimensions updated-query]`."
  [{{:keys [fields order-by breakout source-query]} :query, :as query} :- mbql.s/Query]
  (let [[source-query-remappings query]
        (if (and source-query (not (:native source-query))) ; Only do lifting if source is MBQL query
          (let [[source-query-remappings source-query] (add-fk-remaps (assoc query :query source-query))]
            [source-query-remappings (assoc-in query [:query :source-query] (:query source-query))])
          [nil query])]
    ;; fetch remapping column pairs if any exist...
    (if-let [remap-col-tuples (seq (create-remap-col-tuples (concat fields breakout)))]
      ;; if they do, update `:fields`, `:order-by` and `:breakout` clauses accordingly and add to the query
      (let [ ;; make a map of field-id-clause -> fk-clause from the tuples
            field->remapped-col (into {} (for [[field-clause fk-clause] remap-col-tuples]
                                           [field-clause fk-clause]))
            new-fields          (->> remap-col-tuples
                                     (map second)
                                     (concat (add-target-dimension-info field->remapped-col fields))
                                     distinct #_(m/distinct-by add/normalize-clause)
                                     vec)
            new-breakout        (update-remapped-breakout field->remapped-col breakout)
            new-order-by        (update-remapped-order-by field->remapped-col order-by)]
        ;; return the Dimensions we are using and the query
        [(concat source-query-remappings (map last remap-col-tuples))
         (cond-> query
           (seq fields)   (assoc-in [:query :fields] new-fields)
           (seq order-by) (assoc-in [:query :order-by] new-order-by)
           (seq breakout) (assoc-in [:query :breakout] new-breakout))])
      ;; otherwise return query as-is
      [source-query-remappings query])))


;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(def ^:private InternalDimensionInfo
  {;; index of original column
   :col-index       s/Int
   ;; names
   :from            su/NonBlankString
   ;; I'm not convinced this works if there's already a column with the same name in the results.
   :to              su/NonBlankString
   ;; map of original value -> human readable value
   :value->readable su/Map
   ;; Info about the new column we will tack on to end of `:cols`
   :new-column      su/Map})

(def ^:private InternalColumnsInfo
  {:internal-only-dims (s/maybe [InternalDimensionInfo])
   ;; this is just (map :new-column internal-only-dims)
   :internal-only-cols (s/maybe [su/Map])})


;;;; Metadata

(s/defn ^:private merge-metadata-for-internally-remapped-column :- [su/Map]
  "If one of the internal remapped columns says it's remapped from this column, merge in the `:remapped_to` info."
  [columns :- [su/Map] {:keys [col-index to]} :- InternalDimensionInfo]
  (update (vec columns) col-index assoc :remapped_to to))

(s/defn ^:private merge-metadata-for-internal-remaps :- [su/Map]
  [columns :- [su/Map] {:keys [internal-only-dims]} :- (s/maybe InternalColumnsInfo)]
  (reduce
   (fn [columns internal-dimension-info]
     (merge-metadata-for-internally-remapped-column columns internal-dimension-info))
   columns
   internal-only-dims))

(defn- actual-column-name [columns column-id]
  (some
   (fn [{a-column-id :id, a-column-name :name}]
     (when (= a-column-id column-id)
       a-column-name))
   columns))

;; Example external dimension:
;;
;;    {:name                      "Sender ID"
;;     :id                        1000
;;     :field_id                  %messages.sender_id
;;     :field_name                "SENDER_ID"
;;     :human_readable_field_id   %users.name
;;     :human_readable_field_name "NAME"}
;;
;; Example remap-form column (need to add info about column it is `:remapped_to`):
;;
;;    {:id           %messages.sender_id
;;     :name         "SENDER_ID"
;;     :options      {::target-dimension 1000}
;;     :display_name "Sender ID"}
;;
;; Example remap-to column (need to add info about column it is `:remapped_from`):
;;
;;    {:fk_field_id   %messages.sender_id
;;     :id            %users.name
;;     :options       {::source-dimension 1000}
;;     :name          "NAME"
;;     :display_name  "Sender ID"}
(s/defn ^:private merge-metadata-for-externally-remapped-column* :- su/Map
  [columns
   {{::keys [target-dimension source-dimension]} :options
    :as                                          column}
   {dimension-id      :id
    from-name         :field_name
    from-display-name :name
    to-name           :human_readable_field_name} :- ExternalRemappingDimension]
  (log/trace "Considering column\n"
             (u/pprint-to-str 'cyan (select-keys column [:id :name :fk_field_id :display_name :options]))
             (u/colorize :magenta "\nAdd :remapped_to metadata?")
             "\n=>" '(= dimension-id target-dimension)
             "\n=>" (list '= dimension-id target-dimension)
             "\n=>" (if (= dimension-id target-dimension)
                      (u/colorize :green true)
                      (u/colorize :red false))
             (u/colorize :magenta "\nAdd :remapped_from metadata?")
             "\n=>" '(= dimension-id source-dimension)
             "\n=>" (list '= dimension-id source-dimension)
             "\n=>" (if (= dimension-id source-dimension)
                      (u/colorize :green true)
                      (u/colorize :red false)))
  (u/prog1 (merge
            column
            (when (= dimension-id target-dimension)
              {:remapped_to (or (some (fn [{{::keys [source-dimension]} :options, target-name :name}]
                                        (when (= source-dimension dimension-id)
                                          target-name))
                                      columns)
                                to-name)})
            (when (= dimension-id source-dimension)
              {:remapped_from (or (some (fn [{{::keys [target-dimension]} :options, source-name :name}]
                                          (when (= target-dimension dimension-id)
                                            source-name))
                                        columns)
                                  from-name)
               :display_name  from-display-name}))
    (when (not= column <>)
      (log/tracef "Added metadata:\n%s" (u/pprint-to-str 'green (second (data/diff column <>)))))))

(s/defn ^:private merge-metadata-for-externally-remapped-column :- [su/Map]
  [columns :- [su/Map] dimension :- ExternalRemappingDimension]
  (log/tracef "Merging metadata for external dimension\n%s" (u/pprint-to-str 'yellow (into {} dimension)))
  (mapv #(merge-metadata-for-externally-remapped-column* columns % dimension)
        columns))

(s/defn ^:private merge-metadata-for-external-remaps :- [su/Map]
  [columns :- [su/Map] remapping-dimensions :- (s/maybe [ExternalRemappingDimension])]
  (reduce
   (fn [columns dimension]
     (merge-metadata-for-externally-remapped-column columns dimension))
   columns
   remapping-dimensions))

(s/defn ^:private add-remapping-info :- [su/Map]
  "Add `:display_name`, `:remapped_to`, and `:remapped_from` keys to columns for the results, needed by the frontend.
  To get this critical information, this uses the `remapping-dimensions` info saved by the pre-processing portion of
  this middleware for external remappings, and the internal-only remapped columns handled by post-processing
  middleware below for internal columns."
  [columns              :- [su/Map]
   remapping-dimensions :- (s/maybe [ExternalRemappingDimension])
  internal-cols-info    :- (s/maybe InternalColumnsInfo)]
  (-> columns
      (merge-metadata-for-internal-remaps internal-cols-info)
      (merge-metadata-for-external-remaps remapping-dimensions)))


;;;; Transform to add additional cols to results

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
   :semantic_type nil})

(defn- transform-values-for-col
  "Converts `values` to a type compatible with the base_type found for `col`. These values should be directly comparable
  with the values returned from the database for the given `col`."
  [{:keys [base_type]} values]
  (let [transform (condp #(isa? %2 %1) base_type
                    :type/Decimal    bigdec
                    :type/Float      double
                    :type/BigInteger bigint
                    :type/Integer    int
                    :type/Text       str
                    identity)]
    (map #(some-> % transform) values)))

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

(s/defn ^:private internal-columns-info :- InternalColumnsInfo
  "Info about the internal-only columns we add to the query."
  [cols]
  ;; hydrate Dimensions and FieldValues for all of the columns in the results, then make a map of dimension info for
  ;; each one that is `internal` type
  (let [internal-only-dims (->> (hydrate cols :values :dimensions)
                                (keep-indexed col->dim-map)
                                (filter identity))]
    {:internal-only-dims internal-only-dims
     ;; Get the entries we're going to add to `:cols` for each of the remapped values we add
     :internal-only-cols (map :new-column internal-only-dims)}))

(s/defn ^:private add-remapped-cols
  "Add remapping info `:remapped_from` and `:remapped_to` to each existing column in the results metadata, and add
  entries for each newly added column to the end of `:cols`."
  [metadata
   remapping-dimensions                                 :- (s/maybe [ExternalRemappingDimension])
   {:keys [internal-only-cols], :as internal-cols-info} :- (s/maybe InternalColumnsInfo)]
  (update metadata :cols (fn [cols]
                           (-> cols
                               (add-remapping-info remapping-dimensions internal-cols-info)
                               (concat internal-only-cols)))))

(s/defn ^:private remap-results-xform
  "Munges results for remapping after the query has been executed. For internal remappings, a new column needs to be
  added and each row flowing through needs to include the remapped data for the new column. For external remappings
  the column information needs to be updated with what it's being remapped from and the user specified name for the
  remapped column."
  [{:keys [internal-only-dims]} :- InternalColumnsInfo rf]
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
      (remap-results-xform internal-cols-info (rff metadata)))))

(defn add-remapping
  "Query processor middleware. `qp` is the query processor, returns a function that works on a `query` map. Delgates to
  `add-fk-remaps` for making remapping changes to the query (before executing the query). Then delegates to
  `remap-results` to munge the results after query execution."
  [qp]
  (fn [{query-type :type, :as query, {:keys [disable-remaps?], :or {disable-remaps? false}} :middleware} rff context]
    (if (or (= query-type :native)
            disable-remaps?)
      (qp query rff context)
      (let [[remapping-dimensions query'] (add-fk-remaps query)]
        (qp query' (remap-results-rff remapping-dimensions rff) context)))))
