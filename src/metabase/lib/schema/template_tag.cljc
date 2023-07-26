(ns metabase.lib.schema.template-tag
  "NOTE: docstring below was copied over from the old Schema version of [[metabase.mbql.schema]] without adjusting it to
  make a ton of sense here. So don't take it literally. TODO -- rework docstring

  The next few clauses are used for parameter `:target`... this maps the parameter to an actual template tag in a
  native query or Field for MBQL queries.

  examples:

    {:target [:dimension [:template-tag \"my_tag\"]]}
    {:target [:dimension [:template-tag {:id \"my_tag_id\"}]]}
    {:target [:variable [:template-tag \"another_tag\"]]}
    {:target [:variable [:template-tag {:id \"another_tag_id\"}]]}
    {:target [:dimension [:field 100 nil]]}
    {:target [:field 100 nil]}

  I'm not 100% clear on which situations we'll get which version. But I think the following is generally true:

  * Things are wrapped in `:dimension` when we're dealing with Field filter template tags
  * Raw value template tags wrap things in `:variable` instead
  * Dashboard parameters are passed in with plain Field clause targets.

  One more thing to note: apparently `:expression`... is allowed below as well. I'm not sure how this is actually
  supposed to work, but we have test #18747 that attempts to set it. I'm not convinced this should actually be
  allowed.

  Template tags are used to specify {{placeholders}} in native queries that are replaced with some sort of value when
  the query itself runs. There are four basic types of template tag for native queries:

  1. Field filters, which are used like

         SELECT * FROM table WHERE {{field_filter}}

    These reference specific Fields and are replaced with entire conditions, e.g. `some_field > 1000`

  2. Raw values, which are used like

         SELECT * FROM table WHERE my_field = {{x}}

    These are replaced with raw values.

  3. Native query snippets, which might be used like

         SELECT * FROM ({{snippet: orders}}) source

     These are replaced with `NativeQuerySnippet`s from the application database.

  4. Source query Card IDs, which are used like

         SELECT * FROM ({{#123}}) source

    These are replaced with the query from the Card with that ID.

  Field filters and raw values usually have their value specified by `:parameters` (see [[Parameters]] below)."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.parameter :as parameter]
   [metabase.util.malli.registry :as mr]))

;; Schema for valid values of `:widget-type` for a field filter template tag.
(mr/def ::widget-type
  (into
   [:enum
    ;; this will be a nicer error message than Malli trying to list every single possible allowed type.
    {:error/message "Valid template tag :widget-type"}
    :none]
   (keys parameter/types)))

;; Schema for valid values of template tag `:type`.
(mr/def ::type
  [:enum :snippet :card :dimension :number :text :date])

;;; Things required by all template tag types.
(mr/def ::common
  [:map
   [:name         ::common/non-blank-string]
   [:display-name ::common/non-blank-string]
   ;; TODO -- `:id` is actually 100% required but we have a lot of tests that don't specify it because this constraint
   ;; wasn't previously enforced; we need to go in and fix those tests and make this non-optional
   [:id {:optional true} [:or ::common/non-blank-string :uuid]]])

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
(defn field-filter-schema
  "Create a schema for a template tag definition. This is abstracted out into a function because the version
  in [[metabase.mbql.schema]] is exactly the same other than using a slightly different schema for field refs."
  [field-ref-schema]
  [:merge
   [:ref ::value.common]
   [:map
    [:type        [:= :dimension]]
    [:dimension   field-ref-schema]
    ;; which type of widget the frontend should show for this Field Filter; this also affects which parameter types
    ;; are allowed to be specified for it.
    [:widget-type [:ref ::widget-type]]
    ;; optional map to be appended to filter clause
    [:options {:optional true} :map]]])

(mr/def ::field-filter
  (field-filter-schema [:ref :mbql.clause/field]))

;; Example:
;;
;;    {:id           "c2fc7310-44eb-4f21-c3a0-63806ffb7ddd"
;;     :name         "snippet: select"
;;     :display-name "Snippet: select"
;;     :type         :snippet
;;     :snippet-name "select"
;;     :snippet-id   1}
(mr/def ::snippet
  [:merge
   [:ref ::common]
   [:map
    [:type         [:= :snippet]]
    [:snippet-name ::common/non-blank-string]
    [:snippet-id   ::id/snippet]
    ;; database to which this Snippet belongs. Doesn't always seem to be specified.
    [:database {:optional true} ::id/database]]])

;; Example:
;;
;;    {:id           "fc5e14d9-7d14-67af-66b2-b2a6e25afeaf"
;;     :name         "#1635"
;;     :display-name "#1635"
;;     :type         :card
;;     :card-id      1635}
(mr/def ::source-query
  [:merge
   [:ref ::common]
   [:map
    [:type    [:= :card]]
    [:card-id ::id/card]]])

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
  [:merge
   [:ref ::value.common]
   ;; `:type` is used be the FE to determine which type of widget to display for the template tag, and to determine
   ;; which types of parameters are allowed to be passed in for this template tag.
   [:map
    [:type [:ref ::raw-value.type]]]])

(defn template-tag-schema
  "Create a schema for a template tag definition. This is abstracted out into a function because the version
  in [[metabase.mbql.schema]] is exactly the same other than using a slightly different schema for field filters."
  [field-filter-schem]
  [:and
   [:map
    [:type [:ref ::type]]]
   [:multi {:dispatch :type}
    [:dimension   field-filter-schem]
    [:snippet     [:ref ::snippet]]
    [:card        [:ref ::source-query]]
    ;; :number, :text, :date
    [::mc/default [:ref ::raw-value]]]])

(mr/def ::template-tag
  (template-tag-schema [:ref ::field-filter]))

(defn template-tag-map-schema
  "Create the schema for a template tag map of template tag name -> definition. This is abstracted out into a function
  because the version in [[metabase.mbql.schema]] is exactly the same other than using a slightly different template
  tag schema."
  [template-tag-schem]
  [:and
   [:map-of ::common/non-blank-string template-tag-schem]
   ;; make sure people don't try to pass in a `:name` that's different from the actual key in the map.
   [:fn
    {:error/message "keys in template tag map must match the :name of their values"}
    (fn [m]
      (every? (fn [[tag-name tag-definition]]
                (= tag-name (:name tag-definition)))
              m))]])

(mr/def ::template-tag-map
  (template-tag-map-schema [:ref ::template-tag]))
