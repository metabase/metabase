(ns metabase.query-processor.middleware.add-remaps
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

  See also [[metabase.parameters.chain-filter]] for another explanation of remapping.

  TODO (Cam 6/19/25) -- rename this to `add-remaps` or something that makes it's purposes a little less opaque."
  (:require
   [clojure.data :as data]
   [medley.core :as m]
   [metabase.legacy-mbql.schema.helpers :as helpers]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.middleware.large-int :as large-int]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::simplified-ref
  [:tuple
   [:enum :field :expression :aggregation]
   [:and
    :map
    [:fn
     {:error/message "options map without namespaced keys and base-type/effective-type"}
     (complement (some-fn :base-type :effective-type :ident :lib/uuid))]]
   [:or
    ::lib.schema.id/field
    :string]])

(mu/defn- simplify-ref-options :- ::simplified-ref
  [a-ref :- ::lib.schema.ref/ref]
  (lib/update-options a-ref (fn [opts]
                              (-> opts
                                  (->> (m/filter-keys simple-keyword?))
                                  (dissoc :base-type :effective-type :ident)))))

(mr/def ::external-remapping
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

(mu/defn- fields->field-id->remapping-dimension :- [:maybe [:map-of ::lib.schema.id/field ::external-remapping]]
  "Given a sequence of field clauses (from the `:fields` clause), return a map of `:field-id` clause (other clauses
  are ineligable) to a remapping dimension information for any Fields that have an `external` type dimension remapping."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   refs                  :- [:maybe [:sequential ::lib.schema.ref/ref]]]
  (when-let [field-ids (not-empty (set (lib.util.match/match refs [:field _opts (id :guard pos-int?)] id)))]
    (let [field-metadatas (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/column field-ids)]
      (when-let [remap-field-ids (not-empty (into #{}
                                                  (keep (comp :field-id :lib/external-remap))
                                                  field-metadatas))]
        ;; do a bulk fetch of the remaps.
        (lib.metadata/bulk-metadata-or-throw metadata-providerable :metadata/column remap-field-ids)
        (into {}
              (comp (filter :lib/external-remap)
                    (keep (fn [field]
                            (let [{remap-id :id, remap-name :name, remap-field-id :field-id} (:lib/external-remap field)
                                  remap-field                                                (lib.metadata/field
                                                                                              metadata-providerable
                                                                                              remap-field-id)]
                              (when remap-field
                                [(:id field) {:id                        remap-id
                                              :name                      remap-name
                                              :field-id                  (:id field)
                                              :field-name                (:name field)
                                              :human-readable-field-id   remap-field-id
                                              :human-readable-field-name (:name remap-field)}])))))
              field-metadatas)))))

(mr/def ::remap-info
  [:map
   [:original-field-clause :mbql.clause/field]
   [:new-field-clause      [:and
                            :mbql.clause/field
                            [:tuple
                             [:= :field]
                             [:map
                              [::new-field-dimension-id ::lib.schema.id/dimension]]
                             :any]]]
   [:dimension             ::external-remapping]])

(mu/defn- remap-column-infos :- [:maybe [:sequential ::remap-info]]
  "Return tuples of `:field-id` clauses, the new remapped column `:fk->` clauses that the Field should be remapped to
  and the Dimension that suggested the remapping, which is used later in this middleware for post-processing. Order is
  important here, because the results are added to the `:fields` column in order. (TODO - why is it important, if they
  get hidden when displayed anyway?)"
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   fields                :- [:maybe [:sequential ::lib.schema.ref/ref]]]
  (when-let [field-id->remapping-dimension (fields->field-id->remapping-dimension metadata-providerable fields)]
    ;; Reconstruct how we uniquify names in [[metabase.query-processor.middleware.annotate]]
    (let [name-generator (lib.util/unique-name-generator)
          unique-name    (fn [field-id]
                           (assert (pos-int? field-id) (str "Invalid Field ID: " (pr-str field-id)))
                           (let [field (lib.metadata/field metadata-providerable field-id)]
                             (name-generator (:name field))))]
      (vec
       (lib.util.match/match fields
         ;; don't match Fields that have been joined from another Table
         [:field
          (_opts :guard (complement (some-fn :join-alias :source-field)))
          (id :guard (every-pred pos-int? field-id->remapping-dimension))]
         (let [dimension (field-id->remapping-dimension id)]
           {:original-field-clause &match
            :new-field-clause      [:field
                                    {:lib/uuid                (str (random-uuid))
                                     :source-field            id
                                     ::new-field-dimension-id (u/the-id dimension)}
                                    (u/the-id (:human-readable-field-id dimension))]
            :dimension             (assoc dimension
                                          :field-name                (-> dimension :field-id unique-name)
                                          :human-readable-field-name (-> dimension :human-readable-field-id unique-name))}))))))

(mu/defn- add-fk-remaps-rewrite-existing-fields-add-original-field-dimension-id :- ::lib.schema/fields
  "Rewrite existing `:fields` in a query. Add `::original-field-dimension-id` to any Field clauses that are
  remapped-from."
  [infos  :- [:maybe [:sequential ::remap-info]]
   fields :- ::lib.schema/fields]
  (let [field->remapped-col (into {}
                                  (map (fn [{:keys [original-field-clause new-field-clause]}]
                                         [(simplify-ref-options original-field-clause) new-field-clause]))
                                  infos)]
    (mapv
     (fn [field-ref]
       (if-let [[_tag {::keys [new-field-dimension-id], :as _opts} _id-or-name] (field->remapped-col (simplify-ref-options field-ref))]
         (lib/update-options field-ref assoc ::original-field-dimension-id new-field-dimension-id)
         field-ref))
     fields)))

(mu/defn- add-fk-remaps-rewrite-existing-fields-add-new-field-dimension-id :- ::lib.schema/fields
  "Rewrite existing `:fields` in a query. Add `::new-field-dimension-id` to any existing remap-to Fields that *would*
  have been added if they did not already exist."
  [infos  :- [:maybe [:sequential ::remap-info]]
   fields :- ::lib.schema/fields]
  (let [normalized-clause->new-options (into {}
                                             (map (juxt (fn [{a-ref :new-field-clause}]
                                                          (simplify-ref-options a-ref))
                                                        (fn [{a-ref :new-field-clause}]
                                                          (lib/options a-ref))))
                                             infos)]
    (mapv (fn [a-ref]
            (let [options (normalized-clause->new-options (simplify-ref-options a-ref))]
              (cond-> a-ref
                options (lib/update-options #(merge options %)))))
          fields)))

(mu/defn- add-fk-remaps-rewrite-existing-fields :- [:maybe ::lib.schema/fields]
  "Rewrite existing `:fields` in a query. Add `::original-field-dimension-id` and ::new-field-dimension-id` where
  appropriate."
  [infos  :- [:maybe [:sequential ::remap-info]]
   fields :- [:maybe ::lib.schema/fields]]
  (when (seq fields)
    (->> fields
         (add-fk-remaps-rewrite-existing-fields-add-original-field-dimension-id infos)
         (add-fk-remaps-rewrite-existing-fields-add-new-field-dimension-id infos))))

(mu/defn- add-fk-remaps-rewrite-order-by :- [:maybe ::lib.schema.order-by/order-bys]
  "Order by clauses that include an external remapped column should be replace that original column in the order by with
  the newly remapped column. This should order by the text of the remapped column vs. the id of the source column
  before the remapping"
  [field->remapped-col :- [:map-of ::simplified-ref :mbql.clause/field]
   order-by-clauses    :- [:maybe ::lib.schema.order-by/order-bys]]
  (when (seq order-by-clauses)
    (into []
          (comp (map (fn [[direction opts field, :as order-by-clause]]
                       (if-let [remapped-col (get field->remapped-col (simplify-ref-options field))]
                         [direction opts (lib/fresh-uuids remapped-col)]
                         order-by-clause)))
                (distinct))
          order-by-clauses)))

(mu/defn- add-fk-remaps-rewrite-breakout :- [:maybe ::lib.schema/breakouts]
  [field->remapped-col :- [:map-of ::simplified-ref ::lib.schema.ref/ref]
   breakouts           :- [:maybe ::lib.schema/breakouts]]
  (when (seq breakouts)
    (into []
          (comp (mapcat (fn [a-ref]
                          (if-let [[_tag {::keys [new-field-dimension-id], :as _opts} _id-or-name  :as remapped-col] (get field->remapped-col (simplify-ref-options a-ref))]
                            [(lib/fresh-uuids remapped-col)
                             (lib/update-options a-ref assoc ::original-field-dimension-id new-field-dimension-id)]
                            [a-ref])))
                (distinct))
          breakouts)))

(mr/def ::query-and-remaps
  [:map
   [:remaps [:maybe (helpers/distinct [:sequential ::external-remapping])]]
   [:query  ::lib.schema/query]])

(mu/defn- add-fk-remaps-one-level :- ::lib.schema/stage
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   {:keys [fields order-by breakout], :as stage} :- ::lib.schema/stage]
  (let [previous-stage-remaps (when-let [previous-path (lib.walk/previous-path path)]
                                (::remaps (get-in query previous-path)))]
    ;; fetch remapping column pairs if any exist...
    (if-let [infos (not-empty (remap-column-infos query (concat fields breakout)))]
      ;; if they do, update `:fields`, `:order-by` and `:breakout` clauses accordingly and add to the query
      (let [;; make a map of field-id-clause -> fk-clause from the tuples
            original->remapped             (into {}
                                                 (map (fn [{:keys [original-field-clause new-field-clause]}]
                                                        [(simplify-ref-options original-field-clause) new-field-clause]))
                                                 infos)
            existing-fields                (add-fk-remaps-rewrite-existing-fields infos fields)
            ;; don't add any new entries for fields that already exist. Use [[simplify-ref-options]] here so
            ;; we don't add new entries even if the existing Field has some extra info e.g. extra unknown namespaced
            ;; keys.
            existing-normalized-fields-set (into #{} (map simplify-ref-options) existing-fields)
            new-fields                     (into
                                            existing-fields
                                            (comp (map :new-field-clause)
                                                  (remove (comp existing-normalized-fields-set simplify-ref-options))
                                                  (map lib/fresh-uuids))
                                            infos)
            new-breakout                   (add-fk-remaps-rewrite-breakout original->remapped breakout)
            new-order-by                   (add-fk-remaps-rewrite-order-by original->remapped order-by)
            remaps                         (into []
                                                 (comp cat
                                                       (distinct))
                                                 [previous-stage-remaps (map :dimension infos)])]
        ;; return the Dimensions we are using and the query
        (cond-> stage
          (seq fields)   (assoc :fields new-fields)
          (seq order-by) (assoc :order-by new-order-by)
          (seq breakout) (assoc :breakout new-breakout)
          (seq remaps)   (assoc ::remaps remaps)))
      ;; otherwise return query as-is
      (cond-> stage
        (seq previous-stage-remaps) (assoc ::remaps previous-stage-remaps)))))

(mu/defn- add-fk-remaps :- ::query-and-remaps
  "Add any Fields needed for `:external` remappings to the `:fields` clause of the query, and update `:order-by` and
  `breakout` clauses as needed. Returns a map with `:query` (the updated query) and `:remaps` (a sequence
  of [[:sequential ::external-remapping]] information maps)."
  [query :- ::lib.schema/query]
  (let [query' (lib.walk/walk-stages query add-fk-remaps-one-level)
        remaps (::remaps (lib/query-stage query' -1))]
    {:query  (lib.walk/walk-stages
              query'
              (fn [_query _path stage]
                (dissoc stage ::remaps)))
     :remaps remaps}))

(mu/defn add-remapped-columns :- ::lib.schema/query
  "Pre-processing middleware. For columns that have remappings to other columns (FK remaps), rewrite the query to
  include the extra column. Add `::external-remaps` information about which columns were remapped so [[remap-results]]
  can do appropriate results transformations in post-processing."
  [{{:keys [disable-remaps?]} :middleware, :as query} :- ::lib.schema/query]
  (if (or disable-remaps?
          ;; last stage (only stage) is native
          (= (:lib/type (lib/query-stage query -1)) :mbql.stage/native))
    query
    (let [{:keys [remaps query]} (add-fk-remaps query)]
      (cond-> query
        ;; convert the remappings to plain maps so we don't have to look at record type nonsense everywhere
        (seq remaps) (assoc ::external-remaps (mapv (partial into {}) remaps))))))

;;;; Post-processing

(mr/def ::internal-remapping-info
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

(mr/def ::internal-columns-info
  [:map
   [:internal-only-dims [:maybe [:sequential ::internal-remapping-info]]]
   ;; this is just (map :new-column internal-only-dims)
   [:internal-only-cols [:maybe [:sequential :map]]]])

;;;; Metadata

(mu/defn- merge-metadata-for-internally-remapped-column :- [:maybe [:sequential :map]]
  "If one of the internal remapped columns says it's remapped from this column, merge in the `:remapped_to` info."
  [columns                :- [:maybe [:sequential :map]]
   {:keys [col-index to]} :- ::internal-remapping-info]
  (update (vec columns) col-index assoc :remapped_to to))

(mu/defn- merge-metadata-for-internal-remaps :- [:maybe [:sequential :map]]
  [columns                      :- [:maybe [:sequential :map]]
   {:keys [internal-only-dims]} :- [:maybe ::internal-columns-info]]
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
(mu/defn- merge-metadata-for-externally-remapped-column* :- :map
  [columns
   {{::keys [original-field-dimension-id new-field-dimension-id]} :options
    :as                                          column} :- :map
   {dimension-id      :id
    from-name         :field_name
    from-display-name :name
    to-name           :human-readable-field-name} :- ::external-remapping]
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

(mu/defn- merge-metadata-for-externally-remapped-column :- [:maybe [:sequential :map]]
  [columns :- [:maybe [:sequential :map]] dimension :- ::external-remapping]
  (log/tracef "Merging metadata for external dimension\n%s" (u/pprint-to-str 'yellow (into {} dimension)))
  (mapv #(merge-metadata-for-externally-remapped-column* columns % dimension)
        columns))

(mu/defn- merge-metadata-for-external-remaps :- [:maybe [:sequential :map]]
  [columns :- [:maybe [:sequential :map]] remapping-dimensions :- [:maybe [:sequential ::external-remapping]]]
  (reduce
   merge-metadata-for-externally-remapped-column
   columns
   remapping-dimensions))

(mu/defn- add-remapping-info :- [:maybe [:sequential :map]]
  "Add `:display_name`, `:remapped_to`, and `:remapped_from` keys to columns for the results, needed by the frontend.
  To get this critical information, this uses the `remapping-dimensions` info saved by the pre-processing portion of
  this middleware for external remappings, and the internal-only remapped columns handled by post-processing
  middleware below for internal columns."
  [columns              :- [:maybe [:sequential :map]]
   remapping-dimensions :- [:maybe [:sequential ::external-remapping]]
   internal-cols-info   :- [:maybe ::internal-columns-info]]
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
  comparable with the values returned from the database for the given `col`.

  When `large-int` has converted a would-be `BigInteger` column to strings, `stringified?` is truthy; in that case
  the values are further transformed to strings."
  [{:keys [base-type]} values stringified?]
  (let [transform (condp #(isa? %2 %1) base-type
                    :type/Decimal    bigdec
                    :type/Float      double
                    :type/BigInteger bigint
                    :type/Integer    long
                    :type/Text       str
                    identity)
        transform (cond->> transform
                    stringified? (comp large-int/maybe-large-int->string))]
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

(mr/def ::column-with-optional-base-type
  "ColumnMetadata, but `:base-type` is optional, because we may not have that information if this is this is the initial
  metadata we get back when running a native query against a DB that doesn't return type metadata for query
  results (such as MongoDB, since it isn't strongly typed)."
  [:merge
   ::lib.schema.metadata/column
   [:map
    [:base-type {:optional true} ::lib.schema.common/base-type]]])

(mu/defn- col->dim-map :- [:maybe ::internal-remapping-info]
  "Given a `:col` map from the results, return a map of information about the `internal` dimension used for remapping
  it."
  [idx :- ::lib.schema.common/int-greater-than-or-equal-to-zero
   {{:keys [values human-readable-values], remap-to :name} :lib/internal-remap
    :as                                                    col} :- ::column-with-optional-base-type]
  (when (seq values)
    (let [remap-from       (:name col)
          stringified-mask (qp.store/miscellaneous-value [::large-int/column-index-mask])]
      {:col-index       idx
       :from            remap-from
       :to              remap-to
       :value->readable (zipmap (transform-values-for-col col values
                                                          (and stringified-mask (nth stringified-mask idx)))
                                human-readable-values)
       :new-column      (create-remapped-col remap-to
                                             remap-from
                                             (infer-human-readable-values-type human-readable-values))})))

(mu/defn- make-row-map-fn :- [:maybe fn?]
  "Return a function that will add internally-remapped values to each row in the results. (If there is no remapping to
  be done, this function returns `nil`.)"
  [dims :- [:maybe [:sequential ::internal-remapping-info]]]
  (when (seq dims)
    (let [f (apply juxt (for [{:keys [col-index value->readable]} dims]
                          (fn [row]
                            (value->readable (nth row col-index)))))]
      (fn [row]
        (into (vec row) (f row))))))

(mu/defn- internal-columns-info :- ::internal-columns-info
  "Info about the internal-only columns we add to the query."
  [cols :- [:maybe [:sequential ::column-with-optional-base-type]]]
  ;; hydrate Dimensions and FieldValues for all of the columns in the results, then make a map of dimension info for
  ;; each one that is `internal` type
  (let [internal-only-dims (keep-indexed col->dim-map cols)]
    {:internal-only-dims internal-only-dims
     ;; Get the entries we're going to add to `:cols` for each of the remapped values we add
     :internal-only-cols (map :new-column internal-only-dims)}))

(mu/defn- add-remapped-to-and-from-metadata
  "Add remapping info `:remapped_from` and `:remapped_to` to each existing column in the results metadata, and add
  entries for each newly added column to the end of `:cols`."
  [metadata                                             :- [:map
                                                            [:cols [:maybe [:sequential :map]]]]
   remapping-dimensions                                 :- [:maybe [:sequential ::external-remapping]]
   {:keys [internal-only-cols], :as internal-cols-info} :- [:maybe ::internal-columns-info]]
  (update metadata :cols (fn [cols]
                           (-> cols
                               (add-remapping-info remapping-dimensions internal-cols-info)
                               (concat internal-only-cols)))))

(mu/defn- remap-results-xform
  "Munges results for remapping after the query has been executed. For internal remappings, a new column needs to be
  added and each row flowing through needs to include the remapped data for the new column. For external remappings
  the column information needs to be updated with what it's being remapped from and the user specified name for the
  remapped column."
  [{:keys [internal-only-dims]} :- ::internal-columns-info rf]
  (if-let [remap-fn (make-row-map-fn internal-only-dims)]
    ((map remap-fn) rf)
    rf))

(mu/defn remap-results :- ::qp.schema/rff
  "Post-processing middleware. Handles `::external-remaps` added by [[add-remapped-columns-middleware]]; transforms
  results and adds additional metadata based on these remaps, as well as internal (human-readable values) remaps."
  [{::keys [external-remaps], {:keys [disable-remaps?]} :middleware, :as _query} :- :map
   rff                                                                           :- ::qp.schema/rff]
  (if disable-remaps?
    rff
    (fn remap-results-rff* [metadata]
      (let [mlv2-cols          (map
                                #(lib.metadata.jvm/instance->metadata % :metadata/column)
                                (:cols metadata))
            internal-cols-info (internal-columns-info mlv2-cols)
            metadata           (add-remapped-to-and-from-metadata metadata external-remaps internal-cols-info)]
        (remap-results-xform internal-cols-info (rff metadata))))))
