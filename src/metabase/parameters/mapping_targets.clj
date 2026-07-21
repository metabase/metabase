(ns metabase.parameters.mapping-targets
  "Enumerate the parameter mapping targets a card exposes: which of its columns or template tags a dashboard parameter
   can be wired to.

   The frontend has owned this since dashboards gained parameters (`getParameterMappingOptions`); this is the
   server-side equivalent, which dashboard authoring over the API needs in order to validate a requested mapping and
   to auto-wire a parameter across a dashboard's cards."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.params :as params]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- card-query
  "`card`'s query as MBQL 5, or nil when it has none. Accepts cards whose query is still legacy MBQL."
  [card]
  (some-> card :dataset_query not-empty lib-be/normalize-query))

(defn- parameter-family
  "The part of a parameter type before the slash, e.g. `\"string\"` for `:string/=`, or nil."
  [parameter-type]
  (when parameter-type
    (first (str/split (u/qualified-name parameter-type) #"/"))))

(defn- types-allowed-together?
  "Guarded [[lib.schema.parameter/parameter-type-and-widget-type-allowed-together?]]: false rather than an exception
   when either type is not one this version knows about."
  [parameter-type widget-type]
  (let [parameter-type (some-> parameter-type u/qualified-name keyword)
        widget-type    (some-> widget-type u/qualified-name keyword)]
    (boolean (and (contains? lib.schema.parameter/types parameter-type)
                  (contains? lib.schema.parameter/types widget-type)
                  (lib.schema.parameter/parameter-type-and-widget-type-allowed-together? parameter-type widget-type)))))

(defn- tag-compatible?
  "Whether a template tag can serve a parameter of `parameter-type`. A field filter (dimension) tag is matched on its
   `:widget-type`, a raw value tag on the tag's own `:type`."
  [parameter-type {tag-type :type, widget-type :widget-type}]
  (if (= :dimension (keyword tag-type))
    ;; a dimension tag with no declared widget type constrains nothing, so it can serve any parameter
    (or (nil? widget-type)
        (types-allowed-together? parameter-type widget-type))
    (types-allowed-together? parameter-type tag-type)))

(defn- native-targets
  [query parameter]
  (for [[tag-name tag] (lib/all-template-tags-map query)
        :when          (tag-compatible? (:type parameter) tag)]
    {:target       (if (= :dimension (keyword (:type tag)))
                     [:dimension [:template-tag (name tag-name)]]
                     [:variable [:template-tag (name tag-name)]])
     :column-name  (name tag-name)
     :display-name (or (:display-name tag) (name tag-name))}))

(defn- column-compatible?
  "Whether `column` can back a parameter of `parameter-type`. Mirrors the frontend's
   `isParameterCompatibleWithColumn`: the parameter's family decides which type of column it accepts."
  [parameter-type column]
  (let [column-type (or (:effective-type column) (:base-type column))
        semantic    (:semantic-type column)
        id?         (or (isa? semantic :type/PK) (isa? semantic :type/FK))
        address?    (isa? semantic :type/Address)
        text?       (or (isa? column-type :type/Text) (isa? column-type :type/TextLike))]
    (case (parameter-family parameter-type)
      "date"          (isa? column-type :type/Temporal)
      "temporal-unit" (isa? column-type :type/Temporal)
      "id"            id?
      "number"        (and (isa? column-type :type/Number) (not id?))
      "string"        (and text? (not address?))
      "location"      (and text? address?)
      "boolean"       (isa? column-type :type/Boolean)
      "category"      true
      false)))

(defn- dimension-ref
  "The ref for `column` to embed in a `:dimension` target. A `:dimension` target is not an MBQL 5 clause — it still
   holds a legacy `:field` or `:expression` ref."
  [column]
  (let [opts (when-let [fk-field-id (:fk-field-id column)]
               {:source-field fk-field-id})]
    (cond
      (:id column)                                 [:field (:id column) opts]
      (= :source/expressions (:lib/source column))  [:expression (:name column)]
      :else                                        [:field (:name column) (assoc opts :base-type (:base-type column))])))

(defn- mbql-targets
  "Filterable columns of `card`'s query as dimension targets."
  [card parameter]
  (try
    (vec (for [col   (params/filterable-columns-for-query card -1)
               :when (column-compatible? (:type parameter) col)]
           ;; `{:stage-number 0}` is not decoration — without it the target resolves wrong on multi-stage queries
           {:target       [:dimension (dimension-ref col) {:stage-number 0}]
            :column-name  (:name col)
            :display-name (or (:display-name col) (:name col))}))
    (catch Exception e
      ;; an unrunnable card should narrow the wiring options, not fail the whole save
      (log/warnf e "Could not enumerate mapping targets for card %s" (:id card))
      [])))

(defn valid-targets
  "The mapping targets `card` exposes for `parameter` (a parameter map with `:id` and `:type`), as
  `[{:target :column-name :display-name} …]`. Empty when the card exposes nothing compatible. Never throws — an
  unrunnable card yields no targets."
  [card parameter]
  (let [query (card-query card)]
    (cond
      (nil? query)                   []
      (lib/native-only-query? query) (vec (native-targets query parameter))
      :else                          (mbql-targets card parameter))))

(defn target-for-field
  "The target on `card` that `parameter` can use to filter on `field-id`, or nil when the card exposes no compatible
  column for that field."
  [card parameter field-id]
  (->> (valid-targets card parameter)
       ;; `param-target->field-id` is the same resolution the rest of the codebase uses for both dimension and
       ;; template-tag targets — matching on the ref's shape here would drift from it
       (filter #(= field-id (params/param-target->field-id (:target %) card)))
       first
       :target))
