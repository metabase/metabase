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
   [malli.error :as me]
   [medley.core :as m]
   [metabase.app-db.core :as app-db]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn assert-valid-parameters
  "Receive a Parameterized Object and check if its parameters is valid."
  [{:keys [parameters]}]
  (let [schema [:maybe ::parameters.schema/parameters]]
    (when-let [error (mr/explain schema parameters)]
      (throw (ex-info (str ":parameters must be a sequence of maps with :id and :type keys; "
                           (pr-str (me/humanize error)))
                      {:parameters parameters
                       :errors     (:errors error)})))))

(defn assert-valid-parameter-mappings
  "Receive a Parameterized Object and check if its parameters is valid."
  [{parameter-mappings :parameter_mappings}]
  (let [schema [:maybe [:sequential ::parameters.schema/parameter-mapping]]]
    (when-not (mr/validate schema parameter-mappings)
      (throw (ex-info ":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
                      {:parameter_mappings parameter-mappings
                       :errors             (:errors (mr/explain schema parameter-mappings))})))))

(def ^:dynamic *ignore-current-user-perms-and-return-all-field-values*
  "Whether to ignore permissions for the current User and return *all* FieldValues for the Fields being parameterized by
  Cards and Dashboards. This determines how `:param_values` gets hydrated for Card and Dashboard. Normally, this is
  `false`, but the public and embed versions of the API endpoints can bind this to `true` to bypass normal perms
  checks (since there is no current User) and get *all* values."
  false)

(mu/defn- template-tag-name->field-id :- [:maybe ::lib.schema.id/field]
  "Fetch the `:field` clause from `dashcard` referenced by `template-tag`.

    (template-tag->field-form [:template-tag :company] some-dashcard) ; -> [:field 100 nil]"
  [template-tag-name :- :string
   card              :- :metabase.queries.schema/card]
  (or (some-> card
              :dataset_query
              not-empty
              lib-be/normalize-query
              lib/all-template-tags-map
              (get template-tag-name)
              :dimension
              lib/field-ref-id)
      (do
        (log/warnf "Could not find matching Field ID for target: %s" (pr-str template-tag-name))
        nil)))

(mu/defn param-target->field-id :- [:maybe ::lib.schema.id/field]
  "Parse a Card parameter `target` form, which looks something like `[:dimension [:field-id 100]]`, and return the Field
  ID it references (if any)."
  [target
   ;; TODO (Cam 9/25/25) -- `card` should actually be required but I don't have all day to fix broken tests from
   ;; before I schematized this.
   card   :- [:maybe :metabase.queries.schema/card]]
  (let [target (lib/normalize ::lib.schema.parameter/target target)]
    (or
     (when card
       (when-let [template-tag-name (lib/parameter-target-template-tag-name target)]
         (template-tag-name->field-id template-tag-name card)))
     (lib/parameter-target-field-id target))))

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
                                         :semantic_type (app-db/isa :type/Name)
                                         :active        true)
                              ;; run [[metabase.lib.field/infer-has-field-values]] on these Fields so their values of
                              ;; `has_field_values` will be consistent with what the FE expects. (e.g. we'll return
                              ;; `:list` instead of `:auto-list`.)
                              (t2/hydrate :has_field_values)))))

(methodical/defmethod t2/simple-hydrate [nil :name_field]
  "Not really 100% sure why this is even needed but when we do recursive hydration of `[:target :name_field]` it tries
  to hydrate for `nil`... I guess we have to explicitly tell it to do nothing."
  [_model _k _nil]
  nil)

(methodical/defmethod t2/batched-hydrate [:model/Field :name_field]
  "For all `fields` that are `:type/PK` Fields, look for a `:type/Name` Field belonging to the same Table. For each
  Field, if a matching name Field exists, add it under the `:name_field` key. This is so the Fields can be used in
  public/embedded field values search widgets. This only includes the information needed to power those widgets, and
  no more."
  [_model _k fields]
  (let [table-id->name-field (fields->table-id->name-field (pk-fields fields))]
    (for [field fields]
      ;; add matching `:name_field` if it's a PK
      (when field
        (assoc field :name_field (when (isa? (:semantic_type field) :type/PK)
                                   (table-id->name-field (:table_id field))))))))

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
  [param-id->field-ids :- [:maybe [:map-of ::lib.schema.parameter/id [:set ::lib.schema.id/field]]]]
  (let [field-ids       (into #{} cat (vals param-id->field-ids))
        field-id->field (when (seq field-ids)
                          (m/index-by :id (-> (t2/select Field:params-columns-only :id [:in field-ids])
                                              (t2/hydrate :has_field_values :name_field [:target :name_field]
                                                          [:dimensions :human_readable_field])
                                              remove-dimensions-nonpublic-columns)))]
    (->> param-id->field-ids
         (m/map-vals #(into [] (keep field-id->field) %)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               DASHBOARD-SPECIFIC                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- filterable-columns-for-query
  "Get filterable columns for query."
  [database-id card stage-number]
  (let [metadata-provider (lib-be/application-database-metadata-provider database-id)
        ;; Regular questions are used directly. If a model or metric has been used directly in this card, wrap it into
        ;; a query against that model or metric.
        query (lib/query metadata-provider (if (= :question (:type card))
                                             (:dataset_query card)
                                             (lib.metadata/card metadata-provider (:id card))))
        ;; for backward compatibility, append a filter stage only with explicit stage numbers
        query (cond-> query (>= stage-number 0) lib/ensure-filter-stage)]
    (when (and (>= stage-number -1) (< stage-number (lib/stage-count query)))
      (lib/filterable-columns query stage-number))))

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
              (or (filterable-columns-for-query database-id card stage-number) []))))

(defn- field-id-from-dashcards-filterable-columns
  "Update the `ctx` with `field-id`. This function is supposed to be used on params where target is a name field, in
  reducing step of [[field-id-into-context-rf]], when it is certain that param target is no integer id field."
  [ctx param-dashcard-info stage-number]
  (let [param-id           (get-in param-dashcard-info [:param-mapping :parameter_id])
        param-target       (get-in param-dashcard-info [:param-mapping :target])
        card-id            (or (get-in param-dashcard-info [:param-mapping :card_id])
                               (get-in param-dashcard-info [:dashcard :card :id]))
        filterable-columns (get-in ctx [:card-id->filterable-columns card-id stage-number])
        param-target       (lib/normalize ::lib.schema.parameter/target param-target)]
    (if-some [field-id (when (seq filterable-columns)
                         (when (lib/parameter-target-field-name param-target)
                           ;; TODO it's basically a workaround for ignoring non-dimension parameter targets such as SQL variables
                           ;; TODO code is misleading; let's check for :dimension and drop the match call here
                           (->> filterable-columns
                                (lib/find-matching-column (lib/parameter-target-field-ref param-target))
                                :id)))]
      (-> ctx
          (update :param-id->field-ids #(merge {param-id #{}} %))
          (update-in [:param-id->field-ids param-id] conj field-id))
      ctx)))

(def ^:dynamic *field-id-context*
  "Context for effective computation of field ids for parameters. Bound in
  the [[metabase.dashboards-rest.api/hydrate-dashboard-details]]. Meant to be used in the [[field-id-into-context-rf]], to
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
  ([ctx {:keys [param-mapping param-target-field-id] :as param-dashcard-info}]
   (let [card-id (:card_id param-mapping)
         card (if card-id
                (m/find-first #(= (:id %) card-id)
                              (cons (get-in param-dashcard-info [:dashcard :card])
                                    (get-in param-dashcard-info [:dashcard :series])))
                (get-in param-dashcard-info [:dashcard :card]))
         param-id (:parameter_id param-mapping)
         stage-number (get-in param-mapping [:target 2 :stage-number] -1)]
     ;; Get the field id from the field-clause if it contains it. This is the common case
     ;; for mbql queries.
     (if param-target-field-id
       (update-in ctx [:param-id->field-ids param-id] (fnil conj #{}) param-target-field-id)
       ;; In case the card doesn't have the same result_metadata columns as filterable columns (a question that
       ;; aggregates a native query model with a field that was mapped to a db field), we need to load metadata in
       ;; [[ensure-filterable-columns-for-card]] to find the originating field. (#42829)
       (-> ctx
           (ensure-filterable-columns-for-card card stage-number)
           (field-id-from-dashcards-filterable-columns param-dashcard-info stage-number))))))

(defn- find-card-for-mapping
  "Find the card that a parameter mapping refers to. Looks up the card by `:card_id` from both
  the primary card and series cards on the dashcard, falling back to the primary card."
  [dashcard mapping]
  (let [card (if-let [card-id (:card_id mapping)]
               (or (m/find-first #(= (:id %) card-id)
                                 (cons (:card dashcard) (:series dashcard)))
                   (:card dashcard))
               (:card dashcard))]
    (cond-> card
      (string? (:type card))          (update :type keyword)
      (seq (:dataset_query card))     (update :dataset_query lib-be/normalize-query))))

(mu/defn dashcards->param-id->field-ids* :- [:map-of ::lib.schema.parameter/id [:set ::lib.schema.id/field]]
  "Return map of parameter ids to mapped field ids."
  [dashcards]
  (letfn [(dashcard->param-dashcard-info [dashcard]
            (for [mapping (:parameter_mappings dashcard)]
              (let [card (find-card-for-mapping dashcard mapping)]
                {:dashcard              dashcard
                 :param-mapping         mapping
                 :param-target-field-id (when (:target mapping)
                                          (param-target->field-id (:target mapping) card))})))]
    (transduce (mapcat dashcard->param-dashcard-info)
               field-id-into-context-rf
               dashcards)))

(declare card->template-tag-id->field-ids)

(mu/defn- dashcards->param-id->field-ids :- [:map-of ::lib.schema.parameter/id [:set ::lib.schema.id/field]]
  "Return a map of Parameter ID to the set of Field IDs referenced by parameters in the Cards on the given `dashcards`,
  or `nil` if none are referenced. `dashcards` must be hydrated with :card."
  [dashcards]
  (transduce (comp (map :card)
                   (map card->template-tag-id->field-ids))
             (partial merge-with set/union)
             (dashcards->param-id->field-ids* dashcards)
             dashcards))

(mu/defn dashcards->param-field-ids :- [:set ::lib.schema.id/field]
  "Return a set of Field IDs referenced by parameters in Cards in the given `dashcards`, or `nil` if
  none are referenced. `dashcards` must be hydrated with :card."
  [dashcards]
  (into #{} cat (vals (dashcards->param-id->field-ids dashcards))))

(mu/defn dashboard-param->field-ids :- [:set ::lib.schema.id/field]
  "Return field ids mapped to the parameter. `dashcard` and `card` must be present for each mapping."
  [{:keys [mappings]} :- ::parameters.schema/parameter]
  (let [param-id->field-ids (transduce (map (fn [mapping]
                                              (let [card (find-card-for-mapping (:dashcard mapping) mapping)]
                                                {:dashcard              (:dashcard mapping)
                                                 :param-mapping         mapping
                                                 :param-target-field-id (param-target->field-id
                                                                         (:target mapping)
                                                                         card)})))
                                       field-id-into-context-rf
                                       mappings)]
    (into #{} cat (vals param-id->field-ids))))

(defn get-linked-field-ids
  "Retrieve a map relating parameter ids to field ids."
  [dashcards]
  (letfn [(targets [{params :parameter_mappings card :card, :as _dashcard}]
            (into {}
                  (for [param params
                        :let  [target (:target param)]
                        :when target
                        :let [id (param-target->field-id target card)]
                        :when id]
                    [(:parameter_id param) #{id}])))]
    (->> dashcards
         (map targets)
         (apply merge-with into {}))))

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :param_fields]
  "Add a `:param_fields` map (Field ID -> Field) for all of the Fields referenced by the parameters of a Dashboard."
  [_model k dashboards]
  (mapv (fn [dashboard]
          (let [param-fields (-> dashboard
                                 :dashcards
                                 dashcards->param-id->field-ids
                                 param-field-ids->fields)]
            (assoc dashboard k param-fields)))
        (t2/hydrate dashboards [:dashcards :card :series])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 CARD-SPECIFIC                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- card->template-tag-id->field-ids :- [:maybe [:map-of
                                                       ::lib.schema.template-tag/id
                                                       [:set ::lib.schema.id/field]]]
  "Return a map of Param IDs to sets of Field IDs referenced by each template tag parameter in this `card`.

  Mostly used for determining Fields referenced by Cards for purposes other than processing queries. Filters out
  `:field` clauses which use names."
  [card :- [:maybe :map]]
  (some-> card :dataset_query not-empty lib-be/normalize-query lib/all-template-tags-id->field-ids))

(methodical/defmethod t2/simple-hydrate [:model/Card :param_fields]
  "Add a `:param_fields` map (Field ID -> Field) for all of the Fields referenced by the parameters of a Card."
  [_model k card]
  (let [param-fields (or (some-> card card->template-tag-id->field-ids param-field-ids->fields)
                         {})]
    (assoc card k param-fields)))

(mu/defn card->template-tag-field-ids :- [:maybe [:set {:min 1} ::lib.schema.id/field]]
  "Returns a set of all Field IDs referenced by template tags on this card.

  To get these IDs broken out by the Param ID that references them, use [[card->template-tag-param-id->field-ids]]."
  [card :- [:maybe :map]]
  (some-> card :dataset_query not-empty lib-be/normalize-query lib/all-template-tag-field-ids not-empty))
