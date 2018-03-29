(ns metabase.models.params
  "Utility functions for dealing with parameters for Dashboards and Cards."
  (:require [metabase.query-processor.middleware.expand :as ql]
            metabase.query-processor.interface
            [metabase.util :as u]
            [toucan.db :as db])
  (:import metabase.query_processor.interface.FieldPlaceholder))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     SHARED                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn field-form->id
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
  "Parse a Card parameter TARGET form, which looks something like `[:dimension [:field-id 100]]`, and return the Field ID
   it references (if any)."
  [target dashcard]
  (when (ql/is-clause? :dimension target)
    (let [[_ dimension] target]
      (field-form->id (if (ql/is-clause? :template-tag dimension)
                        (template-tag->field-form dimension dashcard)
                        dimension)))))


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

(defn add-field-values-for-parameters
  "Add a `:param_values` map containing FieldValues for the parameter Fields in the DASHBOARD."
  [dashboard]
  (assoc dashboard :param_values (dashboard->param-field-values dashboard)))

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

(defn add-card-param-values
  "Add FieldValues for any Fields referenced in CARD's `:template_tags`."
  [card]
  (assoc card :param_values (field-ids->param-field-values (card->template-tag-field-ids card))))
