(ns metabase.models.params
  "Utility functions for dealing with parameters for Dashboards and Cards."
  (:require [metabase.query-processor.middleware.expand :as ql]
            metabase.query-processor.interface
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]])
  (:import metabase.query_processor.interface.FieldPlaceholder))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- field-form->id
  "Expand a `field-id` or `fk->` FORM and return the ID of the Field it references.

     (field-form->id [:field-id 100])  ; -> 100"
  [field-form]
  (when-let [field-placeholder (u/ignore-exceptions (ql/expand-ql-sexpr field-form))]
    (when (instance? FieldPlaceholder field-placeholder)
      (:field-id field-placeholder))))

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
  (get-in dashcard [:card :dataset_query :native :template_tags (keyword tag) :dimension]))

(defn- param-target->field-id
  "Parse a Card parameter TARGET form, which looks something like `[:dimension [:field-id 100]]`, and return the Field
  ID it references (if any)."
  [target dashcard]
  (when (ql/is-clause? :dimension target)
    (let [[_ dimension] target]
      (field-form->id (if (ql/is-clause? :template-tag dimension)
                        (template-tag->field-form dimension dashcard)
                        dimension)))))

(defn- param-field-ids->fields
  "Get the Fields (as a map of Field ID -> Field) that shoudl be returned for hydrated `:param_fields` for a Card or
  Dashboard. These only contain the minimal amount of information neccesary needed to power public or embedded
  parameter widgets."
  [field-ids]
  (when (seq field-ids)
    (u/key-by :id (-> (db/select ['Field :id :display_name :base_type :special_type]
                        :id [:in field-ids])
                      (hydrate :has_field_values)))))

(def param-values nil) ; NOCOMMIT
(defmulti ^:private ^{:hydrate :param_values} param-values
  "Add a `:param_values` map (Field ID -> FieldValues) containing FieldValues for the Fields referenced by the
  parameters of a Card or a Dashboard. Implementations are in respective sections below."
  name)

(def param-fields nil) ; NOCOMMIT
(defmulti ^:private ^{:hydrate :param_fields} param-fields
  "Add a `:param_fields` map (Field ID -> Field) for all of the Fields referenced by the parameters of a Card or
  Dashboard. Implementations are below in respective sections."
  name)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               DASHBOARD-SPECIFIC                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn dashboard->param-field-ids
  "Return a set of Field IDs referenced by parameters in Cards in this DASHBOARD, or `nil` if none are referenced."
  [dashboard]
  (when-let [ids (seq (for [dashcard (:ordered_cards dashboard)
                            param    (:parameter_mappings dashcard)
                            :let     [field-id (param-target->field-id (:target param) dashcard)]
                            :when    field-id]
                        field-id))]
    (set ids)))

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
  (set (for [[_ {dimension :dimension}] (get-in card [:dataset_query :native :template_tags])
             :when                      dimension
             :let                       [field-id (field-form->id dimension)]
             :when                      field-id]
         field-id)))

(defmethod param-values "Card" [card]
  (field-ids->param-field-values (card->template-tag-field-ids card)))

(defmethod param-fields "Card" [card]
  (-> card card->template-tag-field-ids param-field-ids->fields))
