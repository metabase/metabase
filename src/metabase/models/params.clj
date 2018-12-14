(ns metabase.models.params
  "Utility functions for dealing with parameters for Dashboards and Cards."
  (:require [clojure.set :as set]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.mbql.util :as mbql.u]
            [metabase.util
             [i18n :as ui18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn field-form->id :- su/IntGreaterThanZero
  "Expand a `field-id` or `fk->` FORM and return the ID of the Field it references. Also handles unwrapped integers.

      (field-form->id [:field-id 100])  ; -> 100"
  [field-form]
  (if (integer? field-form)
    field-form
    ;; TODO - what are we supposed to do if `field-form` is a field literal?
    (mbql.u/field-clause->id-or-literal field-form)))

(defn wrap-field-id-if-needed
  "Wrap a raw Field ID in a `:field-id` clause if needed."
  [field-id-or-form]
  (cond
    (mbql.u/mbql-clause? field-id-or-form)
    field-id-or-form

    (integer? field-id-or-form)
    [:field-id field-id-or-form]

    :else
    (throw (IllegalArgumentException. (str (trs "Don't know how to wrap:") " " field-id-or-form)))))

(defn- field-ids->param-field-values
  "Given a collection of PARAM-FIELD-IDS return a map of FieldValues for the Fields they reference.
   This map is returned by various endpoints as `:param_values`."
  [param-field-ids]
  (when (seq param-field-ids)
    (u/key-by :field_id (db/select ['FieldValues :values :human_readable_values :field_id]
                          :field_id [:in param-field-ids]))))

(defn- template-tag->field-form
  "Fetch the `field-id` or `fk->` form from DASHCARD referenced by TEMPLATE-TAG.

     (template-tag->field-form [:template-tag :company] some-dashcard) ; -> [:field-id 100]"
  [[_ tag] dashcard]
  (get-in dashcard [:card :dataset_query :native :template-tags (u/keyword->qualified-name tag) :dimension]))

(defn- param-target->field-id
  "Parse a Card parameter TARGET form, which looks something like `[:dimension [:field-id 100]]`, and return the Field
  ID it references (if any)."
  [target dashcard]
  (when (mbql.u/is-clause? :dimension target)
    (let [[_ dimension] target]
      (field-form->id (if (mbql.u/is-clause? :template-tag dimension)
                        (template-tag->field-form dimension dashcard)
                        dimension)))))


(defn- pk-fields
  "Return the `fields` that are PK Fields."
  [fields]
  (filter #(isa? (:special_type %) :type/PK) fields))

(def ^:private Field:params-columns-only
  "Form for use in Toucan `db/select` expressions (as a drop-in replacement for using `Field`) that returns Fields with
  only the columns that are appropriate for returning in public/embedded API endpoints, which make heavy use of the
  functions in this namespace. Use `conj` to add additional Fields beyond the ones already here. Use `rest` to get
  just the column identifiers, perhaps for use with something like `select-keys`. Clutch!

    (db/select Field:params-columns-only)"
  ['Field :id :table_id :display_name :base_type :special_type :has_field_values])

(defn- fields->table-id->name-field
  "Given a sequence of `fields,` return a map of Table ID -> to a `:type/Name` Field in that Table, if one exists. In
  cases where more than one name Field exists for a Table, this just adds the first one it finds."
  [fields]
  (when-let [table-ids (seq (map :table_id fields))]
    (u/key-by :table_id (-> (db/select Field:params-columns-only
                              :table_id     [:in table-ids]
                              :special_type (mdb/isa :type/Name))
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
      (assoc field :name_field (when (isa? (:special_type field) :type/PK)
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


(defn- param-field-ids->fields
  "Get the Fields (as a map of Field ID -> Field) that shoudl be returned for hydrated `:param_fields` for a Card or
  Dashboard. These only contain the minimal amount of information necessary needed to power public or embedded
  parameter widgets."
  [field-ids]
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

(defn- dashboard->parameter-mapping-field-ids
  "Return the IDs of any Fields referenced directly by the Dashboard's `:parameters` (i.e., 'explicit' parameters) by
  looking at the appropriate `:parameter_mappings` entries for its Dashcards."
  [dashboard]
  (when-let [ids (seq (for [dashcard (:ordered_cards dashboard)
                            param    (:parameter_mappings dashcard)
                            :let     [field-id (param-target->field-id (:target param) dashcard)]
                            :when    field-id]
                        field-id))]
    (set ids)))

(declare card->template-tag-field-ids)

(defn- dashboard->card-param-field-ids
  "Return the IDs of any Fields referenced in the 'implicit' template tag field filter parameters for native queries in
  the Cards in `dashboard`."
  [dashboard]
  (reduce
   set/union
   (for [{card :card} (:ordered_cards dashboard)]
     (card->template-tag-field-ids card))))

(defn dashboard->param-field-ids
  "Return a set of Field IDs referenced by parameters in Cards in this DASHBOARD, or `nil` if none are referenced. This
  also includes IDs of Fields that are to be found in the 'implicit' parameters for SQL template tag Field filters."
  [dashboard]
  (let [dashboard (hydrate dashboard [:ordered_cards :card])]
    (set/union
     (dashboard->parameter-mapping-field-ids dashboard)
     (dashboard->card-param-field-ids dashboard))))

(defn- dashboard->param-field-values
  "Return a map of Field ID to FieldValues (if any) for any Fields referenced by Cards in DASHBOARD,
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

(defn card->template-tag-field-ids
  "Return a set of Field IDs referenced in template tag parameters in CARD."
  [card]
  (set (for [[_ {dimension :dimension}] (get-in card [:dataset_query :native :template-tags])
             :when                      dimension
             :let                       [field-id (field-form->id dimension)]
             :when                      field-id]
         field-id)))

(defmethod param-values "Card" [card]
  (field-ids->param-field-values (card->template-tag-field-ids card)))

(defmethod param-fields "Card" [card]
  (-> card card->template-tag-field-ids param-field-ids->fields))
