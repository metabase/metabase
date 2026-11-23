(ns metabase.util.malli.json-schema
  "Generate JSON Schema from Malli schemas, fixing what [[malli.json-schema/transform]] gets wrong or leaves empty."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.json-schema :as mjs]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as mp]))

(set! *warn-on-reflection* true)

(def ^:private default-definitions-path "#/definitions/")

(mr/def ::malli-schema
  "A Malli schema: a registry keyword, a schema vector, or a compiled schema."
  [:or :keyword vector? [:fn {:error/message "a Malli schema"} mc/schema?]])

(mr/def ::json-schema
  "A JSON Schema node, an open bag of JSON Schema keywords."
  [:map {::mr/deliberately-open true}])

(mr/def ::options
  "Where the generated JSON Schema keeps the definitions it refers to."
  [:map {:closed true}
   [:definitions-path {:optional true} :string]])

(def annotation-keys
  "The keys of a JSON Schema node that describe it without constraining what it accepts."
  ;; `:example` is the OpenAPI spelling, which Malli emits for `:json-schema/example`
  #{:$comment :default :deprecated :description :example :examples :readOnly :title :writeOnly})

(defn- empty-schema?
  "Whether the JSON Schema `node` accepts anything."
  [node]
  (and (map? node) (empty? (apply dissoc node annotation-keys))))

(defn- never-schema?
  "Whether the JSON Schema `node` accepts nothing."
  [node]
  (and (map? node) (= {:not {}} (apply dissoc node annotation-keys))))

(defn- declared?
  "Whether the JSON Schema `node` comes from a schema that spells its JSON Schema itself, or from `:any`."
  [node]
  (::declared (meta node)))

(def ^:private neighbor-keys
  "JSON Schema keywords whose meaning depends on other keywords of the same schema, mapped to those keywords."
  {:additionalItems       #{:items :prefixItems}
   :additionalProperties  #{:patternProperties :properties}
   ;; OpenAPI's `discriminator` maps values to the branches beside it
   :discriminator         #{:allOf :anyOf :oneOf}
   :else                  #{:if}
   :items                 #{:prefixItems}
   :maxContains           #{:contains}
   :minContains           #{:contains}
   :then                  #{:if}
   ;; the `unevaluated` keywords see what every applicator beside them evaluated
   :unevaluatedItems      #{:$dynamicRef :$ref :allOf :anyOf :contains :else :if :items :oneOf :prefixItems :then}
   :unevaluatedProperties #{:$dynamicRef :$ref :additionalProperties :allOf :anyOf :dependentSchemas :else :if :oneOf
                            :patternProperties :properties :then}})

(defn- reads-neighbor?
  "Whether a keyword of the JSON Schema `a` depends on a keyword of `b`, so that merging the two changes its meaning."
  [a b]
  ;; a keyword that accepts anything, such as `additionalProperties: {}`, means the same whatever sits beside it
  (mp/some (fn [[k v]]
             (and (not (or (true? v) (empty-schema? v)))
                  (mp/some #(contains? b %) (neighbor-keys k))))
           a))

(defn- merges-cleanly?
  "Whether merging the JSON Schema `branch` into the JSON Schema `node` accepts what both accepted together.
  False when the branch has its own `$id` or anchor, or a constraining key the node also has with a different value.
  Also false when a keyword on one side depends on a keyword on the other."
  [node branch]
  (and (map? branch)
       ;; a branch's `$id` would become the base every `$ref` in the node resolves against, and its anchors would
       ;; name the whole node
       (not-any? #(contains? branch %) [:$anchor :$dynamicAnchor :$id])
       ;; an equal value, such as `type: object` on both, merges without losing anything
       (not (mp/some #(and (contains? node %)
                           (not (annotation-keys %))
                           (not= (get node %) (get branch %)))
                     (keys branch)))
       (not (reads-neighbor? branch node))
       (not (reads-neighbor? node branch))))

(defn merge-one-branch
  "The JSON Schema `schema` with the one branch under its branching keyword `k` merged into it, keeping whether either
  was declared.
  Returns nil when `k` holds more or fewer than one branch, when a keyword beside `k` reads it, or when the branch
  does not [[merges-cleanly?]]."
  [schema k]
  (let [[branch & more] (k schema)
        siblings        (dissoc schema k)]
    ;; a keyword that reads the branching keyword itself, such as a `discriminator` beside an `anyOf`, would lose it
    (when (and branch
               (not more)
               (not (reads-neighbor? siblings (select-keys schema [k])))
               (merges-cleanly? siblings branch))
      (with-meta (merge siblings branch)
                 (merge (meta schema) (select-keys (meta branch) [::declared]))))))

(defn- lift-annotations
  "The JSON Schema `schema` with the annotations of its `k` branches that constrain nothing merged in, its own winning."
  [schema k]
  ;; a branch such as `{deprecated: true}` constrains nothing, but its annotation still describes the node
  (with-meta (merge (apply merge {} (filter empty-schema? (k schema))) schema)
             (meta schema)))

(defn- collapse-branches
  "Drop the conjuncts that accept anything, keeping their annotations on the node, and the alternatives that accept
  nothing, and unwrap a branching node that has one branch left, if it [[merges-cleanly?]] (see [[merge-one-branch]])."
  [schema k]
  (let [branches            (k schema)
        ;; conjuncts that all accept anything leave a node that does too, declared only if each of them was
        declared-conjuncts? (and (= k :allOf)
                                 (seq branches)
                                 (mp/every? #(and (empty-schema? %) (declared? %)) branches))
        schema              (cond-> schema
                              (= k :allOf)
                              (-> (lift-annotations k)
                                  (update k (partial remove empty-schema?)))

                              (and (= k :anyOf) (mp/some (complement never-schema?) branches))
                              (update k (partial remove never-schema?)))]
    (cond
      declared-conjuncts?
      (vary-meta (dissoc schema k) assoc ::declared true)

      ;; an alternative that accepts anything makes the node accept anything, and its annotations describe the node
      (mp/some #(and (empty-schema? %) (declared? %)) (k schema))
      (vary-meta (dissoc (lift-annotations schema k) k) assoc ::declared true)

      (and (seq (k schema)) (mp/every? empty-schema? (k schema)))
      (dissoc (lift-annotations schema k) k)

      :else
      (or (merge-one-branch schema k)
          (cond-> schema
            (empty? (k schema)) (dissoc k))))))

(defn- stringify [required]
  (if (sequential? required)
    (map u/qualified-name required)
    required))

(defn- tuple-length
  "Require every item of a malli `:tuple` and no more, which JSON Schema's `prefixItems` leaves optional and readers
  that drop `items: false` leave open."
  [node]
  (cond-> node
    (and (:prefixItems node) (false? (:items node)) (not (:minItems node)))
    (assoc :minItems (count (:prefixItems node)))

    (and (:prefixItems node) (false? (:items node)) (not (:maxItems node)))
    (assoc :maxItems (count (:prefixItems node)))))

(defn- merge-beside
  "The JSON Schema `replacement` merged with the keywords `siblings` that sat beside the `oneOf` it replaces, theirs
  winning, except that two string descriptions are joined, the siblings' first."
  [replacement siblings]
  ;; a `[:maybe]`'s description and its schema's both describe the property
  (cond-> (merge replacement siblings)
    (and (string? (:description siblings))
         (string? (:description replacement))
         (not= (:description siblings) (:description replacement)))
    (assoc :description (str (:description siblings) " " (:description replacement)))))

(def ^:private applicator-keys
  "JSON Schema keywords that only apply subschemas to the value, and so mean the same beside other keywords as under an
  `allOf`."
  #{:allOf :anyOf :not :oneOf})

(defn replace-one-of
  "Replace the `oneOf` of the JSON Schema `node` with the JSON Schema `replacement`, keeping `node`'s metadata.
  The replacement merges into the keywords beside the `oneOf` (see [[merge-beside]]) where those are only
  [[annotation-keys]], or where the replacement asserts only [[applicator-keys]] they lack.
  Otherwise it joins them under `allOf`, and its description, if they have none, stays on the node."
  [node replacement]
  (let [siblings   (dissoc node :oneOf)
        assertions (keys (apply dissoc replacement annotation-keys))]
    (with-meta
     (cond
       ;; merging also keeps a `discriminator` beside the alternatives it tells apart
       (or (every? annotation-keys (keys siblings))
           (and (every? applicator-keys assertions)
                (not-any? #(contains? siblings %) assertions)))
       (merge-beside replacement siblings)

       ;; A sibling assertion must hold as well, and some read their neighbors (`additionalProperties` reads
       ;; `properties`, `minContains` reads `contains`), so only `allOf` keeps both meanings intact.
       ;; Readers look for a property's description at its top level, not inside `allOf`.
       (and (:description replacement) (not (contains? siblings :description)))
       (-> siblings
           (assoc :description (:description replacement))
           (update :allOf (fnil conj []) (dissoc replacement :description)))

       :else
       (update siblings :allOf (fnil conj []) replacement))
     (meta node))))

(defn branches->any-of
  "The JSON Schema accepting what any of the JSON Schemas `branches` accepts.
  Returns their `anyOf`, or `{:not {}}`, which accepts nothing, for no branches."
  [branches]
  ;; JSON Schema requires at least one branch in an `anyOf`
  (if (seq branches)
    {:anyOf (vec branches)}
    {:not {}}))

(defn- any-of
  "The JSON Schema `node` with its `oneOf` replaced by an `anyOf`, as [[replace-one-of]] does.
  Unlike [[without-one-of]], it keeps the `null` branch of `[:maybe X]` in the `anyOf` rather than folding it into a
  nullable type."
  [node]
  ;; Malli's branching schemas pass when any branch does, so a `oneOf` whose branches overlap is an `anyOf`.
  ;; The nullable type exists for tool clients that coerce types, which the OpenAPI spec does not serve.
  (if-let [branches (:oneOf node)]
    (replace-one-of node (branches->any-of branches))
    node))

(defn- definition-name
  "Munge the characters of a definition name, like the `<` of `mbql.clause.<`, that a JSON Pointer cannot hold."
  [definition-name]
  (str/replace (str/replace definition-name "~1" "/") #"[^\w.-]" (comp munge str)))

(defn- ref-definition
  "The definition a `$ref` under `definitions-path` points to, as malli named it."
  [definitions-path ref]
  (when (str/starts-with? ref definitions-path)
    (str/replace (subs ref (count definitions-path)) "~1" "/")))

(def ^:private subschema-keywords
  "The JSON Schema keywords that nest subschemas, by the shape of the keyword's value."
  {:map-of #{:$defs :definitions :dependencies :dependentSchemas :patternProperties :properties}
   :list   #{:allOf :anyOf :oneOf :prefixItems}
   ;; `items` is a list of schemas in draft-07, so this shape takes either
   :schema #{:additionalItems :additionalProperties :contains :contentSchema :else :if :items :not :propertyNames
             :then :unevaluatedItems :unevaluatedProperties}})

(defn postwalk-schemas
  "Apply `f` to every subschema of the JSON Schema `node`, children first, leaving property names and values alone."
  [f node]
  (if-not (map? node)
    node
    (let [walk      #(postwalk-schemas f %)
          walk-list #(mp/mapv walk %)
          ;; a value of the wrong shape, such as `additionalProperties: false` or a `dependencies` list, stays
          walk-by   {:map-of #(if (map? %) (update-vals % walk) %)
                     :list   #(if (sequential? %) (walk-list %) %)
                     :schema #(if (sequential? %) (walk-list %) (walk %))}]
      (f (reduce-kv (fn [node shape ks]
                      (reduce (fn [node k]
                                (cond-> node
                                  (contains? node k) (update k (walk-by shape))))
                              node
                              ks))
                    node
                    subschema-keywords)))))

(def ^:private keyword-types
  "JSON Schema assertion keywords that apply only to values of one type, mapped to that type."
  (merge (zipmap [:additionalProperties :dependentRequired :dependentSchemas :maxProperties :minProperties
                  :patternProperties :properties :propertyNames :required]
                 (repeat "object"))
         (zipmap [:contains :items :maxContains :maxItems :minContains :minItems :prefixItems :uniqueItems]
                 (repeat "array"))
         (zipmap [:contentEncoding :contentMediaType :contentSchema :format :maxLength :minLength :pattern]
                 (repeat "string"))
         (zipmap [:exclusiveMaximum :exclusiveMinimum :maximum :minimum :multipleOf]
                 (repeat "number"))))

(def ^:private null-neutral-keys
  "JSON Schema keywords that never reject a `null`: annotations, and assertions that apply only to another type."
  (into annotation-keys (keys keyword-types)))

(def ^:private type-array-keys
  "JSON Schema keywords a schema can carry and still take `null` into its `:type`: [[null-neutral-keys]], the `:type`
  itself, and an `:enum`, which `null` joins."
  (conj null-neutral-keys :type :enum))

(defn- types
  "The types the `:type` of JSON Schema `schema` names, as a vector, or nil when it has none."
  [{:keys [type]}]
  (cond
    (string? type)     [type]
    (sequential? type) (vec type)))

(defn- value-type
  "The type of the values a JSON Schema `type` describes, for telling which types overlap and which keywords apply."
  [type]
  ;; every integer is a number
  (if (= "integer" type) "number" type))

(defn- union->type-array
  "A JSON Schema with a type array that accepts what the `anyOf` `branches` accept, or nil when no type array can.
  Each branch must name its own types, no two branches' overlapping, and assert only [[keyword-types]] keywords that
  apply to those types.
  A branch may carry a string `:description`, which is joined, but no other annotation, since the type array would
  lose it."
  [branches]
  (let [branch-types (map types branches)
        own-keyword? (fn [branch k]
                       (contains? (set (map value-type (types branch))) (keyword-types k)))]
    (when (and (seq branches)
               (every? seq branch-types)
               (apply distinct? (map value-type (apply concat branch-types)))
               ;; a localized description is translated when it is serialized, so joining it here would fix the
               ;; locale of whoever builds the cached manifest first
               (every? (comp (some-fn nil? string?) :description) branches)
               (every? (fn [branch]
                         (every? #(own-keyword? branch %) (remove #{:type :description} (keys branch))))
                       branches))
      (let [description (str/join " " (keep :description branches))]
        (-> (apply merge (map #(apply dissoc % :type annotation-keys) branches))
            (assoc :type (into [] cat branch-types))
            (cond-> (not (str/blank? description)) (assoc :description description)))))))

(defn- flatten-union
  "The JSON Schema `schema` with an `anyOf` beside only annotations replaced by its [[union->type-array]], joining the
  descriptions, or `schema` itself when there is no such union."
  [{:keys [anyOf description] :as schema}]
  (or (when (and anyOf
                 (every? annotation-keys (keys (dissoc schema :anyOf)))
                 ((some-fn nil? string?) description))
        (when-let [union (union->type-array anyOf)]
          (let [descriptions (remove str/blank? [description (:description union)])]
            (cond-> (merge (dissoc schema :anyOf :description) (dissoc union :description))
              (seq descriptions) (assoc :description (str/join " " descriptions))))))
      schema))

(defn- nullable
  "The JSON Schema accepting `null` or whatever JSON Schema `schema` accepts.
  Where `schema`, or its [[flatten-union]], has a `:type` and otherwise only [[type-array-keys]], returns it with
  `null` added to that type and to any `:enum`.
  Otherwise returns `{:anyOf [schema {:type \"null\"}]}`, with `schema`'s description moved up beside the `anyOf`."
  [schema]
  ;; A coercing client tries `anyOf` branches in order and coerces into the first one it can, so an explicit `null`
  ;; becomes `0`, `false` or `""` there; a type array keeps it `null`.
  (let [flat       (flatten-union schema)
        type-names (types flat)]
    ;; any other keyword (`const`, `not`, `$ref`, a branch or a conditional) may reject the `null` a type array admits
    (if (and (seq type-names)
             (every? type-array-keys (keys flat)))
      (cond-> (assoc flat :type (vec (distinct (conj type-names "null"))))
        ;; an enum rejects a `null` it does not list
        (:enum flat) (update :enum #(vec (distinct (conj (vec %) nil)))))
      (cond-> {:anyOf [(dissoc schema :description) {:type "null"}]}
        (:description schema) (assoc :description (:description schema))))))

(defn- one-of-replacement
  "What replaces the `oneOf` `branches`.
  For `[X {:type \"null\"}]`, Malli's rendering of `[:maybe X]`, returns [[nullable]] X.
  For any other branches, returns [[branches->any-of]]."
  [[x y :as branches]]
  (if (and (= 2 (count branches)) (= {:type "null"} y))
    (nullable x)
    (branches->any-of branches)))

(defn without-one-of
  "Rewrite every `oneOf` in a JSON Schema as its [[one-of-replacement]], keeping the keywords beside it as
  [[replace-one-of]] does.
  The OpenAPI pass uses [[any-of]] instead, which leaves `[:maybe X]` as an `anyOf` with a `null` branch."
  [json-schema]
  ;; A client validator that coerces types turns `false`, `0` and `""` into `null`, so a falsy value valid for X matches
  ;; both branches of a nullable `oneOf` and fails it, where an `anyOf` or a type array passes it.
  ;; Malli validates a branching schema when any branch passes, so `anyOf` says what Malli checks.
  ;; OpenAI rejects `oneOf` anywhere in a tool schema: in strict mode, and from GPT-6.2 without it too.
  ;; Only subschemas are visited: a `oneOf` key inside a `const`, `enum` or `default` value is data, and stays.
  (postwalk-schemas
   (fn [{branches :oneOf :as node}]
     (cond-> node
       branches (replace-one-of (one-of-replacement branches))))
   json-schema))

(defn- subschemas
  "The subschemas of the JSON Schema `node`."
  [node]
  (concat (vals (:properties node))
          (vals (:definitions node))
          (let [items (:items node)]
            (cond (map? items) [items] (sequential? items) items))
          (:prefixItems node)
          (filter map? [(:additionalProperties node) (:not node) (:if node) (:then node)])
          (:anyOf node)
          (:allOf node)
          (:oneOf node)))

(defn- undeclared-empty-schemas
  "The malli forms of the subschemas of `node` that accept anything without saying so with `:json-schema`."
  [node]
  (cond
    (not (map? node))    nil
    (declared? node)     nil
    (empty-schema? node) [(::form (meta node))]
    :else                (mapcat undeclared-empty-schemas (subschemas node))))

(defn- check-empty-schemas!
  [json-schema]
  (when-let [forms (seq (distinct (undeclared-empty-schemas json-schema)))]
    (throw (ex-info (str "These schemas compile to a JSON Schema that accepts anything; give each a :json-schema property: "
                         (pr-str forms))
                    {:forms forms})))
  json-schema)

(defn- update-schema-fields [definitions-path node]
  (if (map? node)
    (-> node
        any-of
        tuple-length
        (m/update-existing :description #(cond-> % (record? %) str))
        (m/update-existing :pattern str)
        (m/update-existing :$ref (fn [ref]
                                   (if-let [definition (ref-definition definitions-path ref)]
                                     (str definitions-path (definition-name definition))
                                     ref)))
        (m/update-existing :required stringify)
        (collapse-branches :allOf)
        (collapse-branches :anyOf)
        (m/update-existing :properties #(into (empty %) (map (fn [[k v]] [(u/qualified-name k) v])) %)))
    node))

(defn- segments
  "The `{:item :min :max}` runs a JSON Schema stands for inside a malli sequence schema, one item unless it is one itself."
  [json-schema]
  (or (::segments (meta json-schema))
      [{:item json-schema :min 1 :max 1}]))

(defn- sequence-schema
  "Compile the segments of a malli sequence schema to an array schema, checking only its leading items when JSON Schema
  cannot spell them, which needs a required prefix followed by either one optional item or one repeated item."
  [segs]
  (let [[required more]   (split-with #(= 1 (:min %) (:max %)) segs)
        [optional more]   (split-with #(and (= 0 (:min %)) (= 1 (:max %))) more)
        [repeated & more] more
        prefix            (mp/mapv :item (concat required optional))]
    (with-meta
     (if (or (seq more)
             (and (seq optional) repeated)
             (< 1 (count optional))
             (mp/some nil? (map :item segs)))
       (let [known (take-while some? (map :item required))]
         (cond-> {:type "array" :minItems (count known)}
           (seq known) (assoc :prefixItems (vec known))))
       (cond-> {:type     "array"
                :items    (if repeated (:item repeated) false)
                :minItems (+ (count required) (:min repeated 0))}
         (seq prefix)                 (assoc :prefixItems prefix)
         (nil? repeated)              (assoc :maxItems (count prefix))
         (some-> repeated :max some?) (assoc :maxItems (+ (count prefix) (:max repeated)))))
     {::segments segs})))

(defn- repeat-schema
  "Compile a malli repetition of `child` between `lo` and `hi` times, which repeats a single item only."
  [child lo hi]
  (sequence-schema [{:item (when-not (::segments (meta child)) child) :min lo :max hi}]))

(defn- entry-schema [child]
  (if (vector? child) (peek child) child))

(defn- malli-walker [schema path children options]
  (#'mjs/-json-schema-walker schema path children options))

(defn- registered-schema
  "Refer to a registered schema, splicing it into a sequence schema when it is one, as malli does, and inlining it when
  it accepts anything without saying so, so that an `:and` drops it as it drops an inline `:fn`."
  [schema path children options]
  (let [json-schema (malli-walker schema path children options)
        definitions (::mjs/definitions options)
        path        (::mjs/definitions-path options)
        name        (some->> (:$ref json-schema) (ref-definition path))
        definition  (some->> (get @definitions name) (postwalk-schemas (partial update-schema-fields path)))]
    (cond
      (and (empty-schema? definition) (not (declared? definition)))
      (do (swap! definitions dissoc name)
          definition)

      (::segments (meta definition))
      (with-meta json-schema {::segments (::segments (meta definition))})

      :else
      json-schema)))

(defn- default-schema
  "Compile `schema` as malli does, declared when it accepts anything because a child it wraps says so."
  [schema path children items options]
  (let [json-schema (malli-walker schema path children options)]
    (cond-> json-schema
      (and (empty-schema? json-schema) (mp/some declared? items)) (vary-meta assoc ::declared true))))

(defn- walker
  "Like malli's own JSON Schema walker, but compile its sequence schemas, which malli leaves empty."
  [schema path children options]
  (let [properties (mc/properties schema)
        items      (map entry-schema children)]
    (vary-meta
     (if (or (:json-schema properties) (= :any (mc/type schema)))
       (vary-meta (merge (mjs/select properties) (malli-walker schema path children options)) assoc ::declared true)
       (into (case (#(if (= 'some? %) :some %) (mc/type schema))
               ::mc/val     (first items)
               (::mc/schema :ref) (registered-schema schema path children options)
               (:cat :catn) (sequence-schema (into [] (mapcat segments) items))
               (:alt :altn) (sequence-schema [{:item (when-not (mp/some (comp ::segments meta) items)
                                                       {:anyOf (vec items)})
                                               :min  1
                                               :max  1}])
               :?           (repeat-schema (first items) 0 1)
               :*           (repeat-schema (first items) 0 nil)
               :+           (repeat-schema (first items) 1 nil)
               :repeat      (repeat-schema (first items) (:min properties 0) (:max properties))
               :some        {:not {:type "null"}}
               :time/local-date          {:type "string" :format "date"}
               :time/offset-date-time    {:type "string" :format "date-time"}
               (:time/local-time :time/offset-time :time/local-date-time :time/zoned-date-time :time/instant)
               {:type "string"}
               (default-schema schema path children items options))
             (mjs/select properties)))
     #(merge {::form (mc/form schema)} %))))

(defn- walk [schema options]
  (mc/walk schema walker options))

(mu/defn transform :- ::json-schema
  "Generate the JSON Schema of a Malli schema, with the definitions it refers to under `:definitions`."
  ([schema :- ::malli-schema]
   (transform schema {}))
  ([schema                             :- ::malli-schema
    {:keys [definitions-path]
     :or   {definitions-path default-definitions-path}} :- ::options]
   (let [definitions (atom {})
         options     {::mc/walk-entry-vals    true
                      ::mjs/definitions       definitions
                      ::mjs/definitions-path  definitions-path
                      ::mjs/transform         walk}
         json-schema (cond-> (walk schema options)
                       (seq @definitions) (assoc :definitions (mp/update-keys @definitions definition-name)))]
     (check-empty-schemas! (postwalk-schemas (partial update-schema-fields definitions-path) json-schema)))))

(defn- branch-tag
  "The constant first item of the array schema `branch` resolves to through `definitions`, if there is one."
  [definitions-path definitions branch]
  (loop [branch branch, depth 0]
    (if-let [ref (and (< depth 8) (:$ref branch))]
      (recur (get definitions (ref-definition definitions-path ref)) (inc depth))
      (when (map? branch)
        (or (some-> branch :prefixItems first :const)
            (mp/some #(branch-tag definitions-path definitions %) (:allOf branch)))))))

(defn- tag-dispatch
  [definitions-path definitions node]
  (let [branches (when (map? node) (:anyOf node))
        tags     (map #(branch-tag definitions-path definitions %) branches)]
    (if (and (< 1 (count branches)) (mp/every? some? tags) (apply distinct? tags))
      (-> node
          (dissoc :anyOf)
          (update :allOf (fnil into [])
                  (cons {:type "array" :minItems 1 :prefixItems [{:enum (vec tags)}]}
                        (map (fn [tag branch] {:if {:type "array" :prefixItems [{:const tag}]} :then branch}) tags branches))))
      node)))

(mu/defn dispatch-on-tag :- ::json-schema
  "Make validators check only the branch of an `anyOf` of tagged clauses whose tag matches, like malli's `:multi` does."
  ([json-schema :- ::json-schema]
   (dispatch-on-tag json-schema {}))
  ([json-schema                        :- ::json-schema
    {:keys [definitions-path]
     :or   {definitions-path default-definitions-path}} :- ::options]
   (postwalk-schemas (partial tag-dispatch definitions-path (:definitions json-schema)) json-schema)))
