(ns metabase.util.malli.typescript.schema
  (:require
   [cljs.compiler :as comp]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.registry :as mregistry]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.type :as type]))

(set! *warn-on-reflection* true)

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
  (u/->camelCaseEn
   (if (str/ends-with? s "?")
     (str "is-" (str/replace s #"\?$" ""))
     s)))

(defn- transformed-map-key
  [key key-transform]
  (case key-transform
    :camelCase (if (or (keyword? key) (string? key))
                 (camel-case-key (if (keyword? key) (u/qualified-name key) key))
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
  #{:string :keyword :qualified-keyword :symbol :qualified-symbol :uuid :re
    'string? 'ident? 'simple-ident? 'qualified-ident? 'keyword? 'simple-keyword?
    'qualified-keyword? 'symbol 'symbol? 'simple-symbol? 'qualified-symbol? 'uuid
    'uuid? 'char?})

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

(defn- tuple-item-type
  [item]
  (if (and (map? item) (contains? item :type))
    (:type item)
    item))

(defn- repeated-type-members
  [type-node]
  (case (:kind type-node)
    :tuple (vec (concat (mapcat (comp repeated-type-members tuple-item-type) (:items type-node))
                        (some->> (:rest type-node) repeated-type-members)))
    :union (vec (mapcat repeated-type-members (:members type-node)))
    [type-node]))

(defn- repeated-result
  [child-result min-count composite-sequence?]
  (let [child-type (:type child-result)]
    (if composite-sequence?
      (-> child-result
          (assoc :type (type/array (type/union (repeated-type-members child-type))))
          (update :diagnostics conj {:type :composite-sequence-repetition}))
      (assoc child-result
             :type (if (pos? min-count)
                     (type/tuple (vec (repeat min-count child-type)) child-type)
                     (type/array child-type))))))

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

(defn- enum-property-key-values
  [key-schema]
  (let [form (mc/form (mc/schema key-schema))]
    (drop (if (map? (second form)) 2 1) form)))

(defn- finite-typescript-number?
  [value]
  (and (number? value)
       (not (ratio? value))
       (Double/isFinite (double value))))

(defn- typescript-property-key-value
  [value]
  (cond
    (symbol? value)  {:supported? true, :value (str value)}
    (or (string? value) (keyword? value)) {:supported? true, :value value}
    (finite-typescript-number? value)      {:supported? true, :value value}
    :else                                  {:supported? false}))

(defn- enum-map-key-result
  [key-schema]
  (let [key-values (mapv typescript-property-key-value
                         (enum-property-key-values key-schema))]
    (if (every? :supported? key-values)
      (result (type/union (mapv (comp type/literal :value) key-values)))
      (assoc (result (type/primitive "string"))
             :diagnostics [{:type :unsupported-map-key
                            :schema (mc/form (mc/schema key-schema))}]))))

(defn- map-of-key-result
  [key-schema options]
  (let [schema-type (mc/type (mc/schema key-schema))]
    (cond
      (contains? #{:string :keyword :qualified-keyword :symbol :qualified-symbol :uuid :re} schema-type)
      (result (type/primitive "string"))

      (contains? #{:int :double} schema-type)
      (result (type/primitive "number"))

      (= :enum schema-type)
      (enum-map-key-result key-schema)

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
  (name (first child)))

(defn- fragment
  ([]
   (fragment [] nil))
  ([items rest-type]
   {:items (vec items), :rest rest-type}))

(defn- fragment-member-types
  [{:keys [items rest widened-type]}]
  (cond-> (mapv :type items)
    rest (conj rest)
    widened-type (conj widened-type)))

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
  (if (or (:widened-type left)
          (and (:rest left) (or (seq (:items right)) (:rest right))))
    {:items []
     :rest nil
     :widened-type (type/union (into (fragment-member-types left)
                                     (fragment-member-types right)))}
    (fragment (into (:items left) (:items right))
              (or (:rest right) (:rest left)))))

(def ^:private sequence-alternative-limit 256)

(defn- concatenate-alternatives
  [left right]
  (when (<= (* (count left) (count right)) sequence-alternative-limit)
    (vec (for [left-fragment left
               right-fragment right]
           (concat-fragments left-fragment right-fragment)))))

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
        {:keys [alternatives limit-exceeded?]}
        (reduce (fn [{:keys [alternatives limit-exceeded?] :as state} child-result]
                  (if limit-exceeded?
                    state
                    (if-let [combined (concatenate-alternatives alternatives (:alternatives child-result))]
                      {:alternatives combined, :limit-exceeded? false}
                      {:alternatives [{:items [] :rest nil :widened-type (type/unknown)}]
                       :limit-exceeded? true})))
                {:alternatives [(fragment)], :limit-exceeded? false}
                child-results)
        non-trailing? (some :widened-type alternatives)]
    (cond-> (seqex-result alternatives child-results)
      limit-exceeded?
      (update :diagnostics conj {:type :sequence-alternative-limit-exceeded
                                 :limit sequence-alternative-limit})

      (and non-trailing? (not limit-exceeded?))
      (update :diagnostics conj {:type :non-trailing-sequence-repetition}))))

(defn- repeated-fragment-member-types
  [fragment]
  (mapcat repeated-type-members (fragment-member-types fragment)))

(defn- repeated-seqex-result
  [child properties default-min options]
  (let [child-result (seqex-result* child options)
        min-count    (long (or (:min properties) default-min 0))
        child-alternatives (:alternatives child-result)
        [only-child] child-alternatives
        [only-item] (:items only-child)
        scalar-child? (and (= 1 (count child-alternatives))
                           (= 1 (count (:items only-child)))
                           (nil? (:rest only-child))
                           (nil? (:widened-type only-child)))]
    (if scalar-child?
      (assoc child-result
             :alternatives [(fragment (vec (repeat min-count only-item)) (:type only-item))])
      (let [member-type (type/union (mapcat repeated-fragment-member-types child-alternatives))]
        (-> child-result
            (assoc :alternatives [{:items []
                                   :rest nil
                                   :widened-type member-type}])
            (update :diagnostics conj {:type :composite-sequence-repetition}))))))

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
  [{:keys [items rest widened-type]}]
  (if widened-type
    (type/array widened-type)
    (type/tuple (mapv #(select-keys % [:type :optional?]) items) rest)))

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

(def ^:private typescript-identifier-pattern
  #"[A-Za-z_$][\w$]*")

(defn- parameter-name
  [raw-name index used-names]
  (let [fallback (str "arg" index)
        munged   (some-> raw-name symbol comp/munge str)
        preferred (if (and munged (re-matches typescript-identifier-pattern munged))
                    munged
                    fallback)]
    (first (remove used-names
                   (concat [preferred fallback]
                           (map #(str fallback "_" %) (iterate inc 2)))))))

(defn- with-parameter-names
  [parameters]
  (:parameters
   (reduce-kv (fn [{:keys [used-names] :as acc} index parameter]
                (let [name (parameter-name (:name parameter) index used-names)]
                  (-> acc
                      (update :parameters conj (assoc parameter :name name))
                      (update :used-names conj name))))
              {:parameters [], :used-names #{}}
              parameters)))

(defn- parameters-from-alternatives
  [alternatives]
  (let [alternative-count (count alternatives)
        item-count        (apply max 0 (map (comp count :items) alternatives))
        parameters
        (mapv (fn [index]
                (let [items (keep #(nth (:items %) index nil) alternatives)
                      names (keep :name items)]
                  {:name (first names)
                   :type (type/union (mapv :type items))
                   :optional? (< (count items) alternative-count)}))
              (range item-count))
        rest-types (keep :rest alternatives)]
    (with-parameter-names
      (cond-> parameters
        (seq rest-types)
        (conj {:type (if (= (count rest-types) alternative-count)
                       (type/union (vec rest-types))
                       (type/unknown))
               :rest? true})))))

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

(defn- typescript-literal-value
  [value]
  (cond
    (qualified-keyword? value)       {:supported? true, :value (str (namespace value) "/" (name value))}
    (keyword? value)                 {:supported? true, :value (name value)}
    (string? value)                  {:supported? true, :value value}
    (char? value)                    {:supported? true, :value (str value)}
    (or (boolean? value) (nil? value)) {:supported? true, :value value}
    (finite-typescript-number? value)  {:supported? true, :value value}
    :else                              {:supported? false}))

(defn- literal-result
  [value]
  (let [{:keys [supported?] literal-value :value} (typescript-literal-value value)]
    (if supported?
      (result (type/literal literal-value))
      (unknown-result [:= value] :unsupported-literal))))

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
        (repeated-result child-result min-count false))

      (= schema-type :set)
      (let [child-result (schema->result* (first children) options)]
        (assoc child-result :type (type/generic "Set" [(:type child-result)])))

      (= schema-type :tuple)
      (let [results (compile-children children options)]
        (with-type (type/tuple (mapv :type results)) results))

      (contains? #{:cat :catn :alt :altn} schema-type)
      (seqex-type-result malli-schema options)

      (contains? #{:* :+ :repeat} schema-type)
      (let [child-schema (first children)
            child-result (schema->result* child-schema options)
            child-type   (mc/type (mc/schema child-schema))
            min-count    (long (or (:min properties)
                                   (when (= :+ schema-type) 1)
                                   0))]
        (repeated-result child-result
                         min-count
                         (contains? #{:cat :catn :alt :altn :* :+ :repeat :?}
                                    child-type)))

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

(defn- invalid-enum-map-key-form?
  [schema]
  (and (vector? schema)
       (= :map-of (first schema))
       (vector? (second schema))
       (= :enum (first (second schema)))
       (some nil? (rest (second schema)))))

(defn- schema->result*
  [schema options]
  (let [identity-key (if (mc/schema? schema) (mc/form schema) schema)]
    (cond
      (invalid-enum-map-key-form? schema)
      (let [value-result (schema->result* (last schema) options)]
        (-> (with-type (type/generic "Partial"
                                     [(type/generic "Record"
                                                    [(type/primitive "string") (:type value-result)])])
              [value-result])
            (update :diagnostics conj {:type :unsupported-map-key
                                       :schema (second schema)})))

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
