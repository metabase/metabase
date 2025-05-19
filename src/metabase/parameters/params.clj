(ns metabase.parameters.params
  "Utility functions for dealing with parameters for Dashboards and Cards.

  Parameter are objects that exists on Dashboard/Card. In FE terms, we call it \"Widget\".
  The values of a parameter is provided so the Widget can show a list of options to the user.


  There are 3 mains ways to provide values to a parameter:
  - chain-filter: see [metabase.parameters.chain-filter]
  - field-values: see [metabase.parameters.field-values]
  - custom-values: see [metabase.parameters.custom-values]"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn assert-valid-parameters
  "Receive a Paremeterized Object and check if its parameters is valid."
  [{:keys [parameters]}]
  (let [schema [:maybe [:sequential ms/Parameter]]]
    (when-not (mr/validate schema parameters)
      (throw (ex-info ":parameters must be a sequence of maps with :id and :type keys"
                      {:parameters parameters
                       :errors     (:errors (mr/explain schema parameters))})))))

(defn assert-valid-parameter-mappings
  "Receive a Paremeterized Object and check if its parameters is valid."
  [{:keys [parameter_mappings]}]
  (let [schema [:maybe [:sequential ms/ParameterMapping]]]
    (when-not (mr/validate schema parameter_mappings)
      (throw (ex-info ":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
                      {:parameter_mappings parameter_mappings
                       :errors             (:errors (mr/explain schema parameter_mappings))})))))

(def ^:dynamic *ignore-current-user-perms-and-return-all-field-values*
  "Whether to ignore permissions for the current User and return *all* FieldValues for the Fields being parameterized by
  Cards and Dashboards. This determines how `:param_values` gets hydrated for Card and Dashboard. Normally, this is
  `false`, but the public and embed versions of the API endpoints can bind this to `true` to bypass normal perms
  checks (since there is no current User) and get *all* values."
  false)

(defn- template-tag->field-form
  "Fetch the `:field` clause from `dashcard` referenced by `template-tag`.

    (template-tag->field-form [:template-tag :company] some-dashcard) ; -> [:field 100 nil]"
  [[_ tag] card]
  (get-in card [:dataset_query :native :template-tags (u/qualified-name tag) :dimension]))

(mu/defn param-target->field-clause :- [:maybe mbql.s/Field]
  "Parse a Card parameter `target` form, which looks something like `[:dimension [:field-id 100]]`, and return the Field
  ID it references (if any)."
  [target card]
  (let [target (mbql.normalize/normalize target)]
    (when (mbql.u/is-clause? :dimension target)
      (let [[_ dimension] target
            field-form    (if (mbql.u/is-clause? :template-tag dimension)
                            (template-tag->field-form dimension card)
                            dimension)]
        ;; Being extra safe here since we've got many reports on this cause loading dashboard to fail
        ;; for unknown reasons. See #8917
        (if field-form
          (try
            (mbql.u/unwrap-field-or-expression-clause field-form)
            (catch Exception e
              (log/error e "Failed unwrap field form" field-form)))
          (log/error "Could not find matching field clause for target:" target))))))

(defn- pk-fields
  "Return the `fields` that are PK Fields."
  [fields]
  (filter #(isa? (:semantic_type %) :type/PK) fields))

(def ^:private Field:params-columns-only
  "Form for use in Toucan `t2/select` expressions (as a drop-in replacement for using `Field`) that returns Fields with
  only the columns that are appropriate for returning in public/embedded API endpoints, which make heavy use of the
  functions in this namespace. Use `conj` to add additional Fields beyond the ones already here. Use `rest` to get
  just the column identifiers, perhaps for use with something like `select-keys`. Clutch!

    (t2/select Field:params-columns-only)"
  [:model/Field :id :table_id :display_name :base_type :name :semantic_type :has_field_values :fk_target_field_id])

(defn- fields->table-id->name-field
  "Given a sequence of `fields,` return a map of Table ID -> to a `:type/Name` Field in that Table, if one exists. In
  cases where more than one name Field exists for a Table, this just adds the first one it finds."
  [fields]
  (when-let [table-ids (seq (map :table_id fields))]
    (m/index-by :table_id (-> (t2/select Field:params-columns-only
                                         :table_id      [:in table-ids]
                                         :semantic_type (mdb.query/isa :type/Name))
                              ;; run [[metabase.lib.field/infer-has-field-values]] on these Fields so their values of
                              ;; `has_field_values` will be consistent with what the FE expects. (e.g. we'll return
                              ;; `:list` instead of `:auto-list`.)
                              (t2/hydrate :has_field_values)))))

(mi/define-batched-hydration-method add-name-field
  :name_field
  "For all `fields` that are `:type/PK` Fields, look for a `:type/Name` Field belonging to the same Table. For each
  Field, if a matching name Field exists, add it under the `:name_field` key. This is so the Fields can be used in
  public/embedded field values search widgets. This only includes the information needed to power those widgets, and
  no more."
  [fields]
  (let [table-id->name-field (fields->table-id->name-field (pk-fields fields))]
    (for [field fields]
      ;; add matching `:name_field` if it's a PK
      (assoc field :name_field (when (isa? (:semantic_type field) :type/PK)
                                 (table-id->name-field (:table_id field)))))))

;; We hydrate the `:human_readable_field` for each Dimension using the usual hydration logic, so it contains columns we
;; don't want to return. The two functions below work to remove the unneeded ones.

(defn- remove-dimension-nonpublic-columns
  "Strip nonpublic columns from a `dimension` and from its hydrated human-readable Field."
  [dimension]
  (some-> dimension
          (update :human_readable_field #(select-keys % (rest Field:params-columns-only)))
          ;; these aren't exactly secret but you the frontend doesn't need them either so while we're at it let's go
          ;; ahead and strip them out
          (dissoc :created_at :updated_at)))

(defn- remove-dimensions-nonpublic-columns
  "Strip nonpublic columns from the hydrated human-readable Field in the hydrated Dimensions in `fields`."
  [fields]
  (for [field fields]
    (update field :dimensions (partial map remove-dimension-nonpublic-columns))))

(mu/defn- param-field-ids->fields
  "Get the Fields (as a map of Parameter ID -> Fields) that should be returned for hydrated `:param_fields` for a Card
  or Dashboard. These only contain the minimal amount of information necessary needed to power public or embedded
  parameter widgets."
  [param-id->field-ids :- [:map-of ms/NonBlankString [:set ms/PositiveInt]]]
  (let [field-ids       (into #{} cat (vals param-id->field-ids))
        field-id->field (when (seq field-ids)
                          (m/index-by :id (-> (t2/select Field:params-columns-only :id [:in field-ids])
                                              (t2/hydrate :has_field_values :name_field :target
                                                          [:dimensions :human_readable_field])
                                              remove-dimensions-nonpublic-columns)))]
    (->> param-id->field-ids
         (m/map-vals #(into [] (keep field-id->field) %)))))

(defmulti ^:private ^{:hydrate :param_fields} param-fields
  "Add a `:param_fields` map (Field ID -> Field) for all of the Fields referenced by the parameters of a Card or
  Dashboard. Implementations are below in respective sections."
  {:arglists '([instance])}
  t2/model)

#_{:clj-kondo/ignore [:unused-private-var]}
(mi/define-simple-hydration-method ^:private hydrate-param-fields
  :param_fields
  "Hydration method for `:param_fields`."
  [instance]
  (param-fields instance))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               DASHBOARD-SPECIFIC                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- filterable-columns-for-query
  "Get filterable columns for query."
  [database-id card stage-number]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider database-id)
        ;; Regular questions are used directly. If a model or metric has been used directly in this card, wrap it into
        ;; a query against that model or metric.
        query (lib/query metadata-provider (if (= :question (:type card))
                                             (:dataset_query card)
                                             (lib.metadata/card metadata-provider (:id card))))]
    (-> query
        lib/ensure-filter-stage
        (lib/filterable-columns stage-number))))

(defn- ensure-filterable-columns-for-card
  [ctx
   {database-id   :database_id
    dataset-query :dataset_query
    card-id       :id
    :as           card}
   stage-number]
  (cond-> ctx
    (and (not (get-in ctx [:card-id->filterable-columns card-id stage-number]))
         (seq dataset-query)
         (pos-int? database-id))
    (assoc-in [:card-id->filterable-columns card-id stage-number]
              (filterable-columns-for-query database-id card stage-number))))

(defn- field-id-from-dashcards-filterable-columns
  "Update the `ctx` with `field-id`. This function is supposed to be used on params where target is a name field, in
  reducing step of [[field-id-into-context-rf]], when it is certain that param target is no integer id field."
  [ctx param-dashcard-info stage-number]
  (let [param-id           (get-in param-dashcard-info [:param-mapping :parameter_id])
        param-target       (get-in param-dashcard-info [:param-mapping :target])
        card-id            (get-in param-dashcard-info [:dashcard :card :id])
        filterable-columns (get-in ctx [:card-id->filterable-columns card-id stage-number])
        [_ dimension]      (->> (mbql.normalize/normalize-tokens param-target :ignore-path)
                                (mbql.u/check-clause :dimension))]
    (if-some [field-id (lib.util.match/match-one dimension
                         ;; TODO it's basically a workaround for ignoring non-dimension parameter targets such as SQL variables
                         ;; TODO code is misleading; let's check for :dimension and drop the match call here
                         [:field (field-name :guard string?) _]
                         (->> filterable-columns
                              (lib/find-matching-column (lib/->pMBQL dimension))
                              :id))]
      (-> ctx
          (update :param-id->field-ids #(merge {param-id #{}} %))
          (update-in [:param-id->field-ids param-id] conj field-id))
      ctx)))

(def ^:dynamic *field-id-context*
  "Conext for effective computation of field ids for parameters. Bound in
  the [[metabase.dashboards.api/hydrate-dashboard-details]]. Meant to be used in the [[field-id-into-context-rf]], to
  re-use values of previous `filterable-columns` computations (during the reduction itself and hydration of
  `:param_fields` and `:param_values` at the time of writing)."
  nil)

(def empty-field-id-context
  "Context for effective field id computation. See the [[field-id-into-context-rf]]'s docstring."
  {:card-id->filterable-columns {}
   :param-id->field-ids         {}})

(mu/defn- field-id-into-context-rf
  "Reducing function that generates _field id_ corresponding to `:parameter` of `param-dashcard-info` if possible,
  and returns new _context_ (`ctx`) with the _field id_ added.

  When used in `transduce`:
    - 0-arity ensures re-use of existing [[*field-id-context*]] if available,
    - 1-arity is used to return set of _field ids_ accumulated by transucing process instead of a _context_.

  Then, 2-arity gets the _field id_ either from (1) target, (2) card's `:results_metadata`, or (3) filterable columns.
  If computed, filterable columns are added to the context for re-use either in next reduction steps, or in next call
  to this function by means of [[*field-id-context*]]."
  ([]
   (or
    (some-> *field-id-context* deref)
    empty-field-id-context))
  ([ctx]
   (when (some-> *field-id-context* deref)
     (swap! *field-id-context* update :card-id->filterable-columns
            merge (:card-id->filterable-columns ctx)))
   (:param-id->field-ids ctx))
  ([ctx {:keys [param-mapping param-target-field] :as param-dashcard-info}]
   (if-not param-target-field
     ctx
     (let [card (get-in param-dashcard-info [:dashcard :card])
           param-id (:parameter_id param-mapping)
           stage-number (get-in param-mapping [:target 2 :stage-number] -1)]
       ;; Get the field id from the field-clause if it contains it. This is the common case
       ;; for mbql queries.
       (if-some [field-id (lib.util.match/match-one param-target-field [:field (id :guard integer?) _] id)]
         (update-in ctx [:param-id->field-ids param-id] (fnil conj #{}) field-id)
         ;; In case the card doesn't have the same result_metadata columns as filterable columns (a question that
         ;; aggregates a native query model with a field that was mapped to a db field), we need to load metadata in
         ;; [[ensure-filterable-columns-for-card]] to find the originating field. (#42829)
         (-> ctx
             (ensure-filterable-columns-for-card card stage-number)
             (field-id-from-dashcards-filterable-columns param-dashcard-info stage-number)))))))

(mu/defn dashcards->param-id->field-ids* :- [:map-of ms/NonBlankString [:set ms/PositiveInt]]
  "Return map of parameter ids to mapped field ids."
  [dashcards]
  (letfn [(dashcard->param-dashcard-info [dashcard]
            (for [mapping (:parameter_mappings dashcard)]
              {:dashcard           dashcard
               :param-mapping      mapping
               :param-target-field (param-target->field-clause (:target mapping) (:card dashcard))}))]
    (transduce (mapcat dashcard->param-dashcard-info)
               field-id-into-context-rf
               dashcards)))

(declare card->template-tag-param-id->field-ids)

(mu/defn- dashcards->param-id->field-ids :- [:map-of ms/NonBlankString [:set ms/PositiveInt]]
  "Return a map of Parameter ID to the set of Field IDs referenced by parameters in the Cards on the given `dashcards`,
  or `nil` if none are referenced. `dashcards` must be hydrated with :card."
  [dashcards]
  (transduce (map card->template-tag-param-id->field-ids)
             (completing #(merge-with set/union %1 %2))
             (dashcards->param-id->field-ids* dashcards)
             (map :card dashcards)))

(mu/defn dashcards->param-field-ids :- [:set ms/PositiveInt]
  "Return a set of Field IDs referenced by parameters in Cards in the given `dashcards`, or `nil` if
  none are referenced. `dashcards` must be hydrated with :card."
  [dashcards]
  (into #{} cat (vals (dashcards->param-id->field-ids dashcards))))

(mu/defn dashboard-param->field-ids :- [:set ms/PositiveInt]
  "Return field ids mapped to the parameter. `dashcard` and `card` must be present for each mapping."
  [{:keys [mappings]} :- ms/Parameter]
  (let [param-id->field-ids (transduce (map (fn [mapping]
                                              {:dashcard           (:dashcard mapping)
                                               :param-mapping      mapping
                                               :param-target-field (param-target->field-clause
                                                                    (:target mapping)
                                                                    (get-in mapping [:dashcard :card]))}))
                                       field-id-into-context-rf
                                       mappings)]
    (into #{} cat (vals param-id->field-ids))))

(defn get-linked-field-ids
  "Retrieve a map relating paramater ids to field ids."
  [dashcards]
  (letfn [(targets [params card]
            (into {}
                  (for [param params
                        :let  [clause (param-target->field-clause (:target param)
                                                                  card)
                               ids (lib.util.match/match clause
                                     [:field (id :guard integer?) _]
                                     id)]
                        :when (seq ids)]
                    [(:parameter_id param) (set ids)])))]
    (->> dashcards
         (mapv (fn [{params :parameter_mappings card :card}] (targets params card)))
         (apply merge-with into {}))))

(defmethod param-fields :model/Dashboard [dashboard]
  (-> (t2/hydrate dashboard [:dashcards :card])
      :dashcards
      dashcards->param-id->field-ids
      param-field-ids->fields))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 CARD-SPECIFIC                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- card->template-tag-param-id->field-clauses :- [:map-of
                                                         ::lib.schema.common/non-blank-string
                                                         [:set mbql.s/field]]
  "Return a set of `:field` clauses referenced in template tag parameters in `card`."
  [card]
  (into {} (for [[_ {param-id  :id
                     dimension :dimension}] (get-in card [:dataset_query :native :template-tags])
                 :when                      dimension
                 :let                       [field (mbql.u/unwrap-field-clause dimension)]
                 :when                      field]
             [param-id #{field}])))

(mu/defn- card->template-tag-param-id->field-ids :- [:map-of
                                                     ::lib.schema.common/non-blank-string
                                                     [:set ::lib.schema.id/field]]
  "Return a map of Param IDs to sets of Field IDs referenced by each template tag parameter in this `card`.

  Mostly used for determining Fields referenced by Cards for purposes other than processing queries. Filters out
  `:field` clauses which use names."
  [card]
  (-> card
      card->template-tag-param-id->field-clauses
      (update-vals #(set (lib.util.match/match (seq %)
                           [:field (id :guard integer?) _]
                           id)))))

(defmethod param-fields :model/Card [card]
  (-> card card->template-tag-param-id->field-ids param-field-ids->fields))

(mu/defn card->template-tag-field-ids :- [:maybe [:set ::lib.schema.id/field]]
  "Returns a set of all Field IDs referenced by template tags on this card.

  To get these IDs broken out by the Param ID that references them, use [[card->template-tag-param-id->field-ids]]."
  [card]
  (not-empty (into #{} cat (vals (card->template-tag-param-id->field-ids card)))))
