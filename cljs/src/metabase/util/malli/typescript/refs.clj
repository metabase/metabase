(ns metabase.util.malli.typescript.refs
  (:require
   [metabase.util.malli.typescript.declaration :as declaration]
   [metabase.util.malli.typescript.schema :as schema]
   [metabase.util.malli.typescript.type :as type]))

(set! *warn-on-reflection* true)

(defn- resolve-definition
  [resolve-schema registry schema-keyword]
  (or (get registry schema-keyword)
      (when resolve-schema
        (resolve-schema schema-keyword))))

(defn dependency-closure
  "Compile the transitive registry dependency closure for `initial-refs`.

  Required options:
  - `:resolve-schema` resolves a schema keyword to its Malli definition.

  Optional `:expand?` can stop traversal at references owned by another module."
  [initial-refs {:keys [resolve-schema compile-options expand?]
                 :or {compile-options {}, expand? (constantly true)}}]
  (loop [pending           (vec (sort-by str initial-refs))
         processed         #{}
         definitions       (sorted-map-by #(compare (str %1) (str %2)))
         graph             {}
         refs-used         (set initial-refs)
         local-definitions (:registry compile-options)
         diagnostics       []]
    (if-let [schema-keyword (first pending)]
      (let [remaining (subvec pending 1)]
        (cond
          (processed schema-keyword)
          (recur remaining processed definitions graph refs-used local-definitions diagnostics)

          (not (expand? schema-keyword))
          (recur remaining (conj processed schema-keyword) definitions graph refs-used local-definitions diagnostics)

          :else
          (if-let [definition (resolve-definition resolve-schema local-definitions schema-keyword)]
            (let [compiled (schema/schema->result
                            definition
                            (update compile-options :registry merge local-definitions))
                  discovered (:registry-refs compiled)
                  new-local  (merge local-definitions (:local-definitions compiled))
                  new-pending (->> discovered
                                   (remove processed)
                                   (concat remaining)
                                   distinct
                                   (sort-by str)
                                   vec)]
              (recur new-pending
                     (conj processed schema-keyword)
                     (assoc definitions schema-keyword compiled)
                     (assoc graph schema-keyword discovered)
                     (into refs-used discovered)
                     new-local
                     (into diagnostics (:diagnostics compiled))))
            (recur remaining
                   (conj processed schema-keyword)
                   (assoc definitions schema-keyword (schema/result (type/unknown)))
                   (assoc graph schema-keyword #{})
                   refs-used
                   local-definitions
                   (conj diagnostics {:type :unresolved-schema-ref
                                      :schema schema-keyword})))))
      {:definitions definitions
       :graph graph
       :refs-used refs-used
       :local-definitions local-definitions
       :diagnostics diagnostics})))

(defn- reachable?
  [graph start target]
  (loop [pending [start]
         seen #{}]
    (if-let [current (peek pending)]
      (cond
        (= current target) true
        (seen current) (recur (pop pending) seen)
        :else (recur (into (pop pending) (get graph current))
                     (conj seen current)))
      false)))

(defn- cyclic-edge?
  [graph schema-keyword ref-keyword]
  (or (= schema-keyword ref-keyword)
      (reachable? graph ref-keyword schema-keyword)))

(defn- preserve-node-flags
  "Rebuilt nodes drop flags the constructors don't take; carry them over."
  [original rebuilt]
  (cond-> rebuilt
    (:readonly? original) (assoc :readonly? true)))

(declare make-recursion-safe*)

(defn- transform-tuple-item
  [schema-keyword graph guarded? item]
  (if (and (map? item) (contains? item :type))
    (let [[item-type diagnostics]
          (make-recursion-safe* schema-keyword graph guarded? (:type item))]
      [(assoc item :type item-type) diagnostics])
    (make-recursion-safe* schema-keyword graph guarded? item)))

(defn- transform-many
  [schema-keyword graph guarded? nodes]
  (reduce (fn [[transformed diagnostics] node]
            (let [[new-node node-diagnostics]
                  (make-recursion-safe* schema-keyword graph guarded? node)]
              [(conj transformed new-node)
               (into diagnostics node-diagnostics)]))
          [[] []]
          nodes))

(defn- make-recursion-safe*
  [schema-keyword graph guarded? node]
  (case (:kind node)
    :ref
    (let [ref-keyword (:schema-keyword node)]
      (if (and (not guarded?)
               (cyclic-edge? graph schema-keyword ref-keyword))
        [(type/unknown)
         [{:type :unsafe-recursive-ref
           :schema schema-keyword
           :ref ref-keyword}]]
        [node []]))

    :union
    (let [[members diagnostics]
          (transform-many schema-keyword graph guarded? (:members node))]
      [(type/union members) diagnostics])

    :intersection
    (let [[members diagnostics]
          (transform-many schema-keyword graph guarded? (:members node))]
      [(type/intersection members) diagnostics])

    :array
    (let [[element diagnostics]
          (make-recursion-safe* schema-keyword graph true (:element node))]
      [(preserve-node-flags node (type/array element)) diagnostics])

    :generic
    (let [[arguments diagnostics]
          (transform-many schema-keyword graph true (:arguments node))]
      [(preserve-node-flags node (type/generic (:name node) arguments)) diagnostics])

    :tuple
    (let [[items item-diagnostics]
          (reduce (fn [[transformed diagnostics] item]
                    (let [[new-item new-diagnostics]
                          (transform-tuple-item schema-keyword graph true item)]
                      [(conj transformed new-item)
                       (into diagnostics new-diagnostics)]))
                  [[] []]
                  (:items node))
          [rest-type rest-diagnostics]
          (if-let [rest-type (:rest node)]
            (make-recursion-safe* schema-keyword graph true rest-type)
            [nil []])]
      [(preserve-node-flags node (type/tuple items rest-type))
       (into item-diagnostics rest-diagnostics)])

    :object
    (let [[properties property-diagnostics]
          (reduce (fn [[transformed diagnostics] property]
                    (let [[property-type new-diagnostics]
                          (make-recursion-safe* schema-keyword graph true (:type property))]
                      [(conj transformed (assoc property :type property-type))
                       (into diagnostics new-diagnostics)]))
                  [[] []]
                  (:properties node))
          [index-value index-diagnostics]
          (if-let [index-signature (:index-signature node)]
            (make-recursion-safe* schema-keyword graph true (:value index-signature))
            [nil []])
          index-signature (when-let [signature (:index-signature node)]
                            (assoc signature :value index-value))]
      [(preserve-node-flags node (type/object properties index-signature))
       (into property-diagnostics index-diagnostics)])

    :key-transform
    (let [[inner diagnostics]
          (make-recursion-safe* schema-keyword graph true (:inner node))]
      [(type/key-transform-type (:name node) inner) diagnostics])

    :function
    (let [[parameters parameter-diagnostics]
          (reduce (fn [[transformed diagnostics] parameter]
                    (let [[parameter-type new-diagnostics]
                          (make-recursion-safe* schema-keyword graph true (:type parameter))]
                      [(conj transformed (assoc parameter :type parameter-type))
                       (into diagnostics new-diagnostics)]))
                  [[] []]
                  (:parameters node))
          [return-type return-diagnostics]
          (make-recursion-safe* schema-keyword graph true (:return node))
          rebuilt (type/function-type parameters return-type)
          [predicate predicate-diagnostics]
          (if-let [predicate (:predicate node)]
            (let [[predicate-type diagnostics]
                  (make-recursion-safe* schema-keyword graph true (:type predicate))]
              [{:parameter (:parameter predicate), :type predicate-type} diagnostics])
            [nil []])]
      [(cond-> rebuilt predicate (type/function-predicate (:parameter predicate) (:type predicate)))
       (into parameter-diagnostics (concat return-diagnostics predicate-diagnostics))])

    [node []]))

(defn- phantom-discriminant
  "Optional synthetic tag distinguishing structurally identical aliases.
  Compiler-controlled; never written by hand."
  [type-name]
  (type/object [{:name "__kind", :optional? true, :type (type/literal type-name)}]))

(defn- collidable-kind?
  [node]
  (contains? #{:object :union :intersection} (:kind node)))

(def ^:private typescript-identifier-pattern
  #"[A-Za-z_$][\w$]*")

(defn type-aliases
  "Generate deterministic TypeScript aliases for a registry dependency closure.

  Options extend `dependency-closure` and require `:type-name` and `:ref-name`."
  [initial-refs {:keys [type-name ref-name] :as options}]
  (let [{:keys [definitions graph refs-used diagnostics] :as closure}
        (dependency-closure initial-refs options)
        safe-types
        (into {}
              (map (fn [[schema-keyword compiled]]
                     (let [[safe-type recursion-diagnostics]
                           (make-recursion-safe* schema-keyword graph false (:type compiled))]
                       [schema-keyword {:type safe-type
                                        :diagnostics recursion-diagnostics
                                        :multi-branches (:multi-branches compiled)}])))
              definitions)
        ;; Aliases whose rendered bodies are byte-identical collide structurally;
        ;; only object/union-shaped collisions get a phantom discriminant so
        ;; mutually interchangeable primitives stay interchangeable.
        body-groups (group-by (fn [schema-keyword]
                                (type/render (get-in safe-types [schema-keyword :type]) {:ref-name ref-name}))
                              (keys safe-types))
        render-entry
        (fn [schema-keyword]
          (let [{:keys [type multi-branches]} (get safe-types schema-keyword)
                base-name (type-name schema-keyword)
                body (type/render type {:ref-name ref-name})
                phantom (when (and (collidable-kind? type)
                                   (> (count (get body-groups body)) 1))
                          (phantom-discriminant base-name))
                rendered-type (if phantom
                                (type/intersection [type phantom])
                                type)
                declaration (str "export type " base-name " = "
                                 (type/render rendered-type {:ref-name ref-name}) ";")
                ;; Extract<> only distributes over a plain union; skip it when the
                ;; alias was phantom-wrapped into an intersection.
                extract-declarations
                (when (and (nil? phantom)
                           (= :union (:kind type))
                           (:key-string multi-branches)
                           (<= 2 (count (filter :literal? (:branches multi-branches)))))
                  (keep (fn [{:keys [value value-string literal?]}]
                          (let [tag-name (declaration/branch-type-name value)]
                            (when (and literal?
                                       value-string
                                       (re-matches typescript-identifier-pattern tag-name))
                              (str "export type " base-name "_" tag-name
                                   " = Extract<" (ref-name schema-keyword)
                                   ", { \"" (:key-string multi-branches) "\": " value-string " }>;"))))
                        (:branches multi-branches)))]
            {:declarations (into [declaration] extract-declarations)
             :diagnostics (:diagnostics (get safe-types schema-keyword))}))
        rendered (mapv render-entry (sort-by str (keys safe-types)))]
    (assoc closure
           :declarations (into [] (mapcat :declarations) rendered)
           :refs-used refs-used
           :diagnostics (into (vec diagnostics) (mapcat :diagnostics) rendered))))
