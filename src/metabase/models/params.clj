(ns metabase.models.params
  "Utility functions for dealing with parameters for Dashboards and Cards.

  Parameter are objects that exists on Dashboard/Card. In FE terms, we call it \"Widget\".
  The values of a parameter is provided so the Widget can show a list of options to the user.


  There are 3 mains ways to provide values to a parameter:
  - chain-filter: see [metabase.models.params.chain-filter]
  - field-values: see [metabase.models.params.field-values]
  - custom-values: see [metabase.models.params.custom-values]"
  (:require
   [clojure.set :as set]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.db.util :as mdb.u]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.models.params.field-values :as params.field-values]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn assert-valid-parameters
  "Receive a Paremeterized Object and check if its parameters is valid."
  [{:keys [parameters]}]
  (when-not (mc/validate [:maybe [:sequential ms/Parameter]] parameters)
    (throw (ex-info (tru ":parameters must be a sequence of maps with :id and :type keys")
                    {:parameters parameters}))))

(defn assert-valid-parameter-mappings
  "Receive a Paremeterized Object and check if its parameters is valid."
  [{:keys [parameter_mappings]}]
  (when-not (mc/validate [:maybe [:sequential ms/ParameterMapping]] parameter_mappings)
    (throw (ex-info (tru ":parameter_mappings must be a sequence of maps with :parameter_id and :type keys")
                    {:parameter_mappings parameter_mappings}))))

(mu/defn unwrap-field-clause :- [:maybe mbql.s/field]
  "Unwrap something that contains a `:field` clause, such as a template tag.
  Also handles unwrapped integers for legacy compatibility.

    (unwrap-field-clause [:field 100 nil]) ; -> [:field 100 nil]"
  [field-form]
  (if (integer? field-form)
    [:field field-form nil]
    (mbql.u/match-one field-form :field)))

(mu/defn unwrap-field-or-expression-clause :- mbql.s/Field
  "Unwrap a `:field` clause or expression clause, such as a template tag. Also handles unwrapped integers for
  legacy compatibility."
  [field-or-ref-form]
  (or (unwrap-field-clause field-or-ref-form)
      (mbql.u/match-one field-or-ref-form :expression)))

(defn wrap-field-id-if-needed
  "Wrap a raw Field ID in a `:field` clause if needed."
  [field-id-or-form]
  (cond
    (mbql.u/mbql-clause? field-id-or-form)
    field-id-or-form

    (integer? field-id-or-form)
    [:field field-id-or-form nil]

    :else
    field-id-or-form))

(def ^:dynamic *ignore-current-user-perms-and-return-all-field-values*
  "Whether to ignore permissions for the current User and return *all* FieldValues for the Fields being parameterized by
  Cards and Dashboards. This determines how `:param_values` gets hydrated for Card and Dashboard. Normally, this is
  `false`, but the public and embed versions of the API endpoints can bind this to `true` to bypass normal perms
  checks (since there is no current User) and get *all* values."
  false)

(defn- field-ids->param-field-values-ignoring-current-user
  [param-field-ids]
  (not-empty
   (into {}
         (map (comp (juxt :field_id identity)
                    #(select-keys % [:field_id :human_readable_values :values])
                    field-values/get-or-create-full-field-values!))
         (t2/hydrate (t2/select :model/Field :id [:in (set param-field-ids)]) :values))))

(defn- field-ids->param-field-values
  "Given a collection of `param-field-ids` return a map of FieldValues for the Fields they reference.
  This map is returned by various endpoints as `:param_values`, if `param-field-ids` is empty, return `nil`"
  [param-field-ids]
  (when (seq param-field-ids)
    ((if *ignore-current-user-perms-and-return-all-field-values*
       field-ids->param-field-values-ignoring-current-user
       params.field-values/field-id->field-values-for-current-user) param-field-ids)))

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
           (unwrap-field-or-expression-clause field-form)
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
  ['Field :id :table_id :display_name :base_type :semantic_type :has_field_values])

(defn- fields->table-id->name-field
  "Given a sequence of `fields,` return a map of Table ID -> to a `:type/Name` Field in that Table, if one exists. In
  cases where more than one name Field exists for a Table, this just adds the first one it finds."
  [fields]
  (when-let [table-ids (seq (map :table_id fields))]
    (m/index-by :table_id (-> (t2/select Field:params-columns-only
                                :table_id      [:in table-ids]
                                :semantic_type (mdb.u/isa :type/Name))
                              ;; run `metabase.models.field/infer-has-field-values` on these Fields so their values of
                              ;; `has_field_values` will be consistent with what the FE expects. (e.g. we'll return
                              ;; `list` instead of `auto-list`.)
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


(mu/defn ^:private param-field-ids->fields
  "Get the Fields (as a map of Field ID -> Field) that shoudl be returned for hydrated `:param_fields` for a Card or
  Dashboard. These only contain the minimal amount of information necessary needed to power public or embedded
  parameter widgets."
  [field-ids :- [:maybe [:set ms/PositiveInt]]]
  (when (seq field-ids)
    (m/index-by :id (-> (t2/select Field:params-columns-only :id [:in field-ids])
                        (t2/hydrate :has_field_values :name_field [:dimensions :human_readable_field])
                        remove-dimensions-nonpublic-columns))))


(defmulti ^:private ^{:hydrate :param_values} param-values
  "Add a `:param_values` map (Field ID -> FieldValues) containing FieldValues for the Fields referenced by the
  parameters of a Card or a Dashboard. Implementations are in respective sections below."
  t2/model)

#_{:clj-kondo/ignore [:unused-private-var]}
(mi/define-simple-hydration-method ^:private hydrate-param-values
  :param_values
  "Hydration method for `:param_fields`."
  [instance]
  (param-values instance))

(defmulti ^:private ^{:hydrate :param_fields} param-fields
  "Add a `:param_fields` map (Field ID -> Field) for all of the Fields referenced by the parameters of a Card or
  Dashboard. Implementations are below in respective sections."
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

(mu/defn ^:private dashcards->parameter-mapping-field-clauses :- [:maybe [:set mbql.s/Field]]
  "Return set of any Fields referenced directly by the Dashboard's `:parameters` (i.e., 'explicit' parameters) by
  looking at the appropriate `:parameter_mappings` entries for its Dashcards."
  [dashcards]
  (when-let [fields (seq (for [dashcard dashcards
                               param    (:parameter_mappings dashcard)
                               :let     [field-clause (param-target->field-clause (:target param) (:card dashcard))]
                               :when    field-clause]
                           field-clause))]
    (set fields)))

(declare card->template-tag-field-ids)

(defn- cards->card-param-field-ids
  "Return the IDs of any Fields referenced in the 'implicit' template tag field filter parameters for native queries in
  `cards`."
  [cards]
  (reduce set/union #{} (map card->template-tag-field-ids cards)))

(mu/defn dashcards->param-field-ids :- [:set ms/PositiveInt]
  "Return a set of Field IDs referenced by parameters in Cards in the given `dashcards`, or `nil` if none are referenced. This
  also includes IDs of Fields that are to be found in the 'implicit' parameters for SQL template tag Field filters.
  `dashcards` must be hydrated with :card."
  [dashcards]
  (set/union
   (set (mbql.u/match (seq (dashcards->parameter-mapping-field-clauses dashcards))
          [:field (id :guard integer?) _]
          id))
   (cards->card-param-field-ids (map :card dashcards))))

(defn get-linked-field-ids
  "Retrieve a map relating paramater ids to field ids."
  [dashcards]
  (letfn [(targets [params card]
            (into {}
                  (for [param params
                        :let  [clause (param-target->field-clause (:target param)
                                                                  card)
                               ids (mbql.u/match clause
                                     [:field (id :guard integer?) _]
                                     id)]
                        :when (seq ids)]
                    [(:parameter_id param) (set ids)])))]
    (->> dashcards
         (mapv (fn [{params :parameter_mappings card :card}] (targets params card)))
         (apply merge-with into {}))))

(defn- dashboard->param-field-values
  "Return a map of Field ID to FieldValues (if any) for any Fields referenced by Cards in `dashboard`,
   or `nil` if none are referenced or none of them have FieldValues."
  [dashboard]
  (field-ids->param-field-values (dashcards->param-field-ids (:dashcards dashboard))))

(defmethod param-values :model/Dashboard [dashboard]
  (dashboard->param-field-values dashboard))

(defmethod param-fields :model/Dashboard [dashboard]
  (-> (t2/hydrate dashboard [:dashcards :card])
      :dashcards
      dashcards->param-field-ids
      param-field-ids->fields))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 CARD-SPECIFIC                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn card->template-tag-field-clauses :- [:set mbql.s/field]
  "Return a set of `:field` clauses referenced in template tag parameters in `card`."
  [card]
  (set (for [[_ {dimension :dimension}] (get-in card [:dataset_query :native :template-tags])
             :when                      dimension
             :let                       [field (unwrap-field-clause dimension)]
             :when                      field]
         field)))

(mu/defn card->template-tag-field-ids :- [:set ms/PositiveInt]
  "Return a set of Field IDs referenced in template tag parameters in `card`. This is mostly used for determining
  Fields referenced by Cards for purposes other than processing queries. Filters out `:field` clauses using names."
  [card]
  (set (mbql.u/match (seq (card->template-tag-field-clauses card))
         [:field (id :guard integer?) _]
         id)))
(defmethod param-values :model/Card [card]
  (-> card card->template-tag-field-ids field-ids->param-field-values))

(defmethod param-fields :model/Card [card]
  (-> card card->template-tag-field-ids param-field-ids->fields))
