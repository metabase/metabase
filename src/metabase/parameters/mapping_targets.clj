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

(defn template-tag-types
  "Map of template-tag name (string) -> tag type keyword for `card`'s native query — e.g.
  `{\"category\" :dimension, \"min_total\" :number}`. Read from the stored query directly (either the
  legacy `[:native :template-tags]` slot or an MBQL 5 native stage), so one malformed tag — e.g. a
  snippet reference missing its id — can't degrade the whole map the way non-strict normalization
  would. Empty when the card has no native query or no tags."
  [card]
  (let [dq   (:dataset_query card)
        tags (or (not-empty (get-in dq [:native :template-tags]))
                 (some (comp not-empty :template-tags) (:stages dq))
                 (let [query (card-query card)]
                   (when (and query (lib/native-only-query? query))
                     (lib/all-template-tags-map query))))
        ;; a legacy native query keys tags by name; a pMBQL stage stores them as a vector of tag maps
        tags (if (map? tags) (vals tags) tags)]
    (into {}
          (map (fn [tag] [(u/qualified-name (:name tag)) (keyword (:type tag))]))
          tags)))

(def variable-tag-types
  "Template-tag types whose parameter mapping target is `[:variable [:template-tag <name>]]` — raw value
  substitutions the caller supplies an operator for."
  #{:text :number :date :boolean})

(def dimension-tag-types
  "Template-tag types whose parameter mapping target is `[:dimension [:template-tag <name>]]` — tags bound
  to a real column, where the server expands the parameter into the right SQL."
  #{:dimension :temporal-unit})

(defn target-for-tag
  "The mapping target for the template tag named `tag-name` (whose type is `tag-type`, from
  [[template-tag-types]]): `[:dimension …]` for a field-filter or temporal-unit tag, `[:variable …]` for a
  raw variable. Nil for a tag kind that can't back a parameter (snippet/card/table reference tags splice
  SQL text and take no value)."
  [tag-name tag-type]
  (cond
    (contains? dimension-tag-types tag-type) [:dimension [:template-tag tag-name]]
    (contains? variable-tag-types tag-type)  [:variable [:template-tag tag-name]]
    :else                                    nil))

(defn- target-ref-name
  "The column-name string a `:dimension` target's ref carries — `[:expression \"name\"]`, or a name-based
  `[:field \"name\" opts]` ref — or nil for id-based refs."
  [target]
  (when (and (sequential? target) (= :dimension (keyword (first target))))
    (let [[head arg] (second target)]
      (case (some-> head keyword)
        :expression (when (string? arg) arg)
        :field      (when (string? arg) arg)
        nil))))

(defn wireable-target?
  "Whether `target` (a normalized mapping-target clause) points at something `card` actually exposes for
  `parameter`: a template tag whose kind matches the clause head, or a column among the card's compatible
  mapping targets (matched by resolved field id, or by column name for expression/name-based refs). Used to
  reject a wire whose mapping would save cleanly but resolve to nothing at render time. `:text-tag` targets
  bind a virtual dashcard's own content rather than a card and are out of scope here — callers validate
  them against the dashcard."
  [card parameter target]
  (try
    (let [target (lib/normalize ::lib.schema.parameter/target target)]
      (if-let [tag-name (lib/parameter-target-template-tag-name target)]
        (let [tag-type (get (template-tag-types card) tag-name)]
          (= (some-> target first keyword)
             (some-> (target-for-tag tag-name tag-type) first)))
        (let [targets  (valid-targets card parameter)
              field-id (params/param-target->field-id target card)
              ref-name (target-ref-name target)]
          (boolean
           (or (and field-id
                    (some #(= field-id (params/param-target->field-id (:target %) card)) targets))
               (and ref-name
                    (some #(= ref-name (:column-name %)) targets)))))))
    (catch Exception e
      (log/warnf e "Could not validate mapping target %s for card %s" (pr-str target) (:id card))
      false)))
