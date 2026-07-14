(ns metabase.util.malli.typescript.schema
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.registry :as mregistry]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.type :as type]))

(defn result
  "Return a schema compilation result for `type-node`."
  [type-node]
  {:type type-node
   :registry-refs #{}
   :local-definitions {}
   :diagnostics []})

(defn- merge-result-metadata
  [results]
  {:registry-refs (into #{} (mapcat :registry-refs) results)
   :local-definitions (apply merge (map :local-definitions results))
   :diagnostics (into [] (mapcat :diagnostics) results)})

(defn- with-type
  [type-node results]
  (assoc (merge-result-metadata results) :type type-node))

(defn- unknown-result
  ([schema]
   (unknown-result schema :unsupported-schema))
  ([schema diagnostic-type]
   (assoc (result (type/unknown))
          :diagnostics [{:type diagnostic-type, :schema schema}])))

(defn- ref-result
  [schema-keyword]
  (assoc (result (type/ref-type schema-keyword))
         :registry-refs #{schema-keyword}))

(defn- fn-schema-props
  [form]
  (when (and (vector? form)
             (= :fn (first form))
             (map? (second form)))
    (second form)))

(defn- explicit-predicate-type
  [form]
  (when (and (vector? form) (= :fn (first form)))
    (:typescript (fn-schema-props form))))

(defn- unrepresentable-predicate-fn-schema-form?
  [form]
  (and (vector? form)
       (= :fn (first form))
       (not (explicit-predicate-type form))))

(declare sanitize-predicate-fn-constraints)

(defn- schema-form-parts
  [form]
  (let [schema-type (first form)
        body        (rest form)
        props       (when (map? (first body)) (first body))
        children    (if props (rest body) body)]
    {:schema-type schema-type
     :props       props
     :children    children}))

(defn- with-schema-form-parts
  [{:keys [schema-type props children]}]
  (into (cond-> [schema-type] props (conj props)) children))

(defn- sanitize-entry
  [entry]
  (cond
    (and (vector? entry) (= 3 (count entry)))
    (update entry 2 sanitize-predicate-fn-constraints)

    (and (vector? entry) (= 2 (count entry)))
    (update entry 1 sanitize-predicate-fn-constraints)

    :else
    entry))

(defn- sanitize-intersection-like-schema
  [form]
  (let [{:keys [children] :as parts} (schema-form-parts form)
        sanitized-children          (map sanitize-predicate-fn-constraints children)
        structural                  (remove unrepresentable-predicate-fn-schema-form? sanitized-children)]
    (if (= (count structural) (count children))
      (with-schema-form-parts (assoc parts :children sanitized-children))
      (if (seq structural)
        (with-schema-form-parts (assoc parts :children structural))
        :any))))

(defn sanitize-predicate-fn-constraints
  "Return a Malli form that does not require evaluating unrepresentable predicate functions."
  [schema]
  (cond
    (explicit-predicate-type schema)
    [:any {:typescript (explicit-predicate-type schema)}]

    (unrepresentable-predicate-fn-schema-form? schema)
    :any

    (vector? schema)
    (let [{:keys [schema-type children] :as parts} (schema-form-parts schema)]
      (case schema-type
        (:and :merge)
        (sanitize-intersection-like-schema schema)

        :map
        (with-schema-form-parts (assoc parts :children (map sanitize-entry children)))

        (:orn :multi :catn :altn)
        (with-schema-form-parts (assoc parts :children (map sanitize-entry children)))

        (:or :vector :sequential :set :map-of :tuple :cat :repeat :* :+ :? :maybe :schema :=> :function :alt)
        (with-schema-form-parts (assoc parts :children (map sanitize-predicate-fn-constraints children)))

        schema))

    :else
    schema))

(defn- camel-case-key
  [s]
  (let [s     (if (str/ends-with? s "?")
                (str "is-" (str/replace s #"\?$" ""))
                s)
        parts (remove str/blank? (str/split s #"[-_\s]+"))]
    (if (seq parts)
      (str (first parts)
           (apply str (map str/capitalize (rest parts))))
      s)))

(defn- transformed-map-key
  [key key-transform]
  (case key-transform
    :camelCase (if (keyword? key)
                 (camel-case-key (name key))
                 (str key))
    (if (keyword? key) (name key) (str key))))

(defn- quoted-property-name
  [s]
  (if (re-matches #"[A-Za-z_$][\w$]*" s)
    s
    (pr-str s)))

(def ^:private number-schema-types
  #{:int :double :> :>= :< :<=
    'pos-int? 'nat-int? 'neg-int? 'int 'int? 'integer? 'number? 'decimal?
    'pos? 'neg? 'zero? 'double 'double? 'float 'float?})

(def ^:private string-schema-types
  #{:string :keyword :qualified-keyword :symbol :qualified-symbol :uuid :uri :re
    'string? 'ident? 'simple-ident? 'qualified-ident? 'keyword? 'simple-keyword?
    'qualified-keyword? 'symbol 'symbol? 'simple-symbol? 'qualified-symbol? 'uuid
    'uuid? 'char? 'bytes?})

(def ^:private boolean-schema-types
  #{:boolean 'boolean 'boolean?})

(def ^:private time-schema-types
  #{:time/local-date :time/local-time :time/offset-time :time/local-date-time
    :time/offset-date-time :time/zoned-date-time})

(defn- unknown-node?
  [node]
  (= :unknown (:kind node)))

(defn- unknown-array-node?
  [node]
  (and (= :array (:kind node))
       (unknown-node? (:element node))))

(defn- union-type
  [nodes]
  (type/union nodes))

(defn- intersection-type
  [nodes]
  (let [known (vec (remove #(or (unknown-node? %) (unknown-array-node? %)) nodes))]
    (cond
      (seq known)                       (type/intersection known)
      (some unknown-array-node? nodes) (type/array (type/unknown))
      :else                             (type/unknown))))

(declare schema->result*)

(defn- compile-children
  [children options]
  (mapv #(schema->result* % options) children))

(defn- repeated-result
  [child-result min-count]
  (let [child-type (:type child-result)]
    (assoc child-result
           :type (if (pos? min-count)
                   (type/tuple (vec (repeat min-count child-type)) child-type)
                   (type/array child-type)))))

(defn- map-result
  [malli-schema options]
  (let [closed?   (true? (:closed (mc/properties malli-schema)))
        properties
        (mapv (fn [[key entry-options value-schema]]
                (let [value-result (schema->result* value-schema options)
                      final-key    (transformed-map-key key (:key-transform options))]
                  {:property {:source-key key
                              :final-key final-key
                              :name (quoted-property-name final-key)
                              :type (:type value-result)
                              :optional? (:optional entry-options)}
                   :result value-result}))
              (mc/children malli-schema))
        value-results (mapv :result properties)
        raw-properties (mapv :property properties)
        final-keys     (vec (distinct (map :final-key raw-properties)))
        grouped        (group-by :final-key raw-properties)
        property-nodes
        (mapv (fn [final-key]
                (let [colliding (get grouped final-key)]
                  {:source-key (:source-key (first colliding))
                   :name (:name (first colliding))
                   :type (type/union (mapv :type colliding))
                   :optional? (every? :optional? colliding)}))
              final-keys)
        collision-diagnostics
        (into []
              (keep (fn [final-key]
                      (let [colliding (get grouped final-key)]
                        (when (< 1 (count colliding))
                          {:type :map-key-collision
                           :final-key final-key
                           :source-keys (mapv :source-key colliding)}))))
              final-keys)
        index-signature (when-not closed?
                          {:key (type/primitive "string")
                           :value (type/unknown)})]
    (update (with-type (type/object property-nodes index-signature) value-results)
            :diagnostics into collision-diagnostics)))

(defn- map-of-key-result
  [key-schema options]
  (let [schema-type (mc/type (mc/schema key-schema))]
    (cond
      (contains? #{:string :keyword :qualified-keyword :symbol :qualified-symbol :uuid :uri :re} schema-type)
      (result (type/primitive "string"))

      (contains? #{:int :double} schema-type)
      (result (type/primitive "number"))

      (= :enum schema-type)
      (schema->result* key-schema options)

      :else
      (result (type/primitive "string")))))

(defn- map-of-result
  [malli-schema options]
  (let [[key-schema value-schema] (mc/children malli-schema)
        key-result (map-of-key-result key-schema options)
        value-result (schema->result* value-schema options)
        record-type (type/generic "Record" [(:type key-result) (:type value-result)])
        map-type (if (= :enum (mc/type (mc/schema key-schema)))
                   (type/generic "Partial" [record-type])
                   record-type)]
    (with-type map-type [key-result value-result])))

(defn- catn-child-schema
  [child]
  (if (= 3 (count child)) (nth child 2) (nth child 1)))

(defn- catn-child-name
  [child]
  (first child))

(defn- fragment
  ([]
   (fragment [] nil))
  ([items rest-type]
   {:items (vec items), :rest rest-type}))

(defn- seqex-result
  [alternatives results]
  (assoc (merge-result-metadata results) :alternatives (vec alternatives)))

(defn- normalize-seqex-item-type
  [type-node]
  (if (and (= :object (:kind type-node))
           (empty? (:properties type-node))
           (:index-signature type-node))
    (type/generic "Record" [(get-in type-node [:index-signature :key])
                            (get-in type-node [:index-signature :value])])
    type-node))

(defn- scalar-seqex-result
  [schema options]
  (let [compiled (schema->result* schema options)]
    (assoc (dissoc compiled :type)
           :alternatives [(fragment [{:type (normalize-seqex-item-type (:type compiled))}] nil)])))

(defn- concat-fragments
  [left right]
  (cond
    (and (:rest left) (or (seq (:items right)) (:rest right)))
    (fragment (conj (into (:items left) (:items right)) {:type (type/unknown)})
              (:rest right))

    :else
    (fragment (into (:items left) (:items right))
              (or (:rest right) (:rest left)))))

(defn- concatenate-alternatives
  [left right]
  (vec (for [left-fragment left
             right-fragment right]
         (concat-fragments left-fragment right-fragment))))

(declare seqex-result*)

(defn- cat-seqex-result
  [children options named?]
  (let [child-results
        (mapv (fn [child]
                (let [child-name   (when named? (catn-child-name child))
                      child-schema (if named? (catn-child-schema child) child)
                      child-result (seqex-result* child-schema options)]
                  (if child-name
                    (update child-result :alternatives
                            (fn [alternatives]
                              (mapv (fn [alternative]
                                      (if (seq (:items alternative))
                                        (update-in alternative [:items 0]
                                                   assoc :name (name child-name))
                                        alternative))
                                    alternatives)))
                    child-result)))
              children)
        alternatives (reduce concatenate-alternatives
                             [(fragment)]
                             (map :alternatives child-results))]
    (seqex-result alternatives child-results)))

(defn- repeated-seqex-result
  [child properties default-min options]
  (let [child-result (seqex-result* child options)
        min-count    (long (or (:min properties) default-min 0))
        alternatives
        (mapv (fn [child-fragment]
                (if (and (= 1 (count (:items child-fragment)))
                         (nil? (:rest child-fragment)))
                  (let [item      (first (:items child-fragment))
                        item-type (:type item)]
                    (fragment (vec (repeat min-count item)) item-type))
                  (let [required-items (vec (mapcat :items (repeat min-count child-fragment)))]
                    (fragment required-items (type/unknown)))))
              (:alternatives child-result))]
    (assoc child-result :alternatives alternatives)))

(defn- seqex-result*
  [schema options]
  (let [malli-schema (mc/schema schema)
        schema-type  (mc/type malli-schema)
        properties   (mc/properties malli-schema)
        children     (mc/children malli-schema)]
    (case schema-type
      :cat  (cat-seqex-result children options false)
      :catn (cat-seqex-result children options true)

      :alt
      (let [results (mapv #(seqex-result* % options) children)]
        (seqex-result (mapcat :alternatives results) results))

      :altn
      (let [results (mapv #(seqex-result* (catn-child-schema %) options) children)]
        (seqex-result (mapcat :alternatives results) results))

      :?
      (let [child-result (seqex-result* (first children) options)]
        (assoc child-result
               :alternatives (into [(fragment)] (:alternatives child-result))))

      :*
      (repeated-seqex-result (first children) properties 0 options)

      :+
      (repeated-seqex-result (first children) properties 1 options)

      :repeat
      (repeated-seqex-result (first children) properties 0 options)

      (scalar-seqex-result schema options))))

(defn- fragment->tuple
  [{:keys [items rest]}]
  (type/tuple (mapv #(select-keys % [:type :optional?]) items) rest))

(defn seqex->alternatives
  "Compile a Malli sequence expression into alternative flat tuple nodes."
  ([schema]
   (seqex->alternatives schema {}))
  ([schema options]
   (mapv fragment->tuple
         (:alternatives (seqex-result* schema
                                       (merge {:argument-context? false
                                               :key-transform nil
                                               :registry {}
                                               :seen #{}}
                                              options))))))

(defn- seqex-type-result
  [schema options]
  (let [compiled (seqex-result* schema options)]
    (assoc (dissoc compiled :alternatives)
           :type (type/union (mapv fragment->tuple (:alternatives compiled))))))

(defn- parameters-from-alternatives
  [alternatives]
  (let [alternative-count (count alternatives)
        item-count        (apply max 0 (map (comp count :items) alternatives))
        parameters
        (mapv (fn [index]
                (let [items (keep #(nth (:items %) index nil) alternatives)
                      names (keep :name items)]
                  {:name (or (first names) (str "arg" index))
                   :type (type/union (mapv :type items))
                   :optional? (< (count items) alternative-count)}))
              (range item-count))
        rest-types (keep :rest alternatives)]
    (cond-> parameters
      (seq rest-types)
      (conj {:name (str "arg" item-count)
             :type (if (= (count rest-types) alternative-count)
                     (type/union (vec rest-types))
                     (type/unknown))
             :rest? true}))))

(defn- function-result
  [malli-schema options]
  (let [[args-schema return-schema] (mc/children malli-schema)
        args-result   (seqex-result* args-schema (assoc options :argument-context? true))
        parameters    (parameters-from-alternatives (:alternatives args-result))
        return-result (schema->result* return-schema (assoc options :argument-context? false))]
    (assoc (merge-result-metadata [args-result return-result])
           :type (type/function-type parameters (:type return-result)))))

(defn- registry-ref-result
  [schema-keyword options]
  (if-let [[_ local-schema] (find (:registry options) schema-keyword)]
    (if (:key-transform options)
      (schema->result* local-schema options)
      (assoc (ref-result schema-keyword)
             :local-definitions {schema-keyword local-schema}))
    (if (:key-transform options)
      (schema->result* (mr/resolve-schema schema-keyword) options)
      (ref-result schema-keyword))))

(defn- explicit-type
  [typescript]
  (if (= "unknown" typescript)
    (type/unknown)
    (type/raw typescript)))

(defn- effective-key-transform
  [properties options]
  (if (contains? properties :ts/key-transform)
    (when-not (= :none (:ts/key-transform properties))
      (:ts/key-transform properties))
    (:key-transform options)))

(defn- any-result
  [malli-schema options]
  (let [{:keys [typescript ts/array-of ts/object-of ts/ref ts/promise-of ts/instance-of] :as properties}
        (mc/properties malli-schema)
        nested-options (assoc options :key-transform (effective-key-transform properties options))]
    (cond
      typescript
      (result (explicit-type typescript))

      array-of
      (let [child-result (schema->result* array-of options)]
        (assoc child-result :type (type/array (:type child-result))))

      object-of
      (schema->result* object-of nested-options)

      ref
      (registry-ref-result ref nested-options)

      promise-of
      (let [child-result (schema->result* promise-of options)]
        (assoc child-result :type (type/generic "Promise" [(:type child-result)])))

      (= instance-of "Array")
      (result (type/array (type/unknown)))

      (= instance-of "Object")
      (result (type/generic "Record" [(type/primitive "string") (type/unknown)]))

      :else
      (unknown-result (mc/form malli-schema) :weak-schema))))

(defn- literal-result
  [value]
  (result
   (type/literal
    (if (qualified-keyword? value)
      (str (namespace value) "/" (name value))
      (if (keyword? value) (name value) value)))))

(defn- multi-child-schema
  [child]
  (if (and (vector? child) (<= 2 (count child)))
    (peek child)
    child))

(defn- compile-malli-schema
  [malli-schema options]
  (let [schema-type (mc/type malli-schema)
        properties  (mc/properties malli-schema)
        children    (mc/children malli-schema)
        form        (mc/form malli-schema)]
    (cond
      (contains? number-schema-types schema-type)
      (result (type/primitive "number"))

      (contains? string-schema-types schema-type)
      (result (type/primitive "string"))

      (contains? boolean-schema-types schema-type)
      (result (type/primitive "boolean"))

      (contains? time-schema-types schema-type)
      (result (type/primitive "string"))

      (= schema-type :nil)
      (result (type/primitive "null"))

      (contains? #{'nil? 'nil} schema-type)
      (result (type/primitive "null"))

      (contains? #{'true? 'true} schema-type)
      (result (type/literal true))

      (contains? #{'false? 'false} schema-type)
      (result (type/literal false))

      (contains? #{'seqable? 'coll? 'some? 'ifn? 'fn? 'any? 'associative?} schema-type)
      (unknown-result form :weak-schema)

      (contains? #{'sequential? 'indexed? 'vector 'vector? 'seq? 'list? 'seq} schema-type)
      (result (type/array (type/unknown)))

      (contains? #{'map? 'associative?} schema-type)
      (result (type/generic "Record" [(type/primitive "string") (type/unknown)]))

      (contains? #{'set? 'set} schema-type)
      (result (type/generic "Set" [(type/unknown)]))

      (= schema-type :any)
      (any-result malli-schema options)

      (= schema-type :map)
      (map-result malli-schema options)

      (= schema-type :map-of)
      (map-of-result malli-schema options)

      (= schema-type :enum)
      (let [results (mapv literal-result children)]
        (with-type (type/union (mapv :type results)) results))

      (= schema-type :=)
      (literal-result (first children))

      (= schema-type :or)
      (let [results (compile-children children options)]
        (with-type (union-type (mapv :type results)) results))

      (= schema-type :orn)
      (let [results (mapv #(schema->result* (catn-child-schema %) options) children)]
        (with-type (union-type (mapv :type results)) results))

      (= schema-type :multi)
      (let [results (mapv #(schema->result* (multi-child-schema %) options) children)]
        (with-type (union-type (mapv :type results)) results))

      (contains? #{:and :merge} schema-type)
      (let [results (compile-children children options)]
        (with-type (intersection-type (mapv :type results)) results))

      (= schema-type :maybe)
      (let [child-result (schema->result* (first children) options)
            members (cond-> [(:type child-result)]
                      (:argument-context? options) (conj (type/primitive "undefined"))
                      true (conj (type/primitive "null")))]
        (assoc child-result :type (type/union members)))

      (contains? #{:vector :sequential} schema-type)
      (let [child-result (schema->result* (first children) options)
            min-count    (long (or (:min properties) 0))]
        (repeated-result child-result min-count))

      (= schema-type :set)
      (let [child-result (schema->result* (first children) options)]
        (assoc child-result :type (type/generic "Set" [(:type child-result)])))

      (= schema-type :tuple)
      (let [results (compile-children children options)]
        (with-type (type/tuple (mapv :type results)) results))

      (contains? #{:cat :catn :alt :altn} schema-type)
      (seqex-type-result malli-schema options)

      (contains? #{:* :+ :repeat} schema-type)
      (let [child-result (schema->result* (first children) options)
            min-count    (long (or (:min properties)
                                   (when (= :+ schema-type) 1)
                                   0))]
        (repeated-result child-result min-count))

      (= schema-type :?)
      (let [child-result (schema->result* (first children) options)]
        (assoc child-result :type (type/union [(:type child-result)
                                               (type/primitive "undefined")])))

      (= schema-type :schema)
      (let [local-registry (:registry properties)
            child-form     (last form)]
        (schema->result* child-form
                         (update options :registry merge local-registry)))

      (= schema-type :=>)
      (function-result malli-schema options)

      (= schema-type :function)
      (let [results (compile-children children options)]
        (with-type (type/union (mapv :type results)) results))

      (= schema-type :fn)
      (if-let [typescript (:typescript properties)]
        (result (explicit-type typescript))
        (unknown-result form :predicate-schema))

      (= schema-type :ref)
      (registry-ref-result (first children) options)

      (= schema-type :malli.core/schema)
      (registry-ref-result form options)

      (:typescript properties)
      (result (explicit-type (:typescript properties)))

      (qualified-keyword? schema-type)
      (registry-ref-result schema-type options)

      :else
      (unknown-result form))))

(defn- parse-schema
  [schema registry]
  (if (seq registry)
    (mc/schema schema
               {:registry (mregistry/composite-registry
                           (mregistry/fast-registry registry)
                           mc/default-registry)})
    (mc/schema schema)))

(defn- schema->result*
  [schema options]
  (let [identity-key (if (mc/schema? schema) (mc/form schema) schema)]
    (cond
      (and (qualified-keyword? schema)
           (contains? (:registry options) schema))
      (registry-ref-result schema options)

      (contains? (:seen options) identity-key)
      (unknown-result identity-key :recursive-expansion)

      :else
      (try
        (compile-malli-schema
         (parse-schema schema (:registry options))
         (update options :seen (fnil conj #{}) identity-key))
        (catch Exception exception
          (assoc (unknown-result identity-key :invalid-schema)
                 :diagnostics [{:type :invalid-schema
                                :schema identity-key
                                :message (ex-message exception)}]))))))

(defn schema->result
  "Compile a Malli schema into a TypeScript IR result.

  Options can include `:argument-context?`, `:key-transform`, `:registry`, and
  renderer-independent compiler state."
  ([schema]
   (schema->result schema {}))
  ([schema options]
   (schema->result* (sanitize-predicate-fn-constraints schema)
                    (merge {:argument-context? false
                            :key-transform nil
                            :registry {}
                            :seen #{}}
                           options))))

(defn schema->ts
  "Compile a Malli schema and render its TypeScript type."
  ([schema]
   (schema->ts schema {}))
  ([schema {:keys [ref-name] :as options}]
   (let [compilation-options (dissoc options :ref-name)
         compiled            (schema->result schema compilation-options)]
     (type/render (:type compiled)
                  {:ref-name (or ref-name
                                 (fn [schema-keyword]
                                   (str (namespace schema-keyword) "/" (name schema-keyword))))}))))
