(ns metabase.util.malli.typescript.schema
  (:require
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
   :input-registry-refs #{}
   :local-definitions {}
   :diagnostics []})

(defn- merge-result-metadata
  [results]
  {:registry-refs (into #{} (mapcat :registry-refs) results)
   :input-registry-refs (into #{} (mapcat :input-registry-refs) results)
   :local-definitions (apply merge (map :local-definitions results))
   :diagnostics (into [] (mapcat :diagnostics) results)})

(defn- union-or-intersected-union?
  [type-node]
  (or (= :union (:kind type-node))
      (and (= :intersection (:kind type-node))
           (some #(= :union (:kind %)) (:members type-node)))))

(defn- with-type
  [type-node results]
  ;; `:multi-branches` must only survive when the parent type is itself the
  ;; (possibly widened) union or an intersection containing that union (e.g.,
  ;; `[:and Common [:multi ...]]`): `Extract<>` distributes across `(Common & (B1 | B2))`,
  ;; whereas arrays, tuples, and maps do not distribute and would yield `never`.
  (let [result (assoc (merge-result-metadata results) :type type-node)]
    (if (and (union-or-intersected-union? type-node)
             (some :multi-branches results))
      (assoc result :multi-branches (some :multi-branches results))
      (dissoc result :multi-branches))))

(defn- unknown-result
  ([schema]
   (unknown-result schema :unsupported-schema))
  ([schema diagnostic-type]
   (assoc (result (type/unknown))
          :diagnostics [{:type diagnostic-type, :schema schema}])))

(defn- ref-result
  ([schema-keyword]
   (ref-result schema-keyword false))
  ([schema-keyword input?]
   (cond-> (assoc (result (type/ref-type schema-keyword input?))
                  :registry-refs #{schema-keyword})
     input? (assoc :input-registry-refs #{schema-keyword}))))

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
       (not (or (contains? (fn-schema-props form) :typescript)
                (:ts/predicate-of (fn-schema-props form))))))

(declare sanitize-predicate-fn-constraints)

(defn map-schema-properties
  "Transform schemas contained in compiler properties, leaving other property values unchanged."
  [f properties]
  (let [properties (cond-> properties
                     (map? (:registry properties))
                     (update :registry #(update-vals % f))

                     (sequential? (:ts/overloads properties))
                     (update :ts/overloads #(mapv f %))

                     (contains? properties :ts/predicate-of)
                     (update :ts/predicate-of #(if (map? %)
                                                 (cond-> % (contains? % :schema) (update :schema f))
                                                 (f %))))]
    (reduce (fn [properties key]
              (cond-> properties
                (contains? properties key)
                (update key f)))
            properties
            [:ts/array-of :ts/object-of :ts/ref :ts/promise-of :ts/generic-bound])))

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
  (let [schema (cond-> schema
                 (and (vector? schema)
                      (map? (second schema))
                      (or (not (contains? #{:= :enum :fn} (first schema)))
                          (< 2 (count schema))))
                 (update 1 #(map-schema-properties sanitize-predicate-fn-constraints %)))]
    (cond
      (contains? (fn-schema-props schema) :typescript)
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
      schema)))

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

(def ^:private simple-camel-case-key-pattern
  "String keys the emitted `CamelCase` template-literal helper provably converts
  exactly like the runtime `u/->camelCaseEn` conversion: lowercase alphanumeric
  segments joined by `-`, `_`, or space, with an optional `?` suffix."
  #"^[a-z0-9]+(?:[-_ ][a-z0-9]+)*\??$")

(defn- raw-map-key-string
  "Return the un-transformed JavaScript-facing string for a map key."
  [key]
  (cond
    (keyword? key) (u/qualified-name key)
    (string? key)  key
    :else          nil))

(defn- camel-helper-applicable?
  "True when a closed map's keys can safely delegate their camelCase
  conversion to the emitted `CamelCase` template-literal helper. Keys outside
  the simple grammar, or keys that would collide after conversion, keep the
  exact inline expansion."
  [raw-keys closed? key-transform]
  (and (= :camelCase key-transform)
       closed?
       (seq raw-keys)
       (every? #(and (string? %) (re-matches simple-camel-case-key-pattern %)) raw-keys)
       (apply distinct? (mapv camel-case-key raw-keys))))

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

(defn- mark-container-readonly
  "Mark a container node readonly when immutable-boundary output is enabled."
  [node readonly?]
  (if readonly? (assoc node :readonly? true) node))

(defn- container-readonly?
  "Containers are marked immutable only for value positions; parameter types
  stay mutable so rest parameters remain valid TypeScript."
  [options]
  (and (:readonly? options) (not (:argument-context? options))))

(defn- dissoc-multi-branches-unless-union
  "Wrapping a multi in a non-union container invalidates `Extract<>` metadata."
  [result]
  (if (= :union (:kind (:type result)))
    result
    (dissoc result :multi-branches)))

(defn- repeated-result
  [child-result min-count composite-sequence? options]
  (let [child-type (:type child-result)
        readonly?  (container-readonly? options)]
    (if composite-sequence?
      (-> child-result
          (assoc :type (mark-container-readonly
                        (type/array (type/union (repeated-type-members child-type)))
                        readonly?))
          dissoc-multi-branches-unless-union
          (update :diagnostics conj {:type :composite-sequence-repetition}))
      (-> child-result
          (assoc :type (mark-container-readonly
                        (if (pos? min-count)
                          (type/tuple (vec (repeat min-count child-type)) child-type)
                          (type/array child-type))
                        readonly?))
          dissoc-multi-branches-unless-union))))

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
                           :value (type/unknown)})
        raw-keys       (map first (mc/children malli-schema))
        object-type    (mark-container-readonly
                        (type/object property-nodes index-signature)
                        (container-readonly? options))
        ;; Keys the emitted CamelCase helper provably converts exactly delegate
        ;; to `Camel<...>`; everything else keeps the exact inline expansion.
        camel-type     (when (camel-helper-applicable? raw-keys closed? (:key-transform options))
                         (mark-container-readonly
                          (type/key-transform-type
                           "Camel"
                           (type/object
                            (mapv (fn [property]
                                    (assoc property
                                           :name (quoted-property-name (raw-map-key-string (:source-key property)))))
                                  property-nodes)
                            nil))
                          (container-readonly? options)))]
    (update (with-type (if camel-type camel-type object-type) value-results)
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

(declare resolve-registry-schema parse-schema)

(defn- deref-key-schema
  [key-schema options seen]
  (let [malli-schema (try
                       (if (mc/schema? key-schema)
                         key-schema
                         (parse-schema key-schema (:registry options)))
                       (catch Exception _ nil))]
    (cond
      (nil? malli-schema)
      key-schema

      (= :ref (mc/type malli-schema))
      (let [ref-key (first (mc/children malli-schema))]
        (if (or (not (qualified-keyword? ref-key))
                (contains? seen ref-key))
          malli-schema
          (if-let [resolved (resolve-registry-schema ref-key options)]
            (recur resolved options (conj seen ref-key))
            malli-schema)))

      (and (= :malli.core/schema (mc/type malli-schema))
           (qualified-keyword? (mc/form malli-schema)))
      (let [ref-key (mc/form malli-schema)]
        (if (contains? seen ref-key)
          malli-schema
          (if-let [resolved (resolve-registry-schema ref-key options)]
            (recur resolved options (conj seen ref-key))
            malli-schema)))

      (and (= :schema (mc/type malli-schema))
           (map? (:registry (mc/properties malli-schema))))
      (let [local-registry (:registry (mc/properties malli-schema))
            child-form     (last (mc/form malli-schema))]
        (recur child-form (update options :registry merge local-registry) seen))

      :else
      malli-schema)))

(defn- finite-key-values
  "Return finite property-key values for direct literal/enum union forms, or nil.
  Other schemas remain open dictionaries rather than guessing their key domain."
  [schema options seen]
  (let [dereffed (deref-key-schema schema options seen)
        form     (if (mc/schema? dereffed) (mc/form dereffed) dereffed)]
    (when (vector? form)
      (let [{:keys [schema-type children]} (schema-form-parts form)]
        (case schema-type
          :enum children
          :=    [(first children)]
          :or   (let [alternatives (mapv #(finite-key-values % options seen) children)]
                  (when (every? some? alternatives)
                    (vec (mapcat identity alternatives))))
          nil)))))

(defn- finite-map-key-result
  [key-schema options]
  (when-let [values (finite-key-values key-schema options #{})]
    (let [key-values (mapv typescript-property-key-value values)]
      (when (every? :supported? key-values)
        (assoc (result (type/union (mapv (comp type/literal :value) key-values)))
               :finite? true)))))

(defn- map-of-key-result
  [key-schema options]
  (let [dereffed    (deref-key-schema key-schema options #{})
        schema-type (mc/type (mc/schema dereffed))]
    (cond
      (contains? #{:string :keyword :qualified-keyword :symbol :qualified-symbol :uuid :re} schema-type)
      (result (type/primitive "string"))

      (contains? #{:int :double} schema-type)
      (result (type/primitive "number"))

      (= :enum schema-type)
      (assoc (enum-map-key-result dereffed) :finite? true)

      :else
      (or (finite-map-key-result dereffed options)
          (result (type/primitive "string"))))))

(defn- map-of-result
  [malli-schema options]
  (let [[key-schema value-schema] (mc/children malli-schema)
        key-result (map-of-key-result key-schema options)
        value-result (schema->result* value-schema options)
        record-type (type/generic "Record" [(:type key-result) (:type value-result)])
        map-type (if (:finite? key-result)
                   (type/generic "Partial" [record-type])
                   record-type)]
    (with-type (mark-container-readonly map-type (container-readonly? options))
      [key-result value-result])))

(def ^:private typescript-identifier-pattern
  #"[A-Za-z_$][\w$]*")

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
          (:widened-type right)
          (and (:rest left) (or (seq (:items right)) (:rest right))))
    {:items []
     :rest nil
     :widened-type (type/union (into (fragment-member-types left)
                                     (fragment-member-types right)))
     :had-non-trailing-repetition? true}
    (cond-> (fragment (into (:items left) (:items right))
                      (or (:rest right) (:rest left)))
      (or (:had-non-trailing-repetition? left)
          (:had-non-trailing-repetition? right))
      (assoc :had-non-trailing-repetition? true))))

(defn- concat-prefix-and-suffix
  [prefix suffix]
  (if (and (nil? (:widened-type prefix))
           (nil? (:rest prefix))
           (seq (:items prefix))
           (:widened-type suffix))
    (assoc (fragment (:items prefix) (:widened-type suffix))
           :had-non-trailing-repetition? true)
    (concat-fragments prefix suffix)))

(def ^:private sequence-alternative-limit 256)

(defn- concatenate-alternatives
  ([left right]
   (concatenate-alternatives left right concat-fragments))
  ([left right combine-fn]
   (when (<= (* (count left) (count right)) sequence-alternative-limit)
     (vec (for [left-fragment left
                right-fragment right]
            (combine-fn left-fragment right-fragment))))))

(defn- effective-key-transform
  [properties options]
  (if (contains? properties :ts/key-transform)
    (when-not (= :none (:ts/key-transform properties))
      (:ts/key-transform properties))
    (:key-transform options)))

(declare seqex-result*)

(defn- typescript-tuple-item-name
  "Munge a `:catn` label into a valid TypeScript tuple-element name, or nil
  when no valid identifier results."
  [child-name]
  (let [munged (some-> child-name name symbol type/cljs-munge str)]
    (when (and munged (re-matches typescript-identifier-pattern munged))
      munged)))

(defn- fixed-items-only-result?
  [child-result]
  (every? (fn [{:keys [rest widened-type]}]
            (and (nil? rest) (nil? widened-type)))
          (:alternatives child-result)))

(defn- reduce-alternatives
  [child-results]
  (reduce (fn [{:keys [alternatives limit-exceeded?] :as state} child-result]
            (if limit-exceeded?
              state
              (if-let [combined (concatenate-alternatives alternatives (:alternatives child-result))]
                {:alternatives combined, :limit-exceeded? false}
                {:alternatives [{:items [] :rest nil :widened-type (type/unknown)}]
                 :limit-exceeded? true})))
          {:alternatives [(fragment)], :limit-exceeded? false}
          child-results))

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
                                      (if-let [item-name (typescript-tuple-item-name child-name)]
                                        (if (seq (:items alternative))
                                          (update-in alternative [:items 0]
                                                     assoc :name item-name)
                                          alternative)
                                        alternative))
                                    alternatives)))
                    child-result)))
              children)
        [prefix-results suffix-results] (split-with fixed-items-only-result? child-results)
        {:keys [alternatives limit-exceeded?]}
        (if (and (seq prefix-results) (seq suffix-results))
          (let [prefix-state (reduce-alternatives prefix-results)
                suffix-state (reduce-alternatives suffix-results)]
            (if (or (:limit-exceeded? prefix-state) (:limit-exceeded? suffix-state))
              {:alternatives [{:items [] :rest nil :widened-type (type/unknown)}]
               :limit-exceeded? true}
              (if-let [combined (concatenate-alternatives (:alternatives prefix-state)
                                                          (:alternatives suffix-state)
                                                          concat-prefix-and-suffix)]
                {:alternatives combined, :limit-exceeded? false}
                {:alternatives [{:items [] :rest nil :widened-type (type/unknown)}]
                 :limit-exceeded? true})))
          (reduce-alternatives child-results))
        non-trailing? (some #(or (:widened-type %) (:had-non-trailing-repetition? %)) alternatives)]
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

(def ^:private seqex-schema-types
  #{:cat :catn :alt :altn :? :* :+ :repeat})

(defn- seqex-result*
  [schema options]
  (let [malli-schema (mc/schema schema)
        schema-type  (mc/type malli-schema)
        properties   (mc/properties malli-schema)
        children     (mc/children malli-schema)
        options      (assoc options :key-transform (effective-key-transform properties options))]
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

      (let [ref-key         (when (and (= :malli.core/schema schema-type)
                                       (qualified-keyword? (mc/form malli-schema)))
                              (mc/form malli-schema))
            resolved        (when (qualified-keyword? ref-key)
                              (resolve-registry-schema ref-key options))
            resolved-schema (when resolved (mc/schema resolved))]
        (if (and resolved-schema
                 (contains? seqex-schema-types (mc/type resolved-schema)))
          (seqex-result* resolved-schema options)
          (scalar-seqex-result schema options))))))

(defn- fragment->tuple
  [{:keys [items rest widened-type]} options]
  (if widened-type
    (mark-container-readonly (type/array widened-type) (container-readonly? options))
    (let [labeled? (and (seq items) (every? :name items))
          tuple-items (mapv (if labeled?
                              #(select-keys % [:name :type :optional?])
                              #(select-keys % [:type :optional?]))
                            items)]
      (mark-container-readonly (type/tuple tuple-items rest) (container-readonly? options)))))

(defn seqex->alternatives
  "Compile a Malli sequence expression into alternative flat tuple nodes."
  ([schema]
   (seqex->alternatives schema {}))
  ([schema options]
   (mapv #(fragment->tuple % options)
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
           :type (type/union (mapv #(fragment->tuple % options) (:alternatives compiled))))))

(defn- parameter-name
  [raw-name index used-names]
  (let [fallback (str "arg" index)
        munged   (some-> raw-name symbol type/cljs-munge str)
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

(defn- parameters-from-alternative
  "Render one complete seqex alternative as a callable parameter list.
  Combining positions across alternatives creates a Cartesian product, so each
  fragment remains a separate function signature (an intersection/overload)."
  [{:keys [items rest widened-type]}]
  (with-parameter-names
    (if widened-type
      [{:name "args", :type widened-type, :rest? true}]
      (cond-> (mapv #(select-keys % [:name :type :optional?]) items)
        rest (conj {:type rest, :rest? true})))))

(defn- predicate-target-info
  "Normalize a `:ts/predicate-of` property into `{:param index :schema s}`.
  A bare schema narrows parameter 0."
  [value]
  (cond
    (map? value) (when (contains? value :schema)
                   {:param (or (:param value) 0), :schema (:schema value)})
    (some? value) {:param 0, :schema value}
    :else          nil))

(defn- primitive-type-name
  [type-node]
  (when (and (= :primitive (:kind type-node))
             (contains? #{"string" "number" "boolean" "bigint" "symbol"}
                        (:name type-node)))
    (:name type-node)))

(defn- literal-primitive-name
  [value]
  (cond
    (string? value)  "string"
    (number? value)  "number"
    (boolean? value) "boolean"
    :else            nil))

(defn predicate-target-compatible?
  "Check bounded, obvious TypeScript predicate assignability relationships.
  This deliberately handles primitives and finite literal unions only; strict
  declaration compilation remains the authority for structural relationships."
  [parameter-type target-type]
  (cond
    (= :unknown (:kind parameter-type)) true
    (= parameter-type target-type) true
    (= :union (:kind target-type))
    (every? #(predicate-target-compatible? parameter-type %) (:members target-type))
    (= :union (:kind parameter-type))
    (some #(predicate-target-compatible? % target-type) (:members parameter-type))
    (and (primitive-type-name parameter-type) (= :literal (:kind target-type)))
    (= (primitive-type-name parameter-type) (literal-primitive-name (:value target-type)))
    (primitive-type-name parameter-type) false
    :else true))

(defn normalize-overloads
  "Return validated declaration overload schemas from return metadata, or nil."
  [return-schema]
  (when-let [overloads (:ts/overloads (mc/properties (mc/schema return-schema)))]
    (when-not (and (vector? overloads)
                   (seq overloads)
                   (every? (fn [overload]
                             (try
                               (= :=> (mc/type (mc/schema overload)))
                               (catch Exception _ false)))
                           overloads))
      (throw (ex-info "Invalid :ts/overloads metadata"
                      {:type :invalid-typescript-overloads
                       :overloads overloads})))
    overloads))

(defn- valid-type-predicate?
  [predicate parameter-lists target-type]
  (and predicate
       (every? (fn [parameters]
                 (let [parameter (get parameters (:param predicate))]
                   (and parameter
                        (not (:rest? parameter))
                        (predicate-target-compatible? (:type parameter) target-type))))
               parameter-lists)))

(defn- invalid-type-predicate-diagnostic
  [predicate-value]
  {:type :invalid-type-predicate
   :predicate predicate-value})

(defn- function-result
  [malli-schema options]
  (let [[args-schema return-schema] (mc/children malli-schema)
        overloads       (normalize-overloads return-schema)]
    (if overloads
      (let [results (mapv #(function-result (mc/schema %) options) overloads)]
        (assoc (merge-result-metadata results)
               :type (type/intersection (mapv :type results))))
      (let [args-result     (seqex-result* args-schema (assoc options :argument-context? true))
            parameter-lists (mapv parameters-from-alternative (:alternatives args-result))
            return-result   (schema->result* return-schema (assoc options :argument-context? false))
            predicate-value (:ts/predicate-of (mc/properties (mc/schema return-schema)))
            predicate-info  (predicate-target-info predicate-value)
            target-result   (when predicate-info
                              (schema->result* (:schema predicate-info)
                                               (assoc options :argument-context? false)))
            predicate?      (and (= "boolean" (:name (:type return-result)))
                                 (valid-type-predicate? predicate-info parameter-lists (:type target-result)))
            function-types  (mapv (fn [parameters]
                                    (let [function-node (type/function-type parameters (:type return-result))]
                                      (if predicate?
                                        (type/function-predicate function-node
                                                                 (:param predicate-info)
                                                                 (:type target-result))
                                        function-node)))
                                  parameter-lists)
            result          (assoc (merge-result-metadata (cond-> [args-result return-result]
                                                            target-result (conj target-result)))
                                   :type (type/intersection function-types))]
        (if (and (some? predicate-value) (not predicate?))
          (update result :diagnostics conj (invalid-type-predicate-diagnostic predicate-value))
          result)))))

(defn- multi-child-schema
  [child]
  (if (and (vector? child) (<= 2 (count child)))
    (peek child)
    child))

(defn schema-reference-keywords
  "Return the set of qualified keywords that appear in schema-reference
  positions within `schema` (ignoring `:map` property keys, `:multi` dispatch
  values, and `:=` / `:enum` literal values)."
  [schema]
  (letfn [(step [acc form]
            (let [form (if (mc/schema? form) (mc/form form) form)]
              (cond
                (qualified-keyword? form)
                (conj acc form)

                (vector? form)
                (let [{:keys [schema-type props children]} (schema-form-parts form)
                      acc (cond-> acc
                            (qualified-keyword? schema-type) (conj schema-type))
                      acc (if (map? props)
                            (let [acc (reduce step acc (vals (:registry props)))
                                  acc (reduce step acc (keep props [:ts/array-of :ts/object-of :ts/ref :ts/promise-of]))
                                  pred (:ts/predicate-of props)
                                  acc (if (map? pred)
                                        (step acc (:schema pred))
                                        (step acc pred))]
                              (reduce step acc (:ts/overloads props)))
                            acc)]
                  (case schema-type
                    (:enum := :not= :fn :re)
                    acc

                    :ref
                    (if (qualified-keyword? (first children))
                      (conj acc (first children))
                      acc)

                    :map
                    (reduce (fn [acc entry]
                              (if (and (vector? entry) (<= 2 (count entry)))
                                (step acc (peek entry))
                                acc))
                            acc
                            children)

                    (:catn :altn :orn)
                    (reduce (fn [acc entry]
                              (if (and (vector? entry) (<= 2 (count entry)))
                                (step acc (catn-child-schema entry))
                                acc))
                            acc
                            children)

                    :multi
                    (reduce (fn [acc entry]
                              (if (and (vector? entry) (<= 2 (count entry)))
                                (step acc (multi-child-schema entry))
                                acc))
                            acc
                            children)

                    (reduce step acc children)))

                :else
                acc)))]
    (step #{} schema)))

(defn- preserved-ref-schema?
  [schema]
  (or (= :ref (mc/type schema))
      (and (= :malli.core/schema (mc/type schema))
           (qualified-keyword? (mc/form schema)))
      (and (= :schema (mc/type schema))
           (map? (:registry (mc/properties schema))))))

(defn- deref-preserving-properties
  [schema stop-at-refs?]
  (letfn [(with-properties [schema properties]
            (mc/-set-properties schema (merge (mc/properties schema) properties)))
          (deref? [schema]
            (and (mc/-ref-schema? schema)
                 (not (and stop-at-refs? (preserved-ref-schema? schema)))))
          (deref* [schema]
            (let [dereffed   (-> schema mc/deref (deref-preserving-properties true))
                  properties (mc/properties schema)]
              (cond-> dereffed
                (and (seq properties)
                     (not (preserved-ref-schema? dereffed)))
                (with-properties properties))))]
    (cond-> schema
      (deref? schema) deref*)))

(defn resolve-registered-schema
  "Like [[mr/resolve-schema]], but preserves descendant `:ref` and bare
  registry keyword (`:malli.core/schema`) references instead of inlining them."
  [schema-keyword]
  (if (and (qualified-keyword? schema-keyword)
           (some? (mr/registered-schema schema-keyword)))
    (let [schema (-> schema-keyword mc/schema (deref-preserving-properties false))]
      (mc/walk schema
               (fn [schema _path children _options]
                 (cond (preserved-ref-schema? schema)
                       schema

                       (mc/-ref-schema? schema)
                       (deref-preserving-properties (mc/-set-children schema children) true)

                       :else
                       (mc/-set-children schema children)))))
    (mr/resolve-schema schema-keyword)))

(defn- resolve-registry-schema
  [schema-keyword options]
  (or (get (:registry options) schema-keyword)
      (when-let [resolve-schema (:resolve-schema options)]
        (resolve-schema schema-keyword))
      (resolve-registered-schema schema-keyword)))

(defn- schema-contains-maybe?
  "True when `schema` accepts an explicit undefined value in an argument
  position. Registry references are followed with a cycle guard; enum and
  literal values are not schemas and must not be resolved as references."
  [schema options seen]
  (let [form (if (mc/schema? schema) (mc/form schema) schema)]
    (cond
      (and (vector? form) (= :maybe (first form)))
      true

      (qualified-keyword? form)
      (when-not (contains? seen form)
        (schema-contains-maybe? (resolve-registry-schema form options)
                                options
                                (conj seen form)))

      (vector? form)
      (let [{:keys [schema-type props children]} (schema-form-parts form)
            metadata-schemas (when (= :any schema-type)
                               (keep props [:ts/array-of :ts/object-of :ts/ref :ts/promise-of]))]
        (cond
          (contains? #{:enum :=} schema-type) false
          (= :schema schema-type)
          (schema-contains-maybe? (last children)
                                  (update options :registry merge (:registry props))
                                  seen)
          :else
          (boolean (some #(schema-contains-maybe? % options seen)
                         (concat children metadata-schemas)))))

      :else
      false)))

(defn- registry-ref-result
  [schema-keyword options]
  (let [local-schema      (get (:registry options) schema-keyword)
        resolved-schema   (or local-schema
                              (resolve-registry-schema schema-keyword options))
        contextual-input? (and (:argument-context? options)
                               (schema-contains-maybe? resolved-schema options #{schema-keyword}))]
    (cond
      ;; Key-transformed aliases are intentionally expanded so the transform can
      ;; apply to every property. Other aliases retain graph edges below.
      (:key-transform options)
      (schema->result* resolved-schema options)

      local-schema
      (assoc (ref-result schema-keyword contextual-input?)
             :local-definitions {schema-keyword local-schema})

      :else
      (ref-result schema-keyword contextual-input?))))

(defn validate-typescript
  "Return an explicit TypeScript string, or throw with the supplied diagnostic context."
  [typescript context]
  (when-not (string? typescript)
    (throw (ex-info ":typescript must resolve to a string"
                    (assoc context :type :invalid-typescript-metadata))))
  typescript)

(defn- explicit-type
  [typescript]
  (if (= "unknown" typescript)
    (type/unknown)
    (type/raw typescript)))

(defn- any-result
  [malli-schema options]
  (let [{:keys [ts/array-of ts/object-of ts/ref ts/promise-of ts/instance-of] :as properties}
        (mc/properties malli-schema)
        nested-options (assoc options :key-transform (effective-key-transform properties options))]
    (cond
      array-of
      (let [child-result (schema->result* array-of options)]
        (-> child-result
            (assoc :type (mark-container-readonly
                          (type/array (:type child-result))
                          (container-readonly? options)))
            dissoc-multi-branches-unless-union))

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

(defn- multi-dispatch-key
  "Return the map key a `:multi` dispatches on when it can be determined:
  either an explicit `:ts/dispatch-key` property or a plain keyword
  `:dispatch` (Malli's key-access form)."
  [properties]
  (or (:ts/dispatch-key properties)
      (let [dispatch (:dispatch properties)]
        (when (keyword? dispatch)
          dispatch))))

(defn- synthesize-multi-discriminant
  "Return a form declaring the `dispatch-key` literal for a branch that omits
  it. Plain map branches get the entry prepended; registry-ref branches are
  intersected with a single-key map. A nil dispatch can result from an absent
  key, so it cannot prove that a `key: null` property exists."
  [branch-form dispatch-key dispatch-value]
  (when (and (some? dispatch-value)
             (not= ::mc/default dispatch-value))
    (cond
      (or (qualified-keyword? branch-form)
          (and (vector? branch-form) (= :ref (first branch-form)) (qualified-keyword? (second branch-form))))
      [:and branch-form [:map {:closed true} [dispatch-key [:= dispatch-value]]]]

      (vector? branch-form)
      (let [{:keys [schema-type children] :as parts} (schema-form-parts branch-form)]
        (when (and (= :map schema-type)
                   (not (some #(= dispatch-key (first %)) children)))
          (with-schema-form-parts (assoc parts :children (into [[dispatch-key [:= dispatch-value]]]
                                                               children)))))

      :else nil)))

(defn- branch-declares-literal?
  "True when a branch map (or a referenced registry schema) already constrains
  `dispatch-key` to a literal equal to `dispatch-value`, so discrimination
  works without synthesis."
  [branch-form dispatch-key dispatch-value options]
  (let [resolved-form (cond
                        (qualified-keyword? branch-form)
                        (some-> (resolve-registry-schema branch-form options) mc/schema mc/form)

                        (and (vector? branch-form)
                             (= :ref (first branch-form))
                             (qualified-keyword? (second branch-form)))
                        (some-> (resolve-registry-schema (second branch-form) options) mc/schema mc/form)

                        :else
                        branch-form)]
    (when (vector? resolved-form)
      (let [{:keys [schema-type children]} (schema-form-parts resolved-form)]
        (cond
          (= :map schema-type)
          (some (fn [entry]
                  (when (= dispatch-key (first entry))
                    (let [value-schema (if (map? (second entry)) (nth entry 2) (second entry))
                          {:keys [schema-type children]} (when (vector? value-schema)
                                                           (schema-form-parts value-schema))]
                      (and (= := schema-type)
                           (= dispatch-value (first children))))))
                children)

          (contains? #{:and :merge} schema-type)
          (some #(branch-declares-literal? % dispatch-key dispatch-value options) children)

          :else
          false)))))

(defn- multi-result
  "Compile a `:multi` as a discriminated union: synthesize the dispatch-key
  literal into plain-map branches that omit it and record branch metadata for
  `Extract<>` alias emission. Recorded key/value strings mirror exactly how
  the synthesized discriminant renders so `Extract<>` filters match."
  [malli-schema options]
  (let [properties   (mc/properties malli-schema)
        dispatch-key (multi-dispatch-key properties)
        children     (mc/children malli-schema)
        branches     (mapv (fn [child]
                             (let [dispatch-value (first child)
                                   branch-schema  (multi-child-schema child)
                                   branch-form    (mc/form branch-schema)
                                   synthesized    (when dispatch-key
                                                    (if (branch-declares-literal?
                                                         branch-form dispatch-key dispatch-value options)
                                                      branch-form
                                                      (synthesize-multi-discriminant
                                                       branch-form dispatch-key dispatch-value)))]
                               {:result   (schema->result* (or synthesized branch-schema) options)
                                :literal? (some? synthesized)}))
                           children)
        values-literal? (every? (fn [child]
                                  (let [value (first child)]
                                    (or (= ::mc/default value)
                                        (:supported? (typescript-literal-value value)))))
                                children)]
    (cond-> (with-type (union-type (mapv (comp :type :result) branches)) (mapv :result branches))
      (and dispatch-key values-literal? (seq children))
      (assoc :multi-branches
             {:key-string (transformed-map-key dispatch-key (:key-transform options))
              :branches (mapv (fn [child branch]
                                (let [value (first child)
                                      rendered (when (not= ::mc/default value)
                                                 (when-let [{:keys [supported?] literal-value :value}
                                                            (typescript-literal-value value)]
                                                   (when supported?
                                                     (type/render (type/literal literal-value)))))]
                                  {:value value
                                   :value-string rendered
                                   :literal? (and (:literal? branch) (some? rendered))}))
                              children
                              branches)}))))

(defn- literal-subsumes?
  [general-node literal-node]
  (and (= :literal (:kind literal-node))
       (or (= general-node literal-node)
           (and (= :primitive (:kind general-node))
                (= (:name general-node) (literal-primitive-name (:value literal-node))))
           (and (= :union (:kind general-node))
                (boolean (some #(literal-subsumes? % literal-node) (:members general-node)))))))

(defn- resolve-tuple-branch-node
  [type-node options]
  (cond
    (= :tuple (:kind type-node))
    {:tuple type-node}

    (= :ref (:kind type-node))
    (when-let [resolved (resolve-registry-schema (:schema-keyword type-node) options)]
      (let [compiled (schema->result* resolved options)]
        (when (= :tuple (get-in compiled [:type :kind]))
          {:tuple (:type compiled)
           :result compiled
           :ref-node type-node})))

    :else nil))

(defn- with-tuple-item-type
  [item type-node]
  (if (and (map? item) (contains? item :type))
    (assoc item :type type-node)
    type-node))

(defn- guard-items-compatible?
  [guard-items branch-items]
  (every? (fn [[guard-item branch-item]]
            (let [guard-type (tuple-item-type guard-item)
                  branch-type (tuple-item-type branch-item)]
              (or (= :unknown (:kind guard-type))
                  (= guard-type branch-type))))
          (map vector (subvec guard-items 1) (subvec branch-items 1))))

(defn- specialize-tuple-branch
  [branch-node guard-items tag-node min-items union-target? options]
  (when-let [{:keys [tuple result ref-node]} (resolve-tuple-branch-node branch-node options)]
    (let [items (:items tuple)
          rest-type (:rest tuple)
          first-type (some-> (first items) tuple-item-type)]
      (when (and (seq items)
                 (literal-subsumes? first-type tag-node)
                 (or (<= min-items (count items))
                     (some? rest-type)))
        (let [items' (update items 0 with-tuple-item-type tag-node)
              padded-items (if (< (count items') min-items)
                             (into items' (repeat (- min-items (count items')) {:type rest-type}))
                             items')]
          (when (or union-target? (guard-items-compatible? guard-items padded-items))
            (if ref-node
              {:type ref-node, :extra-results []}
              {:type (assoc tuple :items padded-items)
               :extra-results (if result [result] [])})))))))

(defn- specialize-tuple-guard-branches
  "When an `:and` schema combines a leading literal-tag tuple guard (such as
  `[:cat [:= :+] [:schema [:ref ::common/options]] [:+ {:min 2} :any]]` or
  `[:tuple [:= :field] [:ref ::field.options] [:or :string ::id/field]]`) with
  a tuple or union of tuple branches, specialize each branch with the literal
  tag and minimum arity rather than emitting a tuple intersection."
  [type-nodes options]
  (when (= 2 (count type-nodes))
    (let [[guard-node target-node] type-nodes
          guard-items (:items guard-node)
          tag-node    (some-> (first guard-items) tuple-item-type)]
      (when (and (= :tuple (:kind guard-node))
                 (<= 2 (count guard-items))
                 (= :literal (:kind tag-node))
                 (or (nil? (:rest guard-node))
                     (= :unknown (get-in guard-node [:rest :kind]))))
        (let [min-items     (count guard-items)
              union-target? (= :union (:kind target-node))
              branches      (if union-target?
                              (:members target-node)
                              [target-node])
              specialized   (mapv #(specialize-tuple-branch % guard-items tag-node min-items union-target? options)
                                  branches)]
          (when (every? some? specialized)
            {:type (union-type (mapv :type specialized))
             :extra-results (into [] (mapcat :extra-results) specialized)}))))))

(defn- and-result
  [results options]
  (let [type-nodes (mapv :type results)]
    (if-let [{:keys [type extra-results]} (specialize-tuple-guard-branches type-nodes options)]
      (with-type type (into results extra-results))
      (with-type (intersection-type type-nodes) results))))

(defn- compile-malli-schema
  [malli-schema options]
  (let [schema-type (mc/type malli-schema)
        properties  (mc/properties malli-schema)
        children    (mc/children malli-schema)
        form        (mc/form malli-schema)
        options     (assoc options :key-transform (effective-key-transform properties options))]
    (when (contains? properties :typescript)
      (validate-typescript (:typescript properties) {:schema form}))
    (cond
      (contains? properties :typescript)
      (result (explicit-type (:typescript properties)))

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

      (contains? #{'seqable? 'coll? 'some? 'any? 'associative?} schema-type)
      (unknown-result form :weak-schema)

      (contains? #{'ifn? 'fn?} schema-type)
      (result (type/function-type [{:name "args", :type (type/unknown), :rest? true}]
                                  (type/unknown)))

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
      (multi-result malli-schema options)

      (contains? #{:and :merge} schema-type)
      (and-result (compile-children children options) options)

      (= schema-type :maybe)
      (let [child-result (schema->result* (first children) options)
            members (cond-> [(:type child-result)]
                      (:argument-context? options) (conj (type/primitive "undefined"))
                      true (conj (type/primitive "null")))]
        (assoc child-result :type (type/union members)))

      (contains? #{:vector :sequential} schema-type)
      (let [child-result (schema->result* (first children) options)
            min-count    (long (or (:min properties) 0))]
        (repeated-result child-result min-count false options))

      (= schema-type :set)
      (let [child-result (schema->result* (first children) options)]
        (-> child-result
            (assoc :type (mark-container-readonly
                          (type/generic "Set" [(:type child-result)])
                          (container-readonly? options)))
            dissoc-multi-branches-unless-union))

      (= schema-type :tuple)
      (let [results (compile-children children options)]
        (with-type (mark-container-readonly
                    (type/tuple (mapv :type results))
                    (container-readonly? options))
          results))

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
                                    child-type)
                         options))

      (= schema-type :?)
      (let [child-result (schema->result* (first children) options)]
        (-> child-result
            (assoc :type (type/union [(:type child-result)
                                      (type/primitive "undefined")]))
            dissoc-multi-branches-unless-union))

      (or (= schema-type :schema)
          (and (= schema-type :malli.core/schema)
               (vector? form)
               (= :schema (first form))))
      (let [local-registry (:registry properties)
            child-form     (last form)]
        ;; The alias closure resolves transitive local refs after this outer
        ;; compilation returns, so retain the complete local registry rather
        ;; than only the immediate reference.
        (update (schema->result* child-form
                                 (update options :registry merge local-registry))
                :local-definitions #(merge local-registry %)))

      (= schema-type :=>)
      (function-result malli-schema options)

      (= schema-type :function)
      (let [results (compile-children children options)]
        ;; A union of callables is uncallable without arguments valid for every
        ;; member; an intersection expresses the arities as overloads.
        (with-type (type/intersection (mapv :type results)) results))

      (= schema-type :fn)
      (if-let [predicate (predicate-target-info (:ts/predicate-of properties))]
        (let [predicate-result (schema->result* (:schema predicate) options)]
          (assoc (merge-result-metadata [predicate-result])
                 :type (type/function-predicate
                        (type/function-type [{:name "value", :type (type/unknown)}]
                                            (type/unknown))
                        0
                        (:type predicate-result))))
        (unknown-result form :predicate-schema))

      (= schema-type :ref)
      (registry-ref-result (first children) options)

      (= schema-type :malli.core/schema)
      (registry-ref-result (if (qualified-keyword? form) form (last form)) options)

      (qualified-keyword? schema-type)
      (registry-ref-result schema-type options)

      :else
      (unknown-result form))))

(defn- parse-schema
  [schema registry]
  (if (seq registry)
    ;; A composite registry leaves nested `:ref` parsing bound to the cached
    ;; default ref schema. Materialize the current global definitions together
    ;; with the nearest local scope so local schemas can reference global ones.
    (mc/schema schema
               {:registry (mregistry/fast-registry
                           (merge (mregistry/schemas mc/default-registry)
                                  registry))})
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
          (if (contains? #{:invalid-typescript-overloads :invalid-typescript-same-as :invalid-typescript-metadata}
                         (:type (ex-data exception)))
            (throw exception)
            (assoc (unknown-result identity-key :invalid-schema)
                   :diagnostics [{:type :invalid-schema
                                  :schema identity-key
                                  :message (ex-message exception)}])))))))

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
