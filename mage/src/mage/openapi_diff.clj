(ns mage.openapi-diff
  "Semantic diff of two OpenAPI specs, for drafting the REST API changelog.

  `resources/openapi/openapi.json` is generated from the Malli endpoint schemas, so the spec at any
  git ref is what the API was at that ref. Diffing two specs answers \"what changed for a client?\"
  without reading endpoint source or booting a server.

  A change is BREAKING when an existing caller, sending exactly what it sent before, can now fail
  or get a different result. That covers three cases: the API requires more of the request, provides
  less in the response, or behaves differently for the same request. The first two invert between
  request and response, so severity is decided from both schemas rather than from how a change
  happens to render:

    request   breaking: newly required, type/enum/bound narrowed, schema closed,
                        default changed or dropped (same request, different behavior)
              additive: new OPTIONAL field or param, type/enum/bound widened, made nullable,
                        default added
    response  breaking: field removed or no longer always returned, may now be null, new enum value
              additive: new field returned, values narrowed

  When the comparison cannot tell, it ranks the change breaking. A false alarm costs a reviewer
  one look; a miss ships undocumented. Two rules follow from that, not from the definition:
    - a removed request field is breaking, because the spec does not say whether the server rejects
      or acts on keys it does not declare
    - a change to a schema keyword the comparison does not model is breaking

  Descriptions, titles, and examples are compared separately and rank doc-only.

  Response coverage is partial: only endpoints that declare a response schema can be compared. Most
  emit description-only 2XX/4XX/5XX stubs."
  (:require
   ;; mage runs under babashka; metabase.util.json isn't on its classpath
   [babashka.json :as json]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private ^java.util.IdentityHashMap stamped
  "Digest of every node [[resolver]] built, by object identity. Not metadata: `dissoc` and `assoc`
  copy metadata to the map they return, which would carry the parent's digest onto a different map.

  ponytail: process-lifetime and unbounded; it holds the nodes of the specs this run reads."
  (java.util.IdentityHashMap.))

(defn- digest-of
  "SHA-256 content digest of a JSON-shaped value, so two schemas compare in constant time.

  Resolved schemas share structure: a component used in a thousand places is one object, and
  comparing two specs with `=` walks it a thousand times. [[resolver]] records each node it builds
  in [[stamped]]. Any other node, such as the result of a `dissoc`, digests from its children."
  [x]
  (or (when (coll? x) (.get stamped x))
      (let [md    (java.security.MessageDigest/getInstance "SHA-256")
            feed! (fn [^String s] (.update md (.getBytes s "UTF-8")))]
        (cond
          (map? x)        (doseq [k (sort (keys x))]
                            (feed! (str "{" (pr-str k)))
                            (feed! (digest-of (get x k))))
          (sequential? x) (do (feed! "[")
                              (doseq [v x] (feed! (digest-of v)))
                              (feed! "]"))
          :else           (feed! (str "=" (pr-str x))))
        (.encodeToString (java.util.Base64/getEncoder) (.digest md)))))

(defn- same?
  "Whether two schemas are equal. Constant time for stamped nodes, unlike `=` on shared structure."
  [a b]
  (= (digest-of a) (digest-of b)))

(defn- stamp [x]
  (.put stamped x (digest-of x))
  x)

(defn- string-ref
  "The pointer of a `$ref` node. SCIM schemas have a property literally named \"$ref\"
  (`{\"properties\": {\"$ref\": {...}}}`), which is data, not a reference - hence the string check."
  [node]
  (let [r (get node "$ref")] (when (string? r) r)))

(defn- ref-target [spec ref]
  (get-in spec (str/split (subs ref 2) #"/") {}))

(defn- resolver
  "A fn that inlines the `$ref`s in a node of `spec`, so two specs compare structurally rather than
  by ref name. Component schemas change too, so a ref that looks identical can point at a
  different shape.

  A ref already on the current path becomes `<recursive ...>`, so every path terminates against a
  finite component set. There is no depth limit, which would replace deep nodes with the same
  literal on both sides and hide the change.

  Resolved refs are cached, so a component is built once however many places use it, and the
  results share structure. Inlining every use separately grows as 2^depth when schemas share refs;
  the document schemas reach about 300 MB for one operation that way. A resolution depends only on
  which refs it can reach are already on the path, so those form the cache key."
  [spec]
  (let [reachable (memoize
                   (fn [ref]
                     (loop [todo [ref], seen #{}]
                       (if-let [[r & more] (seq todo)]
                         (if (contains? seen r)
                           (recur more seen)
                           (recur (into (vec more)
                                        (keep #(when (map? %) (string-ref %)))
                                        (tree-seq coll? #(if (map? %) (vals %) %) (ref-target spec r)))
                                  (conj seen r)))
                         seen))))
        cache (volatile! {})]
    (letfn [(resolve-ref [ref path]
              (let [k [ref (set/intersection path (reachable ref))]]
                (or (get @cache k)
                    (let [r (resolve (ref-target spec ref) (conj path ref))]
                      (vswap! cache assoc k r)
                      r))))
            (resolve
              ([node] (resolve node #{}))
              ([node path]
               (cond
                 (map? node)
                 (if-let [ref (string-ref node)]
                   (let [rest' (dissoc node "$ref")]
                     (cond
                       (contains? path ref) (str "<recursive " ref ">")
                       ;; Sibling keys, such as a `description` beside the ref, override the target's.
                       (seq rest') (let [t (resolve-ref ref path)]
                                     (if (map? t)
                                       (stamp (merge t (update-vals rest' #(resolve % (conj path ref)))))
                                       t))
                       :else (resolve-ref ref path)))
                   (stamp (update-vals node #(resolve % path))))

                 (sequential? node) (stamp (mapv #(resolve % path) node))
                 :else node)))]
      resolve)))

(defn- non-null
  "The single real variant of a nullable union such as `oneOf [<array> {type: null}]`, else `node`."
  [node]
  (let [variants (when (map? node) (concat (get node "oneOf") (get node "anyOf")))
        others   (remove #(= {"type" "null"} %) variants)]
    (if (and (= 1 (count others)) (< 1 (count variants))) (first others) node)))

(defn- schema-props
  "`[properties required-set]` for an object schema, else `[nil #{}]`. Unwraps the nullable
  `oneOf [<object> {type: null}]` pattern, and only that: any other union, such as
  `string | object` or two object variants, has no single property set, so callers compare it
  whole. Taking one variant's properties would hide every change to the others."
  [node]
  (let [n (non-null node)]
    (if-let [props (and (map? n) (get n "properties"))]
      [props (set (get n "required"))]
      [nil #{}])))

(declare type-set)

(defn- type-set-uncached
  [node]
  (when (and (map? node) (seq node))
    (if-let [variants (seq (concat (get node "oneOf") (get node "anyOf")))]
      (let [parts (map type-set variants)]
        (when-not (some nil? parts)
          (reduce set/union #{} parts)))
      (when-let [t (get node "type")]
        (if (string? t) #{t} (set t))))))

(def ^:private type-set-cache
  "Results of [[type-set]] by content digest.

  ponytail: process-lifetime cache, like [[compatible-cache]]."
  (atom {}))

(defn- type-set
  "Set of JSON types a schema accepts, or nil when unconstrained. Cached by content digest: unions
  of shared unions otherwise walk each variant once per path."
  [node]
  (let [k (digest-of node)]
    (if (contains? @type-set-cache k)
      (get @type-set-cache k)
      (let [v (type-set-uncached node)]
        (swap! type-set-cache assoc k v)
        v))))

(defn- enum-set
  "Set of literal values a schema accepts, or nil when it is not an enum."
  [node]
  (when (map? node)
    (cond
      (contains? node "const") #{(json/write-str (get node "const"))}
      (sequential? (get node "enum")) (set (map json/write-str (get node "enum")))
      :else nil)))

(def ^:private doc-keys
  "Schema keys that document a value without constraining it."
  ["description" "title" "example" "examples" "deprecated"])

(defn- strip-docs
  "`node` without [[doc-keys]] at any depth, so a reworded description is not a schema change.
  Property NAMES are data, so a field literally called `description` survives, and literal values
  under `enum`/`const`/`default` are not walked."
  [node]
  (cond
    (map? node) (into {} (for [[k v] (apply dissoc node doc-keys)]
                           [k (cond
                                (and (= "properties" k) (map? v)) (update-vals v strip-docs)
                                (#{"enum" "const" "default"} k) v
                                :else (strip-docs v))]))
    (sequential? node) (mapv strip-docs node)
    :else node))

(def ^:private lower-bounds ["minLength" "minItems"])
(def ^:private upper-bounds ["maxLength" "maxItems"])

(def ^:private modeled-keys
  "Keywords [[compatible?]] compares. A change to any other keyword is ranked incompatible."
  (into #{"type" "enum" "const" "default" "oneOf" "anyOf" "allOf" "prefixItems" "items" "properties"
          "required" "additionalProperties" "pattern" "format" "uniqueItems"}
        (concat lower-bounds upper-bounds ["minimum" "exclusiveMinimum" "maximum" "exclusiveMaximum"])))

(defn- union? [node]
  (and (map? node) (seq (concat (get node "oneOf") (get node "anyOf")))))

(defn- variants
  "A union's variants, or the schema itself as its only variant."
  [node]
  (if (union? node) (concat (get node "oneOf") (get node "anyOf")) [node]))

(defn- numeric-bound
  "A schema's effective numeric bound as `[value strictness]`, comparable with `compare`, or nil.
  `inclusive`/`exclusive` name the keywords; exclusive is stricter at the same value, so it sorts
  inward: above an inclusive lower bound, below an inclusive upper one."
  [s inclusive exclusive inward]
  (let [i (get s inclusive), x (get s exclusive)
        candidates (cond-> []
                     (number? i) (conj [i 0])
                     (number? x) (conj [x inward]))]
    (when (seq candidates)
      (reduce #(if (pos? (* inward (compare %2 %1))) %2 %1) (first candidates) (rest candidates)))))

(defn- literal-types
  "JSON types of an enum's or const's values, or nil when the schema is neither."
  [node]
  (when-let [vs (cond (contains? node "const") [(get node "const")]
                      (sequential? (get node "enum")) (get node "enum"))]
    (set (map #(cond (string? %) "string" (integer? %) "integer" (number? %) "number"
                     (boolean? %) "boolean" (nil? %) "null" (map? %) "object" :else "array")
              vs))))

(defn- accepts-all-values?
  "True when the type, enum, bound, and pattern constraints of `wide` admit every value that
  `narrow`'s admit. Object and array structure is [[compatible?]]'s job."
  [wide narrow]
  (let [tw (type-set wide), tn (or (type-set narrow) (literal-types narrow))
        ew (enum-set wide), en (enum-set narrow)
        bound-ok? (fn [k cmp] (let [w (get wide k), n (get narrow k)]
                                (or (not (number? w)) (and (number? n) (cmp n w)))))
        numeric-ok? (fn [inclusive exclusive inward]
                      (let [w (numeric-bound wide inclusive exclusive inward)
                            n (numeric-bound narrow inclusive exclusive inward)]
                        (or (nil? w) (and n (not (neg? (* inward (compare n w))))))))]
    (boolean
     (and (or (nil? tw) (and tn (set/subset? tn (cond-> tw (contains? tw "number") (conj "integer")))))
          (or (nil? ew) (and en (set/subset? en ew)))
          (every? #(bound-ok? % >=) lower-bounds)
          (every? #(bound-ok? % <=) upper-bounds)
          (numeric-ok? "minimum" "exclusiveMinimum" 1)
          (numeric-ok? "maximum" "exclusiveMaximum" -1)
          ;; Two regexes cannot be compared, so any change to a pattern or format narrows.
          (every? #(or (not (contains? wide %)) (= (get wide %) (get narrow %))) ["pattern" "format"])
          (or (not (true? (get wide "uniqueItems"))) (true? (get narrow "uniqueItems")))))))

(declare compatible?)

(defn- compatible-uncached?
  "True when changing a schema from `old` to `new` keeps existing callers working.

  `dir` is `:request` or `:response`. Value constraints (type, enum, bounds) invert between the
  two: a request must still ACCEPT every value it did, a response must only RETURN values it could.
  Object fields do not invert: in both directions a removed field breaks, and so does a newly
  required request field or a response field that is no longer always returned.

  A keyword this function does not model ranks as incompatible when it changes. A false breaking
  finding costs a reviewer one look; a missed one ships undocumented."
  [dir old new]
  (let [req? (= dir :request)
        ok?  #(compatible? dir %1 %2)]
    (cond
      (same? old new) true

      ;; An ABSENT old schema constrained nothing, so anything that does not newly demand something
      ;; is safe. `{}` is not absent - it accepts any value, and narrowing it requires more.
      (nil? old)
      (or (not req?)
          (not (or (seq (get new "required")) (false? (get new "additionalProperties")))))

      (not (and (map? old) (map? new))) false

      ;; Unions compare variant by variant: a request must still accept every old variant, and a
      ;; response may only return variants it already could.
      (or (union? old) (union? new))
      (and (if req?
             (every? (fn [o] (some #(ok? o %) (variants new))) (variants old))
             (every? (fn [n] (some #(ok? % n) (variants old))) (variants new)))
           (or (not (and (union? old) (union? new)))
               (same? (dissoc old "oneOf" "anyOf") (dissoc new "oneOf" "anyOf"))))

      :else
      (let [[wide narrow] (if req? [new old] [old new])
            ;; Malli `:fn` predicates emit `{}` into an `allOf`. A member that constrains nothing
            ;; must not shift the positions of the members that do.
            members     (fn [s k] (cond->> (get s k)
                                    (= k "allOf") (remove #(contains? #{{} {"allOf" []}} %))))
            ;; Members pair by position. `allOf` members are conjuncts, so the narrower side may carry
            ;; extra trailing ones: the old side for a request, the new side for a response.
            positional? (fn [k] (let [o (members old k), n (members new k)]
                                  (or (same? o n)
                                      (and (if (= k "allOf")
                                             (if req? (<= (count n) (count o)) (<= (count o) (count n)))
                                             (= (count o) (count n)))
                                           (every? true? (map ok? o n))))))
            open-values (fn [s] (let [a (get s "additionalProperties")] (if (map? a) a {})))
            closed?     (fn [s] (false? (get s "additionalProperties")))
            old-props (get old "properties" {}), new-props (get new "properties" {})
            old-req (set (get old "required")), new-req (set (get new "required"))]
        (boolean
         (and (accepts-all-values? wide narrow)
              ;; A caller who omits a request field gets its default, so changing or dropping one
              ;; changes behavior without changing what validates. Adding one where there was none
              ;; does not: that field was already optional. Response defaults describe nothing.
              (or (not req?) (not (contains? old "default")) (= (get old "default") (get new "default")))
              (positional? "allOf")
              (positional? "prefixItems")
              (ok? (get old "items" {}) (get new "items" {}))
              ;; A map-of value schema: `additionalProperties` holding a schema.
              (or (closed? old) (closed? new) (ok? (open-values old) (open-values new)))
              (not (and req? (closed? new) (not (closed? old))))
              (empty? (set/difference (set (keys old-props)) (set (keys new-props))))
              (empty? (if req? (set/difference new-req old-req) (set/difference old-req new-req)))
              (every? #(ok? (get old-props %) (get new-props %))
                      (set/intersection (set (keys old-props)) (set (keys new-props))))
              (same? (apply dissoc old modeled-keys) (apply dissoc new modeled-keys))))))))

(def ^:private compatible-cache
  "Results of [[compatible?]] by direction and content digest. A digest names a schema's content, so
  an entry stays true for the life of the process.

  ponytail: process-lifetime cache, unbounded; it holds a few thousand booleans per diff."
  (atom {}))

(defn- compatible?
  "[[compatible-uncached?]], cached by content digest. A schema shared by many fields is compared
  once per pair of versions, not once per path that reaches it, which is exponential in depth."
  [dir old new]
  (let [k [dir (digest-of old) (digest-of new)]]
    (if-some [hit (get @compatible-cache k)]
      hit
      (let [result (boolean (compatible-uncached? dir old new))]
        (swap! compatible-cache assoc k result)
        result))))
(defn- operations
  "`{\"POST /api/card\" {:params .. :body .. :responses .. :description .. :docs ..}}` for every
  operation. Schemas are ref-resolved and stripped of [[doc-keys]]; `:docs` is a digest of the
  whole resolved operation, so a documentation-only change can still be reported."
  [spec]
  (let [;; Stripping docs from the unresolved spec is linear; stripping resolved schemas is not.
        ;; Only schema positions: component NAMES are data, and one named `title` must survive.
        stripped       (-> spec
                           (update "paths" strip-docs)
                           (update "components" #(update-vals (or % {}) (fn [m] (if (map? m) (update-vals m strip-docs) m)))))
        resolve-schema (resolver stripped)
        resolve-raw    (resolver spec)
        entries
        (for [[path methods] (get stripped "paths")
              [method stripped-op] methods
              :when (map? stripped-op)
              :let [raw-op (get-in spec ["paths" path method])
                    op     (resolve-schema stripped-op)
                    ;; A caller never sends a path variable's NAME, so renaming `{id}` to
                    ;; `{card-id}` is not a change. Key operations and path params by position.
                    slot (zipmap (map second (re-seq #"\{([^}]+)\}" path)) (range))]]
          [(str (str/upper-case method) " " (str/replace path #"\{[^}]+\}" "{}"))
           {:display (str (str/upper-case method) " " path)
            :params (into {}
                          (for [p (get op "parameters")]
                            [(if (= "path" (get p "in"))
                               (str "path:" (slot (get p "name")))
                               (str (get p "in") ":" (get p "name")))
                             {:label    (str (get p "in") ":" (get p "name"))
                              :required (boolean (get p "required"))
                              :schema   (get p "schema" {})}]))
            ;; nil when there is no body at all. An empty MAP means "any value" (Malli `:any`) and
            ;; must still be compared: narrowing it to a type requires more of the caller.
            :body-required (boolean (get-in op ["requestBody" "required"]))
            :body-types (set (keys (get-in op ["requestBody" "content"])))
            :body (let [content (get-in op ["requestBody" "content"])]
                    (or (get-in content ["application/json" "schema"])
                        (some #(get % "schema") (vals content))))
            :responses (into {}
                             (for [[code resp] (get op "responses")
                                   :when (map? resp)
                                   :let [schema (get-in resp ["content" "application/json" "schema"])]
                                   :when schema]
                               [code schema]))
            :description (str/trim (or (get raw-op "description") ""))
            :docs (digest-of (resolve-raw raw-op))}])
        ;; `/api/database/{id}/schemas` and `/api/database/{virtual-db}/schemas` are distinct routes,
        ;; told apart by parameter patterns. Where position-keying would merge two, keep the names.
        collides? (set (for [[k n] (frequencies (map first entries)) :when (> n 1)] k))]
    (into {} (for [[k v] entries] [(if (collides? k) (:display v) k) v]))))

(defn- nests?
  "Whether a schema holds other schemas beyond a chain of array items."
  [node]
  (and (map? node)
       (or (some #(contains? node %) ["properties" "oneOf" "anyOf" "allOf" "prefixItems"])
           (map? (get node "additionalProperties"))
           (nests? (get node "items")))))

(defn- brief
  "One-line schema summary: type/enum/const rather than a wall of JSON."
  ([value] (brief value 200))
  ([value limit] (brief value limit 0))
  ([value limit depth]
   (let [truncate #(cond-> % (> (count %) limit) (-> (subs 0 limit) (str "...")))
         nested   #(brief % 60 (inc depth))]
     (cond
       ;; Resolved schemas can nest thousands of levels; a summary needs the top few. Leaves, such
       ;; as `string` or `array<string>`, still print.
       (and (> depth 2) (or (sequential? value) (nests? value))) "..."
       (map? value)
       (cond
         (contains? value "const") (str "const=" (truncate (json/write-str (get value "const"))))
         (contains? value "enum") (str "enum=" (truncate (json/write-str (get value "enum"))))
         (seq (concat (get value "oneOf") (get value "anyOf")))
         (str/join " | " (map nested (take 4 (concat (get value "oneOf") (get value "anyOf")))))
         (seq (get value "allOf")) (str/join " & " (map nested (take 4 (get value "allOf"))))
         (and (= "object" (get value "type")) (map? (get value "properties")))
         (str "object{" (truncate (str/join "," (sort (keys (get value "properties"))))) "}")
         (= "array" (get value "type")) (str "array<" (nested (get value "items" {})) ">")
         (get value "type") (str (get value "type"))
         :else (truncate (str "{" (str/join "," (sort (keys value))) "}")))
       (sequential? value) (str "[" (count value) " items]")
       :else (truncate (json/write-str value))))))

(defn- lazy-mapcat
  "`mapcat`, but lazy in the results of `f` too. `mapcat` realizes the first few results through
  `apply concat`, which forces about three subtrees per level of a recursive walk."
  [f coll]
  (lazy-seq
   (when-let [s (seq coll)]
     (concat (f (first s)) (lazy-mapcat f (rest s))))))

(defn- deltas
  "Paths at which `o` and `n` differ, lazily. Lists of scalars, such as enums, show added/removed
  values."
  [path o n]
  (let [show #(if (nil? %) "(none)" (brief % 40))]
    (cond
      (same? o n) []
      (and (map? o) (map? n))
      (lazy-mapcat #(deltas (conj path %) (get o %) (get n %)) (sort (set/union (set (keys o)) (set (keys n)))))
      (and (sequential? o) (sequential? n) (= (count o) (count n)))
      (lazy-mapcat (fn [[i a b]] (deltas (conj path i) a b)) (map vector (range) o n))
      :else
      [(str (if (seq path) (str/join "." path) "value") ": "
            (if (and (sequential? o) (sequential? n) (not-any? coll? o) (not-any? coll? n))
              (str/join " " (concat (map #(str "+" (json/write-str %)) (remove (set o) n))
                                    (map #(str "-" (json/write-str %)) (remove (set n) o))))
              (str (show o) " -> " (show n))))])))

(defn- brief-change
  "`old -> new` summary. When the one-line briefs match, names where the schemas differ instead, so
  a change neither reads as `X -> X` nor merges with a different change in the grouped view."
  [old new]
  (let [o (brief old), n (brief new)]
    (if (not= o n)
      (str o " -> " n)
      ;; Lazy: two large schemas can differ at thousands of paths, and the summary shows three.
      (let [ds (take 4 (deltas [] old new))]
        (str o " (" (str/join "; " (take 3 ds)) (when (> (count ds) 3) "; ...") ")")))))

(def ^:private breaking :breaking)
(def ^:private additive :additive)
(def ^:private doc-only :doc-only)

(def ^:private severity-order {breaking 0, additive 1, doc-only 2})

(defn- worst
  "Most severe of `severities`, for ranking an endpoint by its findings."
  [severities]
  (or (first (sort-by severity-order severities)) doc-only))

(defn- object-shell
  "An object schema without its properties, and without the null of a nullable union: the
  keywords (`allOf`, a map-of `additionalProperties`, `minProperties`, ...) that the property walk
  does not see. A boolean `additionalProperties` is reported separately."
  [node]
  (let [n (non-null node)]
    (cond-> (dissoc n "properties" "required")
      (boolean? (get n "additionalProperties")) (dissoc "additionalProperties"))))

(defn- shell-lines
  "A finding for the keywords beside an object's properties, when they changed."
  [dir pad label old-schema new-schema]
  (let [o (object-shell old-schema), n (object-shell new-schema)]
    (when-not (same? o n)
      [[(if (compatible? dir o n) additive breaking)
        (str pad "~ " label ": " (brief-change o n))]])))

(defn- body-lines
  "Recursively compare request-body schemas, reporting leaf-level changes as `[severity text]`."
  ([label old-schema new-schema] (body-lines label old-schema new-schema 0))
  ([label old-schema new-schema depth]
   (let [pad (str "    " (str/join (repeat depth "  ")))
         [old-props old-req] (schema-props old-schema)
         [new-props new-req] (schema-props new-schema)]
     (cond
       (> depth 4)
       [[(if (compatible? :request old-schema new-schema) additive breaking)
         (str pad "~ " label ": " (brief-change old-schema new-schema))]]

       (or (nil? old-props) (nil? new-props))
       (let [closed? (and (false? (get new-schema "additionalProperties"))
                          (not (false? (get old-schema "additionalProperties"))))]
         (cond-> [[(if (compatible? :request old-schema new-schema) additive breaking)
                   (str pad "~ " label ": " (brief-change old-schema new-schema))]]
           closed? (conj [breaking (str pad "! " label " now rejects undeclared keys (additionalProperties: false)")])))

       :else
       (let [old-keys (set (keys old-props))
             new-keys (set (keys new-props))
             old-types (type-set old-schema)
             new-types (type-set new-schema)]
         (concat
          ;; `schema-props` unwraps a nullable `oneOf`, so both sides reach this branch and the
          ;; property comparison below never sees the type change. A field that no longer accepts
          ;; null requires more of the caller.
          (when (not= old-types new-types)
            [[(if (or (nil? new-types) (and old-types (set/subset? old-types new-types)))
                additive breaking)
              (str pad "~ " label " type: " (sort old-types) " -> " (sort new-types))]])
          (shell-lines :request pad label old-schema new-schema)
          (when (and (false? (get (non-null new-schema) "additionalProperties"))
                     (not (false? (get (non-null old-schema) "additionalProperties"))))
            [[breaking (str pad "! " label " now rejects undeclared keys (additionalProperties: false)")]])
          ;; New fields: required ones demand more of the caller, optional ones do not.
          (for [k (sort (set/difference new-keys old-keys))]
            (if (contains? new-req k)
              [breaking (str pad "+ " label "." k " (REQUIRED - breaking): " (brief (get new-props k)))]
              [additive (str pad "+ " label "." k ": " (brief (get new-props k)))]))
          (for [k (sort (set/difference old-keys new-keys))]
            [breaking (str pad "- " label "." k " REMOVED (was "
                           (if (contains? old-req k) "required" "optional") "): " (brief (get old-props k)))])
          (mapcat (fn [k]
                    (let [o (get old-props k), n (get new-props k)]
                      (concat
                       (when-not (same? o n) (body-lines (str label "." k) o n (inc depth)))
                       (cond
                         (and (contains? new-req k) (not (contains? old-req k)))
                         [[breaking (str pad "! " label "." k " is now REQUIRED (breaking)")]]
                         (and (contains? old-req k) (not (contains? new-req k)))
                         [[additive (str pad "! " label "." k " is no longer required")]]))))
                  (sort (set/intersection old-keys new-keys)))))))))

(defn- response-lines
  "Compare one response schema, recursively. The rule inverts for output: a caller breaks when the
  API PROVIDES LESS. Returning extra data is additive - clients ignore unknown fields.

  Recurses through objects and arrays so each finding names the field it is about; leaves are
  ranked by [[compatible?]] in the `:response` direction."
  ([code old-schema new-schema] (response-lines code old-schema new-schema 0))
  ([code old-schema new-schema depth]
   (let [label (str "response " code)
         pad (str "    " (str/join (repeat depth "  ")))
         [old-props old-req] (schema-props old-schema)
         [new-props new-req] (schema-props new-schema)]
     (cond
       (> depth 6)
       [[(if (compatible? :response old-schema new-schema) additive breaking)
         (str pad "~ " label ": " (brief-change old-schema new-schema))]]

       ;; An array's element schema carries the output contract, so it recurses in the output
       ;; direction. Falling through to the leaf branch would compare items as INPUT and invert
       ;; every finding inside a response array. Nullable arrays unwrap, but only when nullability is
       ;; unchanged: otherwise the leaf branch must see, and report, the null.
       (let [o (non-null old-schema), n (non-null new-schema)]
         (and (= "array" (get o "type")) (= "array" (get n "type"))
              (= (type-set old-schema) (type-set new-schema))
              (not (same? (get o "items") (get n "items")))))
       (response-lines (str code "[]") (get (non-null old-schema) "items" {})
                       (get (non-null new-schema) "items" {}) (inc depth))

       (or (nil? old-props) (nil? new-props))
       ;; Leaf/non-object: providing a narrower set of values is safe, a wider one (a new null, a
       ;; new variant) can break a parsing client.
       [[(if (compatible? :response old-schema new-schema) additive breaking)
         (str pad "~ " label ": " (brief-change old-schema new-schema))]]

       :else
       (let [old-keys (set (keys old-props))
             new-keys (set (keys new-props))
             old-types (type-set old-schema)
             new-types (type-set new-schema)]
         (concat
          ;; `schema-props` unwraps a nullable `oneOf`, so both sides reach this branch and the
          ;; property comparison below never sees the type change. A response that may now be null
          ;; provides less.
          (when (not= old-types new-types)
            [[(if (or (nil? old-types) (and new-types (set/subset? new-types old-types)))
                additive breaking)
              (str pad "~ " label " type: " (sort old-types) " -> " (sort new-types))]])
          (shell-lines :response pad label old-schema new-schema)
          (for [k (sort (set/difference old-keys new-keys))]
            [breaking (str pad "- " label "." k " REMOVED (provides less): " (brief (get old-props k)))])
          (for [k (sort (set/difference new-keys old-keys))]
            [additive (str pad "+ " label "." k ": " (brief (get new-props k)))])
          ;; A field the API may now omit provides less, exactly like one that may now be null.
          (for [k (sort (set/intersection old-keys new-keys))
                :when (and (contains? old-req k) (not (contains? new-req k)))]
            [breaking (str pad "! " label "." k " is no longer always returned (provides less)")])
          (mapcat (fn [k]
                    (let [o (get old-props k), n (get new-props k)]
                      (when-not (same? o n)
                        (response-lines (str code "." k) o n (inc depth)))))
                  (sort (set/intersection old-keys new-keys)))))))))

(defn- changed-operation-lines
  "All findings for one surviving operation, as `[severity text]` pairs."
  [old-op new-op]
  (let [old-params (:params old-op), new-params (:params new-op)
        old-keys (set (keys old-params)), new-keys (set (keys new-params))
        lbl #(:label (or (get new-params %) (get old-params %)))]
    (concat
     (for [p (sort (set/difference new-keys old-keys))]
       (if (:required (get new-params p))
         [breaking (str "    + param " (lbl p) " (REQUIRED - breaking): " (brief (:schema (get new-params p))))]
         [additive (str "    + param " (lbl p) ": " (brief (:schema (get new-params p))))]))
     (for [p (sort (set/difference old-keys new-keys))]
       [breaking (str "    - param " (lbl p) " removed")])
     (mapcat (fn [p]
               (let [po (get old-params p), pn (get new-params p)]
                 (concat
                  (when (not= (:required po) (:required pn))
                    ;; Becoming optional requires LESS of the caller: additive.
                    [[(if (:required pn) breaking additive)
                      (str "    ! param " (lbl p) " required: " (:required po) " -> " (:required pn))]])
                  (when-not (same? (:schema po) (:schema pn))
                    [[(if (compatible? :request (:schema po) (:schema pn)) additive breaking)
                      (str "    ~ param " (lbl p) " schema: " (brief-change (:schema po) (:schema pn)))]]))))
             (sort (set/intersection old-keys new-keys)))
     (when (and (:body-required new-op) (not (:body-required old-op)))
       [[breaking "    ! body is now REQUIRED (breaking)"]])
     (when (and (:body-required old-op) (not (:body-required new-op)))
       [[additive "    ! body is no longer required"]])
     ;; A caller sends one content type; dropping it fails that caller even if the schema is the same.
     (when-let [dropped (seq (sort (set/difference (:body-types old-op) (:body-types new-op))))]
       [[breaking (str "    - body content type no longer accepted: " (str/join ", " dropped))]])
     (when-not (same? (:body old-op) (:body new-op))
       (body-lines "body" (:body old-op) (:body new-op)))
     (let [old-resp (:responses old-op), new-resp (:responses new-op)]
       (concat
        (mapcat (fn [code] (response-lines code (get old-resp code) (get new-resp code)))
                (->> (set/intersection (set (keys old-resp)) (set (keys new-resp)))
                     (remove #(same? (get old-resp %) (get new-resp %)))
                     sort))
        (for [code (sort (set/difference (set (keys old-resp)) (set (keys new-resp))))]
          [breaking (str "    - response " code " schema removed (provides less)")])
        (for [code (sort (set/difference (set (keys new-resp)) (set (keys old-resp))))]
          [additive (str "    + response " code " schema now declared: " (brief (get new-resp code)))]))))))

(defn diff
  "Structured diff of two parsed specs.

  Returns `{:removed :added :changed :old :new :counts}`, with `:changed` sorted breaking-first.
  Operations are named by their spec path (`GET /api/card/{id}`). `:old` and `:new` map those
  names to the parsed operations, which the renderers read for descriptions."
  [old-spec new-spec]
  (let [old (operations old-spec)
        new (operations new-spec)
        old-keys (set (keys old)), new-keys (set (keys new))
        display (fn [ops ks] (sort (map #(:display (get ops %)) ks)))
        schemas (fn [op] (-> (dissoc op :description :docs :display)
                             (update :params update-vals #(dissoc % :label))))
        changed (->> (sort (set/intersection old-keys new-keys))
                     (keep (fn [k]
                             (let [o (get old k)
                                   n (get new k)
                                   findings (changed-operation-lines o n)
                                   ;; A description-only change carries no schema finding, so
                                   ;; without this the DOC_ONLY severity is unreachable. The skill
                                   ;; reads descriptions to spot changes it cannot explain, so a
                                   ;; reworded docstring is worth surfacing.
                                   findings (cond
                                              (seq findings) findings
                                              ;; The walk found nothing, yet the stripped schemas
                                              ;; differ: rank the whole schema rather than let a
                                              ;; real change fall through to doc-only below.
                                              (not (same? (schemas o) (schemas n)))
                                              [[(if (and (compatible? :request (:body o) (:body n))
                                                         (every? #(compatible? :response (get-in o [:responses %]) (get-in n [:responses %]))
                                                                 (keys (:responses o))))
                                                  additive breaking)
                                                "    ~ schema changed in a shape the field-by-field comparison does not cover"]]
                                              (not= (:description o) (:description n))
                                              [[doc-only "    ~ description changed"]]
                                              (not= (:display o) (:display n))
                                              [[doc-only (str "    ~ path variable renamed (callers send the same URL): "
                                                              (:display o) " -> " (:display n))]]
                                              ;; Schemas are compared without their doc keys, so a
                                              ;; reworded field description or a new default lands here.
                                              (not= (:docs o) (:docs n))
                                              [[doc-only "    ~ field documentation changed"]])]
                               (when (seq findings)
                                 {:operation (:display n)
                                  :findings findings
                                  :severity (worst (map first findings))
                                  :old-description (:description o)
                                  :new-description (:description n)}))))
                     (sort-by (juxt (comp severity-order :severity) :operation)))]
    {:removed (display old (set/difference old-keys new-keys))
     :added (display new (set/difference new-keys old-keys))
     :changed changed
     :old (update-keys old #(:display (get old %)))
     :new (update-keys new #(:display (get new %)))
     :counts {:operations-before (count old)
              :operations-after (count new)
              :breaking (+ (count (set/difference old-keys new-keys))
                           (count (filter #(= breaking (:severity %)) changed)))}}))

(defn- print-operation [{:keys [operation findings old-description new-description]} show-docs?]
  (println (str "  ~ " operation))
  (doseq [[_ text] findings] (println text))
  (when (and show-docs? (not= old-description new-description))
    (println (str "      doc was: " (if (str/blank? old-description) "(none)" (subs old-description 0 (min 300 (count old-description))))))
    (println (str "      doc now: " (if (str/blank? new-description) "(none)" (subs new-description 0 (min 300 (count new-description))))))))

(defn- grouped-findings
  "Findings across all changed operations, collapsed by identical text.

  A systematic change (one PR closing every `mu/defn` schema, say) produces the same finding on
  hundreds of endpoints. That is one changelog entry, so report it once with its endpoints rather
  than hundreds of times."
  [changed]
  (->> (for [{:keys [operation findings]} changed
             [severity text] findings]
         {:severity severity :text (str/trim text) :operation operation})
       (group-by (juxt :severity :text))
       (map (fn [[[severity text] occurrences]]
              {:severity severity
               :text text
               :operations (sort (distinct (map :operation occurrences)))}))
       (sort-by (juxt (comp severity-order :severity)
                      (comp - count :operations)
                      :text))))

(defn print-grouped
  "Render `diff` collapsed by distinct change, widest blast radius first."
  [{:keys [removed added changed counts]} min-severity]
  (let [visible? (fn [sev] (or (nil? min-severity)
                               (<= (severity-order sev) (severity-order min-severity))))
        groups (filter (comp visible? :severity) (grouped-findings changed))
        ;; Count only what is printed. `groups` is severity-filtered, so counting `changed` or
        ;; every endpoint inflates the header above the body beneath it.
        ;; The new-endpoint list prints at every severity (see below) but is additive, so it only
        ;; counts when additive changes are shown.
        added-counted (when (visible? additive) added)
        shown-ops (into (set (mapcat :operations groups)) (concat removed added-counted))]
    (println (format "# %d distinct changes across %d endpoints (%d -> %d operations)"
                     (+ (count groups) (if (seq removed) 1 0) (if (seq added-counted) 1 0))
                     (count shown-ops)
                     (:operations-before counts) (:operations-after counts)))
    (println)
    ;; Endpoint lists print at every severity: a removed + added pair is usually one endpoint
    ;; moving, and --severity breaking is exactly where a drafter needs to see both halves.
    (when (seq removed)
      (println (format "## BREAKING: %d REMOVED ENDPOINTS" (count removed)))
      (doseq [k removed] (println (str "  - " k)))
      (println))
    (when (seq added)
      (println (format "## ADDITIVE: %d NEW ENDPOINTS" (count added)))
      (doseq [k added] (println (str "  + " k)))
      (println))
    (doseq [{:keys [severity text operations]} groups]
      (println (format "## %s - %d endpoint%s"
                       (str/upper-case (name severity))
                       (count operations)
                       (if (= 1 (count operations)) "" "s")))
      (println (str "  " text))
      (doseq [op (take 5 operations)] (println (str "    " op)))
      (when (> (count operations) 5)
        (println (str "    ... and " (- (count operations) 5) " more")))
      (println))
    (println "# Grouped by identical finding. A change spanning many endpoints is usually one")
    (println "# upstream PR, and belongs in the changelog as one entry naming its cause.")))

(defn print-diff
  "Render `diff` to stdout, breaking-first. `min-severity` of `:breaking` or `:additive` hides
  less-severe sections."
  [{:keys [removed added changed old new counts]} min-severity]
  (let [visible? (fn [sev] (or (nil? min-severity)
                               (<= (severity-order sev) (severity-order min-severity))))
        total (+ (count removed) (count added) (count changed))]
    (println (format "# %d findings, %d BREAKING (%d removed, %d added, %d changed; %d -> %d operations)"
                     total (:breaking counts) (count removed) (count added) (count changed)
                     (:operations-before counts) (:operations-after counts)))
    (println)
    (when (visible? breaking)
      (println (format "## BREAKING: REMOVED ENDPOINTS (%d)" (count removed)))
      (doseq [k removed]
        (println (str "  - " k))
        (let [d (:description (get old k))]
          (when-not (str/blank? d) (println (str "      doc: " (subs d 0 (min 400 (count d))))))))
      (let [bc (filter #(= breaking (:severity %)) changed)]
        (println)
        (println (format "## BREAKING: CHANGED ENDPOINTS (%d)" (count bc)))
        (doseq [c bc] (print-operation c true))))
    ;; The added-endpoint list prints at every severity: a removed + added pair is usually one
    ;; endpoint moving, and hiding the added half at --severity breaking makes that unpairable.
    (when (seq added)
      (println)
      (println (format "## ADDITIVE: NEW ENDPOINTS (%d) - check if any replaces a removed one" (count added)))
      (doseq [k added]
        (println (str "  + " k))
        (let [d (:description (get new k))]
          (when-not (str/blank? d) (println (str "      doc: " (subs d 0 (min 400 (count d))))))))
      nil)
    (when (visible? additive)
      (let [ac (filter #(= additive (:severity %)) changed)]
        (println)
        (println (format "## ADDITIVE: CHANGED ENDPOINTS (%d)" (count ac)))
        (doseq [c ac] (print-operation c false))))
    (when (visible? doc-only)
      (let [dc (filter #(= doc-only (:severity %)) changed)]
        (println)
        (println (format "## DOC_ONLY: CHANGED ENDPOINTS (%d)" (count dc)))
        (doseq [c dc] (print-operation c true))))
    (println)
    (println "# Legend: + added  - removed  ~ modified  ! requiredness changed")
    (println "# Breaking = an existing caller, sending what it sent before, can now fail or get a")
    (println "# different result. When the tool cannot tell, it ranks breaking.")))

(def ^:private spec-path "resources/openapi/openapi.json")

(defn- spec-blob-exists?
  "Whether `ref` has a committed openapi.json."
  [ref]
  (zero? (:exit (shell/sh* {:quiet? true} "git" "rev-parse" "--verify" "--quiet"
                           (str ref ":" spec-path)))))

(defn- committed-spec!
  "Write `ref`'s committed spec to `out-path`. Returns out-path.

  Shells out with output redirected rather than capturing: the spec is megabytes of JSON, and
  line-splitting then rejoining it is both wasteful and lossy on trailing whitespace."
  [ref out-path]
  (let [{:keys [exit]} (shell/sh* {:quiet? true}
                                  ;; Values ride as positional args so the shell never parses them:
                                  ;; interpolating a ref into the command string lets a ref
                                  ;; containing `$`, a quote, or a space produce a wrong file.
                                  "sh" "-c" "git show \"$1\" > \"$2\"" "sh"
                                  (str ref ":" spec-path) out-path)]
    (when-not (zero? exit)
      (u/exit (str "Could not read " spec-path " at " ref
                   ". Try a fully-qualified ref such as origin/" ref ".") 1))
    out-path))

(defn- generated-spec!
  "Generate `ref`'s spec from source in a throwaway worktree and copy it to `out-path`.

  Generating beats reading the committed blob because the committed spec only updates on PRs
  labelled `openapi-self-healing`, so it lags the source it claims to describe. Costs a JVM boot.

  Runs the ref's OWN `generate-openapi-spec` command, which writes to the worktree's copy of
  `resources/openapi/openapi.json`; the worktree is then discarded, so no checkout is modified and
  no support is needed from the ref beyond that command already existing. Returns nil when the ref
  cannot be built."
  [ref out-path]
  (let [worktree (str "/tmp/openapi-diff-" (str/replace ref #"[^A-Za-z0-9]" "_") "-" (System/currentTimeMillis))]
    (println (str "  generating " ref " from source (JVM boot, ~2 min)..."))
    (try
      (let [{:keys [exit err]} (shell/sh* {:quiet? true} "git" "worktree" "add" "--detach" worktree ref)]
        (when-not (zero? exit)
          (u/exit (str "Could not create a worktree for " ref ":\n" (str/join "\n" err)) 1)))
      ;; The checkout includes the committed spec. Delete it so `.exists` below proves the command
      ;; wrote a file: the generator logs and swallows its own errors, then exits 0.
      (io/delete-file (io/file worktree spec-path) true)
      (let [{:keys [exit err]} (try
                                 (shell/sh* {:quiet? true :dir worktree :timeout-ms 900000}
                                            "clojure" "-M:run:ee" "generate-openapi-spec")
                                 (catch clojure.lang.ExceptionInfo e
                                   {:exit 1 :err [(ex-message e)]}))
            generated (io/file worktree spec-path)]
        (if (and (zero? exit) (.exists generated))
          (do (io/copy generated (io/file out-path)) out-path)
          (do (println (str "  Could not generate a spec at " ref
                            " (old refs may not build with the current toolchain)."))
              (doseq [line (take-last 3 (remove #(re-find #"(?i)reflection warning" %) err))]
                (println (str "  " line)))
              nil)))
      (finally
        (shell/sh* {:quiet? true} "git" "worktree" "remove" "--force" worktree)))))

(defn- spec-for-ref!
  "Materialize `ref`'s spec at `out-path`. Returns `[path stale?]`.

  Generates from source unless `committed?`. A generation failure falls back to the committed blob,
  which is reported as stale so the caller can say so rather than presenting a possibly-empty diff
  as authoritative."
  [ref out-path committed?]
  (if committed?
    [(committed-spec! ref out-path) true]
    (if-let [generated (generated-spec! ref out-path)]
      [generated false]
      (if (spec-blob-exists? ref)
        (do (println (str "  Falling back to " ref "'s committed spec."))
            [(committed-spec! ref out-path) true])
        (u/exit (str "Could not generate a spec at " ref ", and it has no committed spec.") 1)))))

(def ^:private api-source-pathspecs
  "Everything that can declare an endpoint.

  `src/metabase/**/api.clj` alone matches 65 files while 160 contain `defendpoint`: endpoints also
  live under `src/metabase/*/api/*.clj` and throughout `enterprise/backend/src`, and the spec
  carries 106 `/api/ee/` paths. Watching only the narrow pathspec lets the check report
  `OK: spec is current` while dozens of newer endpoint files sit on disk, which is the exact
  failure it exists to prevent."
  ["src/metabase/**/api.clj"
   "src/metabase/**/api/*.clj"
   "src/metabase/**/routes.clj"
   "enterprise/backend/src/**/api.clj"
   "enterprise/backend/src/**/api/*.clj"
   "enterprise/backend/src/**/routes.clj"])

(defn- last-commit-epoch
  "Unix timestamp of the last commit touching `paths`, or nil when none.

  Epoch seconds rather than `%cI`: this history carries both `+08:00` and `Z` offsets, so two
  same-day commits in different zones sort wrong when ISO strings are compared lexically."
  [paths]
  (let [{:keys [out]} (apply shell/sh* {:quiet? true} "git" "log" "-1" "--format=%ct" "--" paths)]
    (some-> (not-empty (str/trim (str/join out))) parse-long)))

(defn- format-epoch
  "`epoch` seconds as a local `YYYY-MM-DD` date.

  `java.time` rather than `date -r`: only BSD/macOS reads `-r` as epoch seconds, so on GNU
  coreutils it means \"the mtime of this file\" and silently prints nothing."
  [epoch]
  (str (java.time.LocalDate/ofInstant (java.time.Instant/ofEpochSecond epoch)
                                      (java.time.ZoneId/systemDefault))))

(defn cli-staleness
  "Entry point for `./bin/mage openapi-staleness`.

  The self-healing CI job only runs on PRs labelled `openapi-self-healing`, so the committed spec
  drifts behind master by default. A stale spec makes a diff produce FALSE NEGATIVES: changes that
  landed in source but were never regenerated are simply not reported."
  [_]
  (let [spec-epoch (last-commit-epoch [spec-path])
        src-epoch  (last-commit-epoch api-source-pathspecs)]
    (println (str "spec last changed: " (if spec-epoch (format-epoch spec-epoch) "never")))
    (println (str "API source last changed: " (if src-epoch (format-epoch src-epoch) "never")))
    (cond
      (not (and spec-epoch src-epoch))
      (u/exit "\nCould not determine both dates; verify by hand." 1)

      (< spec-epoch src-epoch)
      (do
        (println "\nSTALE: the committed OpenAPI spec predates the newest API source change.")
        (println "A diff against this spec under-reports. Either regenerate it for the current")
        (println "working tree with `bun run generate-openapi`, or confirm suspected gaps directly")
        (println "in source with `grep -rn defendpoint src/metabase/<module>/api.clj`.")
        (println "\nCommits that touched API source since the spec was last updated:")
        ;; A commit range, not `--since`: the commit that last updated the spec often touched API
        ;; source too, and `--since` includes it.
        (let [spec-sha (first (:out (shell/sh* {:quiet? true} "git" "log" "-1" "--format=%H" "--" spec-path)))
              {:keys [out]} (apply shell/sh* {:quiet? true}
                                   "git" "log" "--format=  %h %ad %an | %s" "--date=short"
                                   (str spec-sha "..HEAD") "--"
                                   api-source-pathspecs)]
          (doseq [line (take 20 out)] (println line)))
        (u/exit 1))

      :else
      (do (println "\nOK: no endpoint file is newer than the committed spec.")
          ;; Deliberately narrower than "the spec is current": 661 of the 763 component schemas
          ;; live outside `.api` namespaces (`metabase.lib.schema.*` and friends, often `.cljc`),
          ;; so a shared-schema change moves the generated spec without touching any endpoint file.
          (println "This reads endpoint files only - a change to a shared schema such as")
          (println "metabase.lib.schema.* will not show up here. `openapi-diff --refs` generates")
          (println "both specs from source and is the reliable path.")))))

(defn cli-diff
  "Entry point for `./bin/mage openapi-diff`.

  Takes either two spec files, or two git refs with `--refs`. With `--refs` each ref's spec is
  generated from its source in a throwaway worktree, which is slower than reading the committed
  blob but is not subject to its drift."
  [{:keys [arguments options]}]
  (let [[old-arg new-arg] arguments
        severity-arg (some-> (:severity options) str/lower-case)
        ;; An unrecognised value must not silently disable the filter: a typo would otherwise
        ;; print the full diff and read as "there were no other changes".
        min-severity (case severity-arg
                       "breaking" breaking
                       "additive" additive
                       nil nil
                       (u/exit (str "Unknown --severity " (pr-str severity-arg)
                                    ". Use `breaking` or `additive`.") 1))
        _ (when (and (:committed options) (not (:refs options)))
            (u/exit "--committed only applies with --refs." 1))
        tmp-dir (when (:refs options)
                  (str "/tmp/openapi-diff-specs-" (System/currentTimeMillis)))]
    (try
      ;; Spec materialization sits INSIDE the try: `spec-for-ref!` exits when a ref can neither be
      ;; generated nor read, and doing this in the `let` bindings leaked the first spec.
      (let [[old-path new-path stale-refs]
            (if (:refs options)
              (let [committed? (boolean (:committed options))]
                (.mkdirs (io/file tmp-dir))
                (let [[op ostale] (spec-for-ref! old-arg (str tmp-dir "/old.json") committed?)
                      [np nstale] (spec-for-ref! new-arg (str tmp-dir "/new.json") committed?)]
                  [op np (cond-> [] ostale (conj old-arg) nstale (conj new-arg))]))
              [old-arg new-arg []])]
        (when (:refs options) (println))
        (let [read-spec (fn [path]
                          (when-not (.exists (io/file path))
                            (u/exit (str path " does not exist.") 1))
                          (let [s (try (json/read-str (slurp path) {:key-fn identity})
                                       (catch Exception _ nil))]
                            ;; An empty or non-spec file would otherwise diff as zero operations
                            ;; and report "0 BREAKING".
                            (if (map? (get s "paths"))
                              s
                              (u/exit (str path " is not an OpenAPI spec (no \"paths\" object).") 1))))
              d (diff (read-spec old-path) (read-spec new-path))]
          (if (:grouped options)
            (print-grouped d min-severity)
            (print-diff d min-severity)))
        (when (seq stale-refs)
          (println)
          (println (str "# WARNING: used the committed spec for " (str/join " and " stale-refs) "."))
          (println "# The committed spec only updates on PRs labelled `openapi-self-healing`, so it lags")
          (println "# source. This diff UNDER-REPORTS: changes never regenerated into the spec are absent,")
          (println "# and an empty result does not mean there were no changes.")))
      (finally
        ;; Generated specs are megabytes each; leaving them behind fills /tmp over a few runs.
        (when tmp-dir
          (doseq [f (reverse (file-seq (io/file tmp-dir)))]
            (io/delete-file f true)))))))
