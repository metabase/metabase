(ns metabase.parameters.custom-values
  "Custom values for Parameters.

  A parameter with custom values will need to define a source:
  - static-list: the values is pre-defined and stored inside parameter's config
  - card: the values is a column from a saved question
  "
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.models.interface :as mi]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- source=static-list --------------------------------------------------

(mu/defn- normalize-query :- :string
  "Normalize a `query` to lower-case."
  [query :- :string]
  (u/lower-case-en (str/trim query)))

(defn- query-matches
  "Filters for values that match `query`.

  Values could have 2 shapes
  - [[value1], [value2]]
  - [[value2, label2], [value2, label2]] - we search using label in this case"
  [query values]
  (let [normalized-query (normalize-query query)]
    (filter (fn [v] (str/includes? (normalize-query (if (= (count v) 1)
                                                      (first v)
                                                      (second v)))
                                   normalized-query)) values)))

(defn- static-list-values
  [{values-source-options :values_source_config :as _param} query]
  (when-let [values (:values values-source-options)]
    (let [wrapped-values (map (fn [v] (if-not (sequential? v) [v] v)) values)]
      {:values          (if query
                          (query-matches query wrapped-values)
                          wrapped-values)
       :has_more_values false})))

;;; ---------------------------------------------------- source=card ------------------------------------------------------

(def ^:dynamic *max-rows*
  "Maximum number of rows returned when running a card.
  It's 1000 because it matches with the limit for chain-filter.
  Maybe we should lower it for the sake of displaying a parameter dropdown."
  1000)

(mr/def ::values-from-card-query.options
  [:map
   ;; despite this being called "query string" it can actually be any value because it just gets used in an `:=`
   ;; filter clause. :eyeroll:
   [:query-string {:optional true} :any]])

(mu/defn- values-from-card-query :- [:maybe ::lib.schema/query]
  [{query :dataset_query, :keys [id], :as _card} :- [:and
                                                     :metabase.queries.schema/card
                                                     [:map
                                                      [:id ::lib.schema.id/card]]]
   field-ref                        :- [:or :mbql.clause/field :mbql.clause/expression]
   {:keys [query-string] :as _opts} :- [:maybe ::values-from-card-query.options]]
  (when (seq query)
    ;; start a new query using this Card as a starting point
    (let [query (lib/query query (lib.metadata/card query id))]
      (when-let [visible-columns (or (not-empty (lib/visible-columns query))
                                     (log/warnf "Cannot get values from Card %d: Card query has no visible columns"
                                                id))]
        (when-let [value-column (or (lib/find-matching-column query -1 field-ref visible-columns)
                                    (log/warnf "Cannot get values from Card %d: failed to find column for ref %s\nFound: %s"
                                               id
                                               (pr-str field-ref)
                                               (pr-str (map (some-fn :lib/source-column-alias :name) visible-columns))))]
          (let [textual?     (lib.types.isa/string? value-column)
                nonempty     ((if textual? lib/not-empty lib/not-null) value-column)
                query-filter (when query-string
                               (if textual?
                                 (lib/contains (lib/lower value-column) (u/lower-case-en query-string))
                                 (lib/= value-column query-string)))]
            (-> query
                (lib/limit *max-rows*)
                (lib/filter nonempty)
                (cond-> #_query query-filter (lib/filter query-filter))
                (lib/breakout value-column)
                ;; TODO(Braden, 07/04/2025): This should probably become a lib helper? I suspect this isn't the only
                ;; "internal" query in the BE.
                (assoc-in [:middleware :disable-remaps?] true))))))))

(mu/defn values-from-card
  "Get distinct values of a field from a card.

  (values-from-card 1 [:field \"name\" nil] \"red\")
  ;; will execute a mbql that looks like
  ;; {:source-card card-id
  ;;  :fields      [value-field]
  ;;  :breakout    [value-field]
  ;;  :filters     [[:contains {} [:lower {} value-field] \"red\"]]
  ;;  :limit       *max-rows*}
  =>
  {:values          [[\"Red Medicine\"]]
  :has_more_values false}
  "
  ([card field-ref]
   (values-from-card card field-ref nil))

  ([card      :- :metabase.queries.schema/card
    field-ref :- [:or :mbql.clause/field :mbql.clause/expression]
    opts      :- [:maybe ::values-from-card-query.options]]
   (let [mbql-query   (values-from-card-query card field-ref opts)
         result       (some-> mbql-query qp/process-query)
         values       (get-in result [:data :rows])]
     {:values         values
      ;; If the row_count returned = the limit we specified, then it's probably has more than that.
      ;; If the query has its own limit smaller than *max-rows*, then there's no more values.
      :has_more_values (= (:row_count result) *max-rows*)})))

(mu/defn card-values
  "Given a param and query returns the values."
  [{config :values_source_config :as _param} :- ::parameters.schema/parameter
   query-string                              :- [:maybe ms/NonBlankString]]
  (let [card-id (:card_id config)
        card    (t2/select-one :model/Card :id card-id)]
    (values-from-card card (lib/->pMBQL (:value_field config)) {:query-string query-string})))

(defn- can-get-card-values?
  [card value-field]
  (boolean
   (and (not (:archived card))
        ;; existing usage -- do not use this in new code
        #_{:clj-kondo/ignore [:deprecated-var]}
        (some? (qp.util/field->field-info value-field (:result_metadata card))))))

;;; --------------------------------------------- Putting it together ----------------------------------------------

(mu/defn parameter->values :- ms/FieldValuesResult
  "Given a parameter with a custom-values source, return the values.

  `default-case-thunk` is a 0-arity function that returns values list when:
  - :values_source_type = card but the card is archived or the card no longer contains the value-field.
  - :values_source_type = nil."
  [parameter          :- ::parameters.schema/parameter
   query-string       :- [:maybe ms/NonBlankString]
   default-case-thunk :- [:=> [:cat :any] ms/FieldValuesResult]]
  (case (:values_source_type parameter)
    :static-list (static-list-values parameter query-string)
    :card        (let [card (t2/select-one :model/Card :id (get-in parameter [:values_source_config :card_id]))]
                   (when-not (mi/can-read? card)
                     (throw (ex-info "You don't have permissions to do that." {:status-code 403})))
                   (if (can-get-card-values? card (get-in parameter [:values_source_config :value_field]))
                     (card-values parameter query-string)
                     (default-case-thunk)))
    nil          (default-case-thunk)
    (throw (ex-info (tru "Invalid parameter source {0}" (:values_source_type parameter))
                    {:status-code 400
                     :parameter   parameter}))))

(defn pk-of-fk-pk-field-ids
  "Check if the collection `field-ids` contains the IDs of FK fields pointing to the same PK and
  optionally the ID of that PK field and nothing else.
  Return the PK field ID if `field-ids` is such a group."
  [field-ids]
  (when (and (seq field-ids) (every? pos-int? field-ids))
    (let [field-id-set (set field-ids)
          fields (t2/select [:model/Field :id :fk_target_field_id :semantic_type] :id [:in field-id-set])]
      ;; when every field could be found and all are keys
      (when (and (= (count field-id-set) (count fields))
                 (every? (fn [{:keys [semantic_type fk_target_field_id]}]
                           (or (isa? semantic_type :type/PK)
                               (and (isa? semantic_type :type/FK)
                                    fk_target_field_id)))
                         fields))
        ;; pk->fks maps PK field IDs to FK field IDs pointing to them,
        ;; plus nil to the field IDs in `field-ids` that are not FKs
        (let [pk->fks (-> fields
                          (->> (group-by :fk_target_field_id))
                          (update-vals #(into #{} (map :id) %)))]
          (case (count pk->fks)
            ;; there is a single group so it's either one PK mapped to its FKs, or nil mapped to non-FKs
            1 (-> pk->fks first key)
            ;; two groups can be a match if one group is nil mapped to a singleton set with a PK,
            ;; and the other group is the PK mapped to all the other field IDs in the input
            2 (when-let [pk (first (pk->fks nil))]
                (when (= (into #{pk} (pk->fks pk)) field-id-set)
                  pk))
            ;; more than two groups are always ambiguous, so no match
            nil))))))

(mu/defn parameter-remapped-value
  "Fetch the remapped value for the given `value` of parameter `param` with default values provided by
  the function `default-case-thunk`.

  `default-case-thunk` is a 0-arity function that returns values list when :values_source_type = nil."
  [param              :- ::parameters.schema/parameter
   value
   default-case-thunk :- [:=> [:cat] :any]]
  (case (:values_source_type param)
    :static-list (m/find-first #(and (vector? %) (= (count %) 2) (= (first %) value))
                               (get-in param [:values_source_config :values]))
    :card        nil
    nil          (default-case-thunk)
    (throw (ex-info (tru "Invalid parameter source {0}" (:values_source_type param))
                    {:status-code 400
                     :parameter   param}))))
