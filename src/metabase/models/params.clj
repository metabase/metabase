(ns metabase.models.params
  "Utility functions for dealing with parameters for Dashboards and Cards."
  (:require [clojure.set :as set]
            [clojure.tools.logging :as log]
            [metabase.db.util :as mdb.u]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn unwrap-field-clause :- mbql.s/field
  "Unwrap something that contains a `:field` clause, such as a template tag, Also handles unwrapped integers for
  legacy compatibility.

    (unwrap-field-clause [:field-id 100]) ; -> [:field-id 100]"
  [field-form]
  (if (integer? field-form)
    [:field field-form nil]
    (mbql.u/match-one field-form :field)))

(defn wrap-field-id-if-needed
  "Wrap a raw Field ID in a `:field-id` clause if needed."
  [field-id-or-form]
  (cond
    (mbql.u/mbql-clause? field-id-or-form)
    field-id-or-form

    (integer? field-id-or-form)
    [:field field-id-or-form nil]

    :else
    (throw (ex-info (trs "Don''t know how to wrap Field ID.")
                    {:form field-id-or-form}))))

(def ^:dynamic *ignore-current-user-perms-and-return-all-field-values*
  "Whether to ignore permissions for the current User and return *all* FieldValues for the Fields being parameterized by
  Cards and Dashboards. This determines how `:param_values` gets hydrated for Card and Dashboard. Normally, this is
  `false`, but the public and embed versions of the API endpoints can bind this to `true` to bypass normal perms
  checks (since there is no current User) and get *all* values."
  false)

(defn- field-ids->param-field-values-ignoring-current-user
  [param-field-ids]
  (u/key-by :field_id (db/select ['FieldValues :values :human_readable_values :field_id]
                        :field_id [:in param-field-ids])))

(defn- field-ids->param-field-values
  "Given a collection of `param-field-ids` return a map of FieldValues for the Fields they reference. This map is
  returned by various endpoints as `:param_values`."
  [param-field-ids]
  (when (seq param-field-ids)
    ((if *ignore-current-user-perms-and-return-all-field-values*
       field-ids->param-field-values-ignoring-current-user
       params.field-values/field-id->field-values-for-current-user) param-field-ids)))

(defn- template-tag->field-form
  "Fetch the `:field` clause from `dashcard` referenced by `template-tag`.

    (template-tag->field-form [:template-tag :company] some-dashcard) ; -> [:field 100 nil]"
  [[_ tag] dashcard]
  (get-in dashcard [:card :dataset_query :native :template-tags (u/qualified-name tag) :dimension]))

(s/defn param-target->field-clause :- (s/maybe mbql.s/field)
  "Parse a Card parameter `target` form, which looks something like `[:dimension [:field-id 100]]`, and return the Field
  ID it references (if any)."
  [target dashcard]
  (let [target (mbql.normalize/normalize-tokens target :ignore-path)]
    (when (mbql.u/is-clause? :dimension target)
      (let [[_ dimension] target]
        (try
          (unwrap-field-clause
           (if (mbql.u/is-clause? :template-tag dimension)
             (template-tag->field-form dimension dashcard)
             dimension))
          (catch Throwable e
            (log/error e (tru "Could not find matching Field ID for target:") target)))))))

(defn- pk-fields
  "Return the `fields` that are PK Fields."
  [fields]
  (filter #(isa? (:semantic_type %) :type/PK) fields))

(def ^:private Field:params-columns-only
  "Form for use in Toucan `db/select` expressions (as a drop-in replacement for using `Field`) that returns Fields with
  only the columns that are appropriate for returning in public/embedded API endpoints, which make heavy use of the
  functions in this namespace. Use `conj` to add additional Fields beyond the ones already here. Use `rest` to get
  just the column identifiers, perhaps for use with something like `select-keys`. Clutch!

    (db/select Field:params-columns-only)"
  ['Field :id :table_id :display_name :base_type :semantic_type :has_field_values])

(defn- fields->table-id->name-field
  "Given a sequence of `fields,` return a map of Table ID -> to a `:type/Name` Field in that Table, if one exists. In
  cases where more than one name Field exists for a Table, this just adds the first one it finds."
  [fields]
  (when-let [table-ids (seq (map :table_id fields))]
    (u/key-by :table_id (-> (db/select Field:params-columns-only
                              :table_id      [:in table-ids]
                              :semantic_type (mdb.u/isa :type/Name))
                            ;; run `metabase.models.field/infer-has-field-values` on these Fields so their values of
                            ;; `has_field_values` will be consistent with what the FE expects. (e.g. we'll return
                            ;; `list` instead of `auto-list`.)
                            (hydrate :has_field_values)))))

(defn add-name-field
  "For all `fields` that are `:type/PK` Fields, look for a `:type/Name` Field belonging to the same Table. For each
  Field, if a matching name Field exists, add it under the `:name_field` key. This is so the Fields can be used in
  public/embedded field values search widgets. This only includes the information needed to power those widgets, and
  no more."
  {:batched-hydrate :name_field}
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
  (-> dimension
      (update :human_readable_field #(select-keys % (rest Field:params-columns-only)))
      ;; these aren't exactly secret but you the frontend doesn't need them either so while we're at it let's go ahead
      ;; and strip them out
      (dissoc :created_at :updated_at)))

(defn- remove-dimensions-nonpublic-columns
  "Strip nonpublic columns from the hydrated human-readable Field in the hydrated Dimensions in `fields`."
  [fields]
  (for [field fields]
    (update field :dimensions
            (fn [dimension-or-dimensions]
              ;; as disucssed in `metabase.models.field` the hydration code for `:dimensions` is
              ;; WRONG and the value ends up either being a single Dimension or an empty vector.
              ;; However at some point we will fix this so deal with either a map or a sequence of
              ;; maps
              (cond
                (map? dimension-or-dimensions)
                (remove-dimension-nonpublic-columns dimension-or-dimensions)

                (sequential? dimension-or-dimensions)
                (map remove-dimension-nonpublic-columns dimension-or-dimensions))))))


(s/defn ^:private param-field-ids->fields
  "Get the Fields (as a map of Field ID -> Field) that shoudl be returned for hydrated `:param_fields` for a Card or
  Dashboard. These only contain the minimal amount of information necessary needed to power public or embedded
  parameter widgets."
  [field-ids :- (s/maybe #{su/IntGreaterThanZero})]
  (when (seq field-ids)
    (u/key-by :id (-> (db/select Field:params-columns-only :id [:in field-ids])
                      (hydrate :has_field_values :name_field [:dimensions :human_readable_field])
                      remove-dimensions-nonpublic-columns))))

(defmulti ^:private ^{:hydrate :param_values} param-values
  "Add a `:param_values` map (Field ID -> FieldValues) containing FieldValues for the Fields referenced by the
  parameters of a Card or a Dashboard. Implementations are in respective sections below."
  name)

(defmulti ^:private ^{:hydrate :param_fields} param-fields
  "Add a `:param_fields` map (Field ID -> Field) for all of the Fields referenced by the parameters of a Card or
  Dashboard. Implementations are below in respective sections."
  name)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               DASHBOARD-SPECIFIC                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private dashboard->parameter-mapping-field-clauses :- (s/maybe #{mbql.s/field})
  "Return set of any Fields referenced directly by the Dashboard's `:parameters` (i.e., 'explicit' parameters) by
  looking at the appropriate `:parameter_mappings` entries for its Dashcards."
  [dashboard]
  (when-let [fields (seq (for [dashcard (:ordered_cards dashboard)
                               param    (:parameter_mappings dashcard)
                               :let     [field-clause (param-target->field-clause (:target param) dashcard)]
                               :when    field-clause]
                           field-clause))]
    (set fields)))

(declare card->template-tag-field-ids)

(defn- dashboard->card-param-field-ids
  "Return the IDs of any Fields referenced in the 'implicit' template tag field filter parameters for native queries in
  the Cards in `dashboard`."
  [dashboard]
  (reduce
   set/union
   (for [{card :card} (:ordered_cards dashboard)]
     (card->template-tag-field-ids card))))

(s/defn dashboard->param-field-ids :- #{su/IntGreaterThanZero}
  "Return a set of Field IDs referenced by parameters in Cards in this `dashboard`, or `nil` if none are referenced. This
  also includes IDs of Fields that are to be found in the 'implicit' parameters for SQL template tag Field filters."
  [dashboard]
  (let [dashboard (hydrate dashboard [:ordered_cards :card])]
    (set/union
     (set (mbql.u/match (seq (dashboard->parameter-mapping-field-clauses dashboard))
            [:field (id :guard integer?) _]
            id))
     (dashboard->card-param-field-ids dashboard))))

(defn- dashboard->param-field-values
  "Return a map of Field ID to FieldValues (if any) for any Fields referenced by Cards in `dashboard`,
   or `nil` if none are referenced or none of them have FieldValues."
  [dashboard]
  (field-ids->param-field-values (dashboard->param-field-ids dashboard)))

(defmethod param-values "Dashboard" [dashboard]
  (dashboard->param-field-values dashboard))

(defmethod param-fields "Dashboard" [dashboard]
  (-> dashboard dashboard->param-field-ids param-field-ids->fields))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 CARD-SPECIFIC                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn card->template-tag-field-clauses :- #{mbql.s/field}
  "Return a set of `:field` clauses referenced in template tag parameters in `card`."
  [card]
  (set (for [[_ {dimension :dimension}] (get-in card [:dataset_query :native :template-tags])
             :when                      dimension
             :let                       [field (unwrap-field-clause dimension)]
             :when                      field]
         field)))

(s/defn card->template-tag-field-ids :- #{su/IntGreaterThanZero}
  "Return a set of Field IDs referenced in template tag parameters in `card`. This is mostly used for determining
  Fields referenced by Cards for purposes other than processing queries. Filters out `:field` clauses using names."
  [card]
  (set (mbql.u/match (seq (card->template-tag-field-clauses card))
         [:field (id :guard integer?) _]
         id)))

(defmethod param-values "Card" [card]
  (-> card card->template-tag-field-ids field-ids->param-field-values))

(defmethod param-fields "Card" [card]
  (-> card card->template-tag-field-ids param-field-ids->fields))
