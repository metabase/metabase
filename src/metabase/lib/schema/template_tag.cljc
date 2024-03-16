(ns metabase.lib.schema.template-tag
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.util.malli.registry :as mr]))

;; Schema for valid values of `:widget-type` for a [[TemplateTag:FieldFilter]].
(mr/def ::widget-type
  (into
   [:enum
    ;; this will be a nicer error message than Malli trying to list every single possible allowed type.
    {:decode/normalize common/normalize-keyword
     :error/message    "Valid template tag :widget-type"}
    :none]
   ;; TODO -- move this stuff into `metabase.lib`
   (keys lib.schema.parameter/types)))

;; Schema for valid values of template tag `:type`.
(mr/def ::type
  [:enum
   {:decode/normalize common/normalize-keyword}
   :snippet :card :dimension :number :text :date])

(mr/def ::name
  [:ref
   {:decode/normalize common/normalize-string-key}
   ::common/non-blank-string])

;;; Things required by all template tag types.
(mr/def ::common
  [:map
   [:name         ::name]
   [:display-name ::common/non-blank-string]
   ;; TODO -- `:id` is actually 100% required but we have a lot of tests that don't specify it because this constraint
   ;; wasn't previously enforced; we need to go in and fix those tests and make this non-optional
   [:id {:optional true} [:multi {:dispatch uuid?}
                          [true  :uuid]
                          [false ::common/non-blank-string]]]])

;;; Stuff shared between the Field filter and raw value template tag schemas.
(mr/def ::value.common
  [:merge
   [:ref ::common]
   [:map
    ;; default value for this parameter
    [:default {:optional true} any?]
    ;; whether or not a value for this parameter is required in order to run the query
    [:required {:optional true} :boolean]]])

;; Example:
;;
;;    {:id           "c20851c7-8a80-0ffa-8a99-ae636f0e9539"
;;     :name         "date"
;;     :display-name "Date"
;;     :type         :dimension,
;;     :dimension    [:field 4 nil]
;;     :widget-type  :date/all-options}
(mr/def ::field-filter
  [:merge
   [:ref ::value.common]
   [:map
    [:type        [:= :dimension]]
    [:dimension   [:ref :mbql.clause/field]]
    ;; which type of widget the frontend should show for this Field Filter; this also affects which parameter types
    ;; are allowed to be specified for it.
    [:widget-type [:ref ::widget-type]]
    ;; optional map to be appended to filter clause
    [:options {:optional true} [:maybe :map]]]])

(mr/def ::disallow-dimension
  [:fn
   {:decode/normalize #(dissoc % :dimension)
    :error/message    ":dimension is only allowed for :type :dimension template tags"}
   #(not (contains? % :dimension))])

;; Example:
;;
;;    {:id           "c2fc7310-44eb-4f21-c3a0-63806ffb7ddd"
;;     :name         "snippet: select"
;;     :display-name "Snippet: select"
;;     :type         :snippet
;;     :snippet-name "select"
;;     :snippet-id   1}
(mr/def ::snippet
  [:and
   [:merge
    [:ref ::common]
    [:map
     [:type         [:= :snippet]]
     [:snippet-name ::common/non-blank-string]
     [:snippet-id {:optional true} ::id/snippet]
     ;; database to which this Snippet belongs. Doesn't always seem to be specified.
     [:database {:optional true} ::id/database]]]
   [:ref ::disallow-dimension]])

;; Example:
;;
;;    {:id           "fc5e14d9-7d14-67af-66b2-b2a6e25afeaf"
;;     :name         "#1635"
;;     :display-name "#1635"
;;     :type         :card
;;     :card-id      1635}
(mr/def ::source-query
  [:and
   [:merge
    [:ref ::common]
    [:map
     [:type    [:= :card]]
     [:card-id ::id/card]]]
   [:ref ::disallow-dimension]])

(def raw-value-template-tag-types
  "Set of valid values of `:type` for raw value template tags."
  #{:number :text :date :boolean})

;; Valid values of `:type` for raw value template tags.
(mr/def ::raw-value.type
  (into [:enum] raw-value-template-tag-types))

;; Example:
;;
;;    {:id           "35f1ecd4-d622-6d14-54be-750c498043cb"
;;     :name         "id"
;;     :display-name "Id"
;;     :type         :number
;;     :required     true
;;     :default      "1"}
(mr/def ::raw-value
  [:and
   [:merge
    [:ref ::value.common]
    ;; `:type` is used be the FE to determine which type of widget to display for the template tag, and to determine
    ;; which types of parameters are allowed to be passed in for this template tag.
    [:map
     [:type [:ref ::raw-value.type]]]]
   [:ref ::disallow-dimension]])

(mr/def ::template-tag
  [:and
   {:decode/normalize common/normalize-map}
   [:map
    [:type [:ref ::type]]]
   [:multi {:dispatch #(keyword (:type %))}
    [:dimension   [:ref ::field-filter]]
    [:snippet     [:ref ::snippet]]
    [:card        [:ref ::source-query]]
    ;; :number, :text, :date
    [::mc/default [:ref ::raw-value]]]])

(mr/def ::template-tag-map
  [:and
   [:map-of ::name ::template-tag]
   ;; make sure people don't try to pass in a `:name` that's different from the actual key in the map.
   [:fn
    {:error/message "keys in template tag map must match the :name of their values"}
    (fn [m]
      (every? (fn [[tag-name tag-definition]]
                (= tag-name (:name tag-definition)))
              m))]])
