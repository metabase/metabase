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
  `name` is `:remapped_from` `:category_id`.

  See also [[metabase.models.params.chain-filter]] for another explanation of remapping."
  (:require
   [clojure.data :as data]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as helpers]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^:private ExternalRemappingDimension
  "Schema for the info we fetch about `external` type Dimensions that will be used for remappings in this Query. Fetched
  by the pre-processing portion of the middleware, and passed along to the post-processing portion."
  [:map
   [:id                        ::lib.schema.id/dimension]              ; unique ID for the remapping
   [:name                      ::lib.schema.common/non-blank-string]   ; display name for the remapping
   [:field-id                  ::lib.schema.id/field]                  ; ID of the Field being remapped
   [:field-name                ::lib.schema.common/non-blank-string]   ; Name of the Field being remapped
   [:human-readable-field-id   ::lib.schema.id/field]                  ; ID of the FK Field to remap values to
   [:human-readable-field-name ::lib.schema.common/non-blank-string]]) ; Name of the FK Field to remap values to

;;;; Pre-processing

(mu/defn ^:private fields->field-id->remapping-dimension :- [:maybe [:map-of ::lib.schema.id/field ExternalRemappingDimension]]
  "Given a sequence of field clauses (from the `:fields` clause), return a map of `:field-id` clause (other clauses
  are ineligable) to a remapping dimension information for any Fields that have an `external` type dimension remapping."
  [fields :- [:maybe [:sequential mbql.s/Field]]]
  (when-let [field-ids (not-empty (set (lib.util.match/match fields [:field (id :guard integer?) _] id)))]
    (let [field-metadatas (lib.metadata/bulk-metadata-or-throw (qp.store/metadata-provider) :metadata/column field-ids)]
      (when-let [remap-field-ids (not-empty (into #{}
                                                  (keep (comp :field-id :lib/external-remap))
                                                  field-metadatas))]
        ;; do a bulk fetch of the remaps.
        (lib.metadata/bulk-metadata-or-throw (qp.store/metadata-provider) :metadata/column remap-field-ids)
        (into {}
              (comp (filter :lib/external-remap)
                    (keep (fn [field]
                            (let [{remap-id :id, remap-name :name, remap-field-id :field-id} (:lib/external-remap field)
                                  remap-field                                                (lib.metadata.protocols/field
                                                                                              (qp.store/metadata-provider)
                                                                                              remap-field-id)]
                              (when remap-field
                                [(:id field) {:id                        remap-id
                                              :name                      remap-name
                                              :field-id                  (:id field)
                                              :field-name                (:name field)
                                              :human-readable-field-id   remap-field-id
                                              :human-readable-field-name (:name remap-field)}])))))
              field-metadatas)))))

(def ^:private RemapColumnInfo
  [:map
   [:original-field-clause mbql.s/field]
   [:new-field-clause      mbql.s/field]
   [:dimension             ExternalRemappingDimension]])

(mu/defn ^:private remap-column-infos :- [:maybe [:sequential RemapColumnInfo]]
  "Return tuples of `:field-id` clauses, the new remapped column `:fk->` clauses that the Field should be remapped to
  and the Dimension that suggested the remapping, which is used later in this middleware for post-processing. Order is
  important here, because the results are added to the `:fields` column in order. (TODO - why is it important, if they
  get hidden when displayed anyway?)"
  [fields :- [:maybe [:sequential mbql.s/Field]]]
  (when-let [field-id->remapping-dimension (fields->field-id->remapping-dimension fields)]
    ;; Reconstruct how we uniquify names in [[metabase.query-processor.middleware.annotate]]
    (let [name-generator (lib.util/unique-name-generator (qp.store/metadata-provider))
          unique-name    (fn [field-id]
                           (assert (pos-int? field-id) (str "Invalid Field ID: " (pr-str field-id)))
                           (let [field (lib.metadata/field (qp.store/metadata-provider) field-id)]
                             (name-generator (:name field))))]
      (vec
       (lib.util.match/match fields
         ;; don't match Fields that have been joined from another Table
         [:field
          (id :guard (every-pred integer? field-id->remapping-dimension))
          (_ :guard (complement (some-fn :join-alias :source-field)))]
         (let [dimension (field-id->remapping-dimension id)]
           {:original-field-clause &match
            :new-field-clause      [:field
                                    (u/the-id (:human-readable-field-id dimension))
                                    {:source-field            id
                                     ::new-field-dimension-id (u/the-id dimension)}]
            :dimension             (assoc dimension
                                          :field-name                (-> dimension :field-id unique-name)
                                          :human-readable-field-name (-> dimension :human-readable-field-id unique-name))}))))))

(mu/defn ^:private add-fk-remaps-rewrite-existing-fields-add-original-field-dimension-id :- [:maybe [:sequential mbql.s/Field]]
  "Rewrite existing `:fields` in a query. Add `::original-field-dimension-id` to any Field clauses that are
  remapped-from."
  [infos  :- [:maybe [:sequential RemapColumnInfo]]
   fields :- [:maybe [:sequential mbql.s/Field]]]
  (let [field->remapped-col (into {} (map (juxt :original-field-clause :new-field-clause)) infos)]
    (mapv
     (fn [field]
       (let [[_ _ {::keys [new-field-dimension-id]}] (get field->remapped-col field)]
         (cond-> field
           new-field-dimension-id (mbql.u/update-field-options assoc ::original-field-dimension-id new-field-dimension-id))))
     fields)))

(mu/defn ^:private add-fk-remaps-rewrite-existing-fields-add-new-field-dimension-id :- [:maybe [:sequential mbql.s/Field]]
  "Rewrite existing `:fields` in a query. Add `::new-field-dimension-id` to any existing remap-to Fields that *would*
  have been added if they did not already exist."
  [infos  :- [:maybe [:sequential RemapColumnInfo]]
   fields :- [:maybe [:sequential mbql.s/Field]]]
  (let [normalized-clause->new-options (into {}
                                             (map (juxt (fn [{clause :new-field-clause}]
                                                          (mbql.u/remove-namespaced-options clause))
                                                        (fn [{[_ _ options] :new-field-clause}]
                                                          options)))
                                             infos)]
    (mapv (fn [field]
            (let [options (normalized-clause->new-options (mbql.u/remove-namespaced-options field))]
              (cond-> field
                options (mbql.u/update-field-options merge options))))
          fields)))

(mu/defn ^:private add-fk-remaps-rewrite-existing-fields :- [:maybe [:sequential mbql.s/Field]]
  "Rewrite existing `:fields` in a query. Add `::original-field-dimension-id` and ::new-field-dimension-id` where
  appropriate."
  [infos  :- [:maybe [:sequential RemapColumnInfo]]
   fields :- [:maybe [:sequential mbql.s/Field]]]
  (->> fields
       (add-fk-remaps-rewrite-existing-fields-add-original-field-dimension-id infos)
       (add-fk-remaps-rewrite-existing-fields-add-new-field-dimension-id infos)))

(mu/defn ^:private add-fk-remaps-rewrite-order-by :- [:maybe [:sequential ::mbql.s/OrderBy]]
  "Order by clauses that include an external remapped column should be replace that original column in the order by with
  the newly remapped column. This should order by the text of the remapped column vs. the id of the source column
  before the remapping"
  [field->remapped-col :- [:map-of mbql.s/field mbql.s/field]
   order-by-clauses    :- [:maybe [:sequential ::mbql.s/OrderBy]]]
  (into []
        (comp (map (fn [[direction field, :as order-by-clause]]
                     (if-let [remapped-col (get field->remapped-col field)]
                       [direction remapped-col]
                       order-by-clause)))
              (distinct))
        order-by-clauses))

(defn- add-fk-remaps-rewrite-breakout
  [field->remapped-col breakout-clause]
  (into []
        (comp (mapcat (fn [field]
                        (if-let [[_ _ {::keys [new-field-dimension-id]} :as remapped-col] (get field->remapped-col field)]
                          [remapped-col (mbql.u/update-field-options field assoc ::original-field-dimension-id new-field-dimension-id)]
                          [field])))
              (distinct))
        breakout-clause))

(def ^:private QueryAndRemaps
  [:map
   [:remaps [:maybe (helpers/distinct [:sequential ExternalRemappingDimension])]]
   [:query  mbql.s/Query]])

(defn- add-fk-remaps-one-level
  [{:keys [fields order-by breakout], {source-query-remaps ::remaps} :source-query, :as query}]
  (let [query (m/dissoc-in query [:source-query ::remaps])]
    ;; fetch remapping column pairs if any exist...
    (if-let [infos (not-empty (remap-column-infos (concat fields breakout)))]
      ;; if they do, update `:fields`, `:order-by` and `:breakout` clauses accordingly and add to the query
      (let [ ;; make a map of field-id-clause -> fk-clause from the tuples
            original->remapped             (into {} (map (juxt :original-field-clause :new-field-clause)) infos)
            existing-fields                (add-fk-remaps-rewrite-existing-fields infos fields)
            ;; don't add any new entries for fields that already exist. Use [[mbql.u/remove-namespaced-options]] here so
            ;; we don't add new entries even if the existing Field has some extra info e.g. extra unknown namespaced
            ;; keys.
            existing-normalized-fields-set (into #{} (map mbql.u/remove-namespaced-options) existing-fields)
            new-fields                     (into
                                            existing-fields
                                            (comp (map :new-field-clause)
                                                  (remove (comp existing-normalized-fields-set mbql.u/remove-namespaced-options)))
                                            infos)
            new-breakout                   (add-fk-remaps-rewrite-breakout original->remapped breakout)
            new-order-by                   (add-fk-remaps-rewrite-order-by original->remapped order-by)
            remaps                         (into [] (comp cat (distinct)) [source-query-remaps (map :dimension infos)])]
        ;; return the Dimensions we are using and the query
        (cond-> query
          (seq fields)   (assoc :fields new-fields)
          (seq order-by) (assoc :order-by new-order-by)
          (seq breakout) (assoc :breakout new-breakout)
          (seq remaps)   (assoc ::remaps remaps)))
      ;; otherwise return query as-is
      (cond-> query
        (seq source-query-remaps) (assoc ::remaps source-query-remaps)))))

(mu/defn ^:private add-fk-remaps :- QueryAndRemaps
  "Add any Fields needed for `:external` remappings to the `:fields` clause of the query, and update `:order-by` and
  `breakout` clauses as needed. Returns a map with `:query` (the updated query) and `:remaps` (a sequence
  of [[:sequential ExternalRemappingDimension]] information maps)."
  [query]
  (let [query (walk/postwalk
               (fn [form]
                 (if (and (map? form)
                          ((some-fn :source-table :source-query) form)
                          (not (:condition form)))
                   (add-fk-remaps-one-level form)
                   form))
               query)]
    {:query (m/dissoc-in query [:query ::remaps]), :remaps (get-in query [:query ::remaps])}))

(defn add-remapped-columns
  "Pre-processing middleware. For columns that have remappings to other columns (FK remaps), rewrite the query to
  include the extra column. Add `::external-remaps` information about which columns were remapped so [[remap-results]]
  can do appropriate results transformations in post-processing."
  [{{:keys [disable-remaps?]} :middleware, query-type :type, :as query}]
  (if (or disable-remaps?
          (= query-type :native))
    query
    (let [{:keys [remaps query]} (add-fk-remaps query)]
      (cond-> query
        ;; convert the remappings to plain maps so we don't have to look at record type nonsense everywhere
        (seq remaps) (assoc ::external-remaps (mapv (partial into {}) remaps))))))


;;;; Post-processing

(def ^:private InternalDimensionInfo
  [:map
   ;; index of original column
   [:col-index      :int]
   ;; names
   [:from            ::lib.schema.common/non-blank-string]
   ;; I'm not convinced this works if there's already a column with the same name in the results.
   [:to              ::lib.schema.common/non-blank-string]
   ;; map of original value -> human readable value
   [:value->readable :map]
   ;; Info about the new column we will tack on to end of `:cols`
   [:new-column      :map]])

(def ^:private InternalColumnsInfo
  [:map
   [:internal-only-dims [:maybe [:sequential InternalDimensionInfo]]]
   ;; this is just (map :new-column internal-only-dims)
   [:internal-only-cols [:maybe [:sequential :map]]]])

;;;; Metadata

(mu/defn ^:private merge-metadata-for-internally-remapped-column :- [:maybe [:sequential :map]]
  "If one of the internal remapped columns says it's remapped from this column, merge in the `:remapped_to` info."
  [columns                :- [:maybe [:sequential :map]]
   {:keys [col-index to]} :- InternalDimensionInfo]
  (update (vec columns) col-index assoc :remapped_to to))

(mu/defn ^:private merge-metadata-for-internal-remaps :- [:maybe [:sequential :map]]
  [columns                      :- [:maybe [:sequential :map]]
   {:keys [internal-only-dims]} :- [:maybe InternalColumnsInfo]]
  (reduce
   merge-metadata-for-internally-remapped-column
   columns
   internal-only-dims))

;; Example external dimension:
;;
;;    {:name                      "Sender ID"
;;     :id                        1000
;;     :field_id                  %messages.sender_id
;;     :field_name                "SENDER_ID"
;;     :human-readable-field-id   %users.name
;;     :human-readable-field-name "NAME"}
;;
;; Example remap-from column (need to add info about column it is `:remapped_to`):
;;
;;    {:id           %messages.sender_id
;;     :name         "SENDER_ID"
;;     :options      {::original-field-dimension-id 1000}
;;     :display_name "Sender ID"}
;;
;; Example remap-to column (need to add info about column it is `:remapped_from`):
;;
;;    {:fk_field_id   %messages.sender_id
;;     :id            %users.name
;;     :options       {::new-field-dimension-id 1000}
;;     :name          "NAME"
;;     :display_name  "Sender ID"}
(mu/defn ^:private merge-metadata-for-externally-remapped-column* :- :map
  [columns
   {{::keys [original-field-dimension-id new-field-dimension-id]} :options
    :as                                          column} :- :map
   {dimension-id      :id
    from-name         :field_name
    from-display-name :name
    to-name           :human-readable-field-name} :- ExternalRemappingDimension]
  (log/trace "Considering column\n"
             (u/pprint-to-str 'cyan (select-keys column [:id :name :fk_field_id :display_name :options]))
             (u/colorize :magenta "\nAdd :remapped_to metadata?")
             "\n=>" '(= dimension-id original-field-dimension-id)
             "\n=>" (list '= dimension-id original-field-dimension-id)
             "\n=>" (if (= dimension-id original-field-dimension-id)
                      (u/colorize :green true)
                      (u/colorize :red false))
             (u/colorize :magenta "\nAdd :remapped_from metadata?")
             "\n=>" '(= dimension-id new-field-dimension-id)
             "\n=>" (list '= dimension-id new-field-dimension-id)
             "\n=>" (if (= dimension-id new-field-dimension-id)
                      (u/colorize :green true)
                      (u/colorize :red false)))
  (u/prog1 (merge
            column
            ;; if this is a column we're remapping FROM, we need to add information about which column we're remapping
            ;; TO
            (when (= dimension-id original-field-dimension-id)
              {:remapped_to (or (some (fn [{{::keys [new-field-dimension-id]} :options, target-name :name}]
                                        (when (= new-field-dimension-id dimension-id)
                                          target-name))
                                      columns)
                                to-name)})
            ;; if this is a column we're remapping TO, we need to add information about which column we're remapping
            ;; FROM
            (when (= dimension-id new-field-dimension-id)
              {:remapped_from (or (some (fn [{{::keys [original-field-dimension-id]} :options, source-name :name}]
                                          (when (= original-field-dimension-id dimension-id)
                                            source-name))
                                        columns)
                                  from-name)
               :display_name  from-display-name}))
    (when (not= column <>)
      (log/tracef "Added metadata:\n%s" (u/pprint-to-str 'green (second (data/diff column <>)))))))

(mu/defn ^:private merge-metadata-for-externally-remapped-column :- [:maybe [:sequential :map]]
  [columns :- [:maybe [:sequential :map]] dimension :- ExternalRemappingDimension]
  (log/tracef "Merging metadata for external dimension\n%s" (u/pprint-to-str 'yellow (into {} dimension)))
  (mapv #(merge-metadata-for-externally-remapped-column* columns % dimension)
        columns))

(mu/defn ^:private merge-metadata-for-external-remaps :- [:maybe [:sequential :map]]
  [columns :- [:maybe [:sequential :map]] remapping-dimensions :- [:maybe [:sequential ExternalRemappingDimension]]]
  (reduce
   merge-metadata-for-externally-remapped-column
   columns
   remapping-dimensions))

(mu/defn ^:private add-remapping-info :- [:maybe [:sequential :map]]
  "Add `:display_name`, `:remapped_to`, and `:remapped_from` keys to columns for the results, needed by the frontend.
  To get this critical information, this uses the `remapping-dimensions` info saved by the pre-processing portion of
  this middleware for external remappings, and the internal-only remapped columns handled by post-processing
  middleware below for internal columns."
  [columns              :- [:maybe [:sequential :map]]
   remapping-dimensions :- [:maybe [:sequential ExternalRemappingDimension]]
   internal-cols-info   :- [:maybe InternalColumnsInfo]]
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
  "Converts `values` to a type compatible with the `base-type` found for `col`. These values should be directly
  comparable with the values returned from the database for the given `col`."
  [{:keys [base-type], :as _column-metadata} values]
  (let [transform (condp #(isa? %2 %1) base-type
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

(def ^:private ColumnMetadataWithOptionalBaseType
  "ColumnMetadata, but `:base-type` is optional, because we may not have that information if this is this is the initial
  metadata we get back when running a native query against a DB that doesn't return type metadata for query
  results (such as MongoDB, since it isn't strongly typed)."
  [:merge
   ::lib.schema.metadata/column
   [:map
    [:base-type {:optional true} ::lib.schema.common/base-type]]])

(mu/defn ^:private col->dim-map :- [:maybe InternalDimensionInfo]
  "Given a `:col` map from the results, return a map of information about the `internal` dimension used for remapping
  it."
  [idx :- ::lib.schema.common/int-greater-than-or-equal-to-zero
   {{:keys [values human-readable-values], remap-to :name} :lib/internal-remap
    :as                                                    col} :- ColumnMetadataWithOptionalBaseType]
  (when (seq values)
    (let [remap-from (:name col)]
      {:col-index       idx
       :from            remap-from
       :to              remap-to
       :value->readable (zipmap (transform-values-for-col col values)
                                human-readable-values)
       :new-column      (create-remapped-col remap-to
                                             remap-from
                                             (infer-human-readable-values-type human-readable-values))})))

(mu/defn ^:private make-row-map-fn :- [:maybe fn?]
  "Return a function that will add internally-remapped values to each row in the results. (If there is no remapping to
  be done, this function returns `nil`.)"
  [dims :- [:maybe [:sequential InternalDimensionInfo]]]
  (when (seq dims)
    (let [f (apply juxt (for [{:keys [col-index value->readable]} dims]
                          (fn [row]
                            (value->readable (nth row col-index)))))]
      (fn [row]
        (into (vec row) (f row))))))

(mu/defn ^:private internal-columns-info :- InternalColumnsInfo
  "Info about the internal-only columns we add to the query."
  [cols :- [:maybe [:sequential ColumnMetadataWithOptionalBaseType]]]
  ;; hydrate Dimensions and FieldValues for all of the columns in the results, then make a map of dimension info for
  ;; each one that is `internal` type
  (let [internal-only-dims (keep-indexed col->dim-map cols)]
    {:internal-only-dims internal-only-dims
     ;; Get the entries we're going to add to `:cols` for each of the remapped values we add
     :internal-only-cols (map :new-column internal-only-dims)}))

(mu/defn ^:private add-remapped-to-and-from-metadata
  "Add remapping info `:remapped_from` and `:remapped_to` to each existing column in the results metadata, and add
  entries for each newly added column to the end of `:cols`."
  [metadata                                             :- [:map
                                                            [:cols [:maybe [:sequential :map]]]]
   remapping-dimensions                                 :- [:maybe [:sequential ExternalRemappingDimension]]
   {:keys [internal-only-cols], :as internal-cols-info} :- [:maybe InternalColumnsInfo]]
  (update metadata :cols (fn [cols]
                           (-> cols
                               (add-remapping-info remapping-dimensions internal-cols-info)
                               (concat internal-only-cols)))))

(mu/defn ^:private remap-results-xform
  "Munges results for remapping after the query has been executed. For internal remappings, a new column needs to be
  added and each row flowing through needs to include the remapped data for the new column. For external remappings
  the column information needs to be updated with what it's being remapped from and the user specified name for the
  remapped column."
  [{:keys [internal-only-dims]} :- InternalColumnsInfo rf]
  (if-let [remap-fn (make-row-map-fn internal-only-dims)]
    ((map remap-fn) rf)
    rf))

(defn remap-results
  "Post-processing middleware. Handles `::external-remaps` added by [[add-remapped-columns-middleware]]; transforms
  results and adds additional metadata based on these remaps, as well as internal (human-readable values) remaps."
  [{::keys [external-remaps], {:keys [disable-remaps?]} :middleware} rff]
  (if disable-remaps?
    rff
    (fn remap-results-rff* [metadata]
      (let [mlv2-cols          (map
                                #(lib.metadata.jvm/instance->metadata % :metadata/column)
                                (:cols metadata))
            internal-cols-info (internal-columns-info mlv2-cols)
            metadata           (add-remapped-to-and-from-metadata metadata external-remaps internal-cols-info)]
        (remap-results-xform internal-cols-info (rff metadata))))))
