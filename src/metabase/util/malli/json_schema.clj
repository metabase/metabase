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

(defn- collapse-branches
  "Drop the empty branches malli emits for `:fn` schemas, and unwrap a branching node that has one branch left."
  [schema k]
  (let [schema (update schema k (partial remove mp/empty?))]
    (case (count (k schema))
      1 (merge (dissoc schema k) (first (k schema)))
      0 (dissoc schema k)
      schema)))

(defn- stringify [required]
  (if (sequential? required)
    (map u/qualified-name required)
    required))

(defn- tuple-length
  "Require every item of a malli `:tuple`, which JSON Schema's `prefixItems` leaves optional."
  [node]
  (cond-> node
    (and (:prefixItems node) (false? (:items node)) (not (:minItems node)))
    (assoc :minItems (count (:prefixItems node)))))

(defn- any-of
  "Malli's branching schemas pass when any branch does, so a `oneOf` whose branches overlap is an `anyOf`."
  [node]
  (if-let [branches (:oneOf node)]
    (-> node (dissoc :oneOf) (update :anyOf #(concat % branches)))
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

(defn- postwalk-schemas
  "Apply `f` to every subschema of the JSON Schema `node`, children first, leaving property names and values alone."
  [f node]
  (if-not (map? node)
    node
    (let [walk     #(postwalk-schemas f %)
          walk-all #(mp/mapv walk %)]
      (f (cond-> node
           (map? (:properties node))           (update :properties update-vals walk)
           (map? (:definitions node))          (update :definitions update-vals walk)
           (map? (:items node))                (update :items walk)
           (sequential? (:items node))         (update :items walk-all)
           (sequential? (:prefixItems node))   (update :prefixItems walk-all)
           (map? (:additionalProperties node)) (update :additionalProperties walk)
           (sequential? (:anyOf node))         (update :anyOf walk-all)
           (sequential? (:allOf node))         (update :allOf walk-all)
           (sequential? (:oneOf node))         (update :oneOf walk-all)
           (map? (:not node))                  (update :not walk)
           (map? (:if node))                   (update :if walk)
           (map? (:then node))                 (update :then walk))))))

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
  cannot spell them, which needs a required prefix followed by either optional items or one repeated item."
  [segs]
  (let [[required more]   (split-with #(= 1 (:min %) (:max %)) segs)
        [optional more]   (split-with #(and (= 0 (:min %)) (= 1 (:max %))) more)
        [repeated & more] more
        prefix            (mp/mapv :item (concat required optional))]
    (with-meta
      (if (or (seq more)
              (and (seq optional) repeated)
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
  "Refer to a schema registered by keyword, which malli splices into a sequence schema when it is one itself."
  [schema path children options]
  (let [json-schema (malli-walker schema path children options)
        definition  (some->> (:$ref json-schema) (ref-definition (::mjs/definitions-path options)))]
    (if-let [segs (some-> (get @(::mjs/definitions options) definition) meta ::segments)]
      (with-meta json-schema {::segments segs})
      json-schema)))

(defn- walker
  "Like malli's own JSON Schema walker, but compile its sequence schemas, which malli leaves empty."
  [schema path children options]
  (let [properties (mc/properties schema)
        items      (map entry-schema children)]
    (if (:json-schema properties)
      (malli-walker schema path children options)
      (into (case (mc/type schema)
              ::mc/val     (first items)
              ::mc/schema  (registered-schema schema path children options)
              (:cat :catn) (sequence-schema (into [] (mapcat segments) items))
              (:alt :altn) (sequence-schema [{:item (when-not (mp/some (comp ::segments meta) items)
                                                      {:anyOf (vec items)})
                                              :min  1
                                              :max  1}])
              :?           (repeat-schema (first items) 0 1)
              :*           (repeat-schema (first items) 0 nil)
              :+           (repeat-schema (first items) 1 nil)
              :repeat      (repeat-schema (first items) (:min properties 0) (:max properties))
              (malli-walker schema path children options))
            (mjs/select properties)))))

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
     (postwalk-schemas (partial update-schema-fields definitions-path) json-schema))))

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
                        (map (fn [tag branch] {:if {:prefixItems [{:const tag}]} :then branch}) tags branches))))
      node)))

(mu/defn dispatch-on-tag :- ::json-schema
  "Make validators check only the branch of an `anyOf` of tagged clauses whose tag matches, like malli's `:multi` does."
  ([json-schema :- ::json-schema]
   (dispatch-on-tag json-schema {}))
  ([json-schema                        :- ::json-schema
    {:keys [definitions-path]
     :or   {definitions-path default-definitions-path}} :- ::options]
   (postwalk-schemas (partial tag-dispatch definitions-path (:definitions json-schema)) json-schema)))
