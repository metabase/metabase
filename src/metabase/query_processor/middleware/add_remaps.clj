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

  See also [[metabase.parameters.chain-filter]] for another explanation of remapping."
  (:refer-clojure :exclude [mapv select-keys some empty? not-empty get-in])
  (:require
   [clojure.data :as data]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.middleware.large-int :as large-int]
   [metabase.query-processor.schema :as qp.schema]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv select-keys some empty? not-empty get-in]]))

(mr/def ::simplified-ref
  [:tuple
   [:enum :field :expression :aggregation]
   [:and
    :map
    [:fn
     {:error/message "options map without namespaced keys and base-type/effective-type"}
     (complement (some-fn :base-type :effective-type :lib/uuid))]]
   [:or
    ::lib.schema.id/field
    :string]])

;;; TODO (Cam 9/16/25) -- use [[metabase.lib.schema.util/mbql-clause-distinct-key]] for this
(mu/defn- simplify-ref-options :- ::simplified-ref
  [a-ref :- ::lib.schema.ref/ref]
  (lib/update-options a-ref (fn [opts]
                              (-> opts
                                  (->> (m/filter-keys simple-keyword?))
                                  (dissoc :base-type :effective-type)))))

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

;;; TODO (Cam 7/25/25) -- this seems over-complicated, can't we just
;;; use [[metabase.lib.metadata.calculation/returned-columns]] with `{:include-remaps? true}` to calculate this stuff?

(mu/defn- field-id->remapping-dimension :- [:maybe ::external-remapping]
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   field-id              :- ::lib.schema.id/field]
  (let [col (lib.metadata/field metadata-providerable field-id)]
    (when-let [{remap-id :id, remap-name :name, remap-field-id :field-id} (:lib/external-remap col)]
      (when-let [fk-target-field-id (:fk-target-field-id col)]
        (when-let [fk-field (lib.metadata/field metadata-providerable fk-target-field-id)]
          (when (not (contains? #{:sensitive :retired} (:visibility-type fk-field)))
            (when-let [remap-field (lib.metadata/field metadata-providerable remap-field-id)]
              (when (not (contains? #{:sensitive :retired} (:visibility-type remap-field)))
                {:id                        remap-id
                 :name                      remap-name
                 :field-id                  (:id col)
                 :field-name                (:name col)
                 :human-readable-field-id   remap-field-id
                 :human-readable-field-name (:name remap-field)}))))))))

(mr/def ::remap-info
  [:and
   [:map
    [:original-field-clause :mbql.clause/field]
    [:new-field-clause      [:and
                             :mbql.clause/field
                             [:tuple
                              [:= :field]
                              [:map
                               [::new-field-dimension-id ::lib.schema.id/dimension]]
                              :any]]]
    [:dimension             ::external-remapping]]
   [:fn
    {:error/message "the new field clause should have the same join alias as the original field clause"}
    (fn [{:keys [original-field-clause new-field-clause]}]
      (= (lib/current-join-alias original-field-clause)
         (lib/current-join-alias new-field-clause)))]])

(mu/defn- remap-column-infos :- [:maybe [:sequential {:min 1} ::remap-info]]
  "Return tuples of `:field-id` clauses, the new remapped column `:fk->` clauses that the Field should be remapped to
  and the Dimension that suggested the remapping, which is used later in this middleware for post-processing. Order is
  important here, because the results are added to the `:fields` column in order. (TODO - why is it important, if they
  get hidden when displayed anyway?)"
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path]
  ;; Reconstruct how we uniquify names in [[metabase.query-processor.middleware.annotate]]
  ;;
  ;; TODO (Cam 7/23/25) -- this seems sorta busted, we should probably be using `:lib/desired-column-alias` here
  ;; instead.
  (let [name-generator (lib/unique-name-generator)
        unique-name    (fn [field-id]
                         (assert (pos-int? field-id) (str "Invalid Field ID: " (pr-str field-id)))
                         (let [field (lib.metadata/field query field-id)]
                           (name-generator (:name field))))]
    (not-empty
     (into []
           (comp
            ;; DON'T remap fields added by implicit joins. DO remap fields added by explicit joins.
            (remove :fk-field-id)
            (keep (fn [{:keys [id], :as col}]
                    (when-let [dimension (when (pos-int? id)
                                           (field-id->remapping-dimension query id))]
                      (let [original-ref (lib/ref col)]
                        {:original-field-clause original-ref
                         :new-field-clause      [:field
                                                 (merge
                                                  {:lib/uuid                (str (random-uuid))
                                                   :source-field            id
                                                   ::new-field-dimension-id (u/the-id dimension)}
                                                  (when-let [join-alias (:metabase.lib.join/join-alias col)]
                                                    {:join-alias join-alias}))
                                                 (u/the-id (:human-readable-field-id dimension))]
                         :dimension             (assoc dimension
                                                       :field-name                (-> dimension :field-id unique-name)
                                                       :human-readable-field-name (-> dimension :human-readable-field-id unique-name))})))))
           (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)))))

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
   [:remaps [:maybe [:and
                     [:sequential ::external-remapping]
                     [:fn
                      {:error/message "empty or distinct"}
                      (fn [remappings]
                        (or (empty? remappings)
                            (apply distinct? remappings)))]]]]
   [:query  ::lib.schema/query]])

;; PERF: There's a ton of re-processing of the same fields lists building little indexes, I think that can be consolidated
;; into a more pipelined thing. Not sure how much it buys us, but this is a seriously slow middleware with wide tables.
(mu/defn- add-fk-remaps-to-fields :- [:maybe ::lib.schema/fields]
  [infos  :- [:maybe [:sequential ::remap-info]]
   fields :- [:maybe ::lib.schema/fields]]
  (when (seq fields)
    (let [existing-fields (add-fk-remaps-rewrite-existing-fields infos fields)]
      (into []
            (comp cat
                  (m/distinct-by simplify-ref-options))
            [existing-fields
             (map :new-field-clause infos)]))))

(mu/defn- add-fk-remaps-to-stage :- ::lib.schema/stage
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   {:keys [fields order-by breakout], :as stage} :- ::lib.schema/stage]
  (let [previous-stage-remaps (when-let [previous-path (lib.walk/previous-path path)]
                                (::remaps (get-in query previous-path)))]
    ;; fetch remapping column pairs if any exist...
    (if-let [infos (remap-column-infos query path)]
      ;; if they do, update `:fields`, `:order-by` and `:breakout` clauses accordingly and add to the query
      (let [new-fields         (add-fk-remaps-to-fields infos fields)
            ;; make a map of field-id-clause -> fk-clause from the tuples
            original->remapped (into {}
                                     (map (fn [{:keys [original-field-clause new-field-clause]}]
                                            [(simplify-ref-options original-field-clause) new-field-clause]))
                                     infos)
            ;; PERF: More indexing on the same stuff! This really needs to be poured into a common context.
            new-breakout       (add-fk-remaps-rewrite-breakout original->remapped breakout)
            new-order-by       (add-fk-remaps-rewrite-order-by original->remapped order-by)
            remaps             (into []
                                     (comp cat
                                           (distinct))
                                     [previous-stage-remaps (map :dimension infos)])]
        (cond-> stage
          (seq fields)   (assoc :fields new-fields)
          (seq order-by) (assoc :order-by new-order-by)
          (seq breakout) (assoc :breakout new-breakout)
          (seq remaps)   (assoc ::remaps remaps)))
      ;; otherwise return query as-is
      (cond-> stage
        ;; PERF: This is an edit to the query, busting the caching unnecessarily when there's nothing to remap.
        (seq previous-stage-remaps) (assoc ::remaps previous-stage-remaps)))))

(mu/defn- add-fk-remaps-to-join :- [:maybe ::lib.schema.join/join]
  "Update Join `:fields` to add entries for remapped columns. Update the join's last stage "
  [original-query              :- ::lib.schema/query
   updated-query               :- ::lib.schema/query
   path                        :- ::lib.walk/path
   {:keys [fields], :as join}  :- ::lib.schema.join/join]
  (when (and (sequential? fields)       ; `:fields :all` should have already been resolved by this point.
             (seq fields))
    (let [original-join-field-ids               (into #{}
                                                      (keep :id)
                                                      (lib.walk/apply-f-for-stage-at-path
                                                       lib/join-fields-to-add-to-parent-stage
                                                       original-query path join {:include-remaps? false}))
          original-join-fields-includes-source? (fn [remap-info]
                                                  (some (fn [path]
                                                          (contains? original-join-field-ids (get-in remap-info path)))
                                                        [[:dimension :field-id]
                                                         ;; (not sure this is really something we want to support,
                                                         ;; but [[metabase.query-processor.remapping-test/remapped-columns-in-joined-source-queries-test]]
                                                         ;; alleges that you can include just the remapped column in
                                                         ;; join `:fields` and it's supposed to work)
                                                         [:dimension :human-readable-field-id]]))
          join-last-stage-path                  (into (vec path) [:stages (dec (count (:stages join)))])]
      (if-let [last-stage-infos (->> (remap-column-infos updated-query join-last-stage-path)
                                     (filter original-join-fields-includes-source?)
                                     not-empty)]
        ;; we have remaps to add, add them to join `:fields`
        (let [infos      (for [info last-stage-infos]
                           (-> info
                               (update :original-field-clause lib/with-join-alias (:alias join))
                               (update :new-field-clause      lib/with-join-alias (:alias join))))
              new-fields (into
                          []
                          (m/distinct-by simplify-ref-options)
                          (add-fk-remaps-to-fields infos fields))]
          (assoc join :fields new-fields))
        ;; there are no remaps to add, discard any changes that happen inside of the join (such as adding additional
        ;; joins to power remaps that we're not using)
        (get-in original-query path)))))

(mu/defn- add-fk-remaps :- ::query-and-remaps
  "Add any Fields needed for `:external` remappings to the `:fields` clause of the query, and update `:order-by` and
  `breakout` clauses as needed. Returns a map with `:query` (the updated query) and `:remaps` (a sequence
  of [[:sequential ::external-remapping]] information maps)."
  [original-query :- ::lib.schema/query]
  (let [query' (lib.walk/walk original-query
                              (fn [query path-type path stage-or-join]
                                (case path-type
                                  :lib.walk/stage (add-fk-remaps-to-stage query path stage-or-join)
                                  :lib.walk/join  (add-fk-remaps-to-join original-query query path stage-or-join))))
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
    (let [{:keys [remaps query]} (add-fk-remaps query)
          returned-ids           (into #{} (keep :id) (lib/returned-columns query))
          ;; Only retain those remappings which actually apply to returned columns.
          ;; Otherwise, if an FK has an external remapping (say, Orders.PRODUCT_ID -> Product.TITLE) and we implicitly
          ;; join `Product.TITLE` directly, we actually don't want to mark that column as :remapped_from anything -
          ;; it wasn't remapped, it was explicitly referenced. So if the FK doesn't appear as a returned column, any
          ;; remaps we might have inherited from earlier stages etc. don't apply. See #65726
          remaps                 (into [] (comp (filter (comp returned-ids :field-id))
                                                ;; Convert the remappings to plain maps rather than record types.
                                                (map #(into {} %)))
                                       remaps)]
      (cond-> query
        (seq remaps) (assoc ::external-remaps remaps)))))

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
    from-name         :field-name
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

(mu/defn- create-remapped-col
  [col-name      :- :string
   remapped-from :- :string
   base-type     :- ::lib.schema.common/base-type]
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
          ;; existing usage -- don't use going forward
          stringified-mask #_{:clj-kondo/ignore [:deprecated-var]} (qp.store/miscellaneous-value [::large-int/column-index-mask])]
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
                                #(lib-be/instance->metadata % :metadata/column)
                                (:cols metadata))
            internal-cols-info (internal-columns-info mlv2-cols)
            metadata           (add-remapped-to-and-from-metadata metadata external-remaps internal-cols-info)]
        (remap-results-xform internal-cols-info (rff metadata))))))

(defn disable-remaps
  "Sets the value of the disable-remaps? option in this query."
  [query]
  (assoc-in query [:middleware :disable-remaps?] true))
