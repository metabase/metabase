(ns mage.openapi-diff
  "Semantic diff of two OpenAPI specs, for drafting the REST API changelog.

  `resources/openapi/openapi.json` is generated from the Malli endpoint schemas, so the spec at any
  git ref is what the API was at that ref. Diffing two specs answers \"what changed for a client?\"
  without reading endpoint source or booting a server.

  A change is BREAKING when it requires MORE from the caller, or provides LESS to the caller.
  Anything else is just a change. That rule is directional, and it inverts between request and
  response, so severity is decided from both schemas rather than from how a change happens to
  render:

    request   breaking: newly required, type/enum narrowed, schema closed, field removed
              additive: new OPTIONAL field or param, type/enum widened, made nullable
    response  breaking: field removed, field may now be null
              additive: new field returned

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

(defn- resolve-refs
  "Inline `$ref`s in `node` so two specs compare structurally rather than by ref name. Component
  schemas change too, so a ref that looks identical can point at a different shape.

  There is no depth limit: `seen` holds every ref on the current path, so a repeat becomes
  `<recursive ...>` and every path terminates against a finite component set. A hop limit would
  instead replace deep nodes with the same literal on both sides, which compares equal and hides
  the change - the MBQL clause schemas form chains long enough to hit it."
  ([node spec] (resolve-refs node spec #{}))
  ([node spec seen]
   (cond
     (map? node)
     ;; A $ref node holds a STRING pointer. SCIM schemas have a property literally named "$ref"
     ;; (`{"properties": {"$ref": {...}}}`), which is data, not a reference - hence the string check.
     (if-let [ref (let [r (get node "$ref")] (when (string? r) r))]
       (if (contains? seen ref)
         (str "<recursive " ref ">")
         (let [path   (str/split (subs ref 2) #"/")
               target (get-in spec path {})
               rest'  (dissoc node "$ref")
               merged (if (seq rest') (merge target rest') target)]
           (resolve-refs merged spec (conj seen ref))))
       (update-vals node #(resolve-refs % spec seen)))

     (sequential? node) (mapv #(resolve-refs % spec seen) node)
     :else node)))

(defn- object-variants
  "The object variants of a `oneOf`/`anyOf` union, in order."
  [node]
  (when (map? node)
    (filterv #(and (map? %) (get % "properties"))
             (concat (get node "oneOf") (get node "anyOf")))))

(defn- non-null
  "The single real variant of a nullable union such as `oneOf [<array> {type: null}]`, else `node`."
  [node]
  (let [variants (when (map? node) (concat (get node "oneOf") (get node "anyOf")))
        others   (remove #(= {"type" "null"} %) variants)]
    (if (and (= 1 (count others)) (< 1 (count variants))) (first others) node)))

(defn- schema-props
  "`[properties required-set]` for an object-ish schema, else `[nil #{}]`. Unwraps the common
  `oneOf [<object> {type: null}]` nullable pattern.

  A union of two or more object variants has no single property set, so it is `[nil #{}]` and
  callers compare it whole. Taking the first variant's properties would hide any change to the
  others, including removing one."
  [node]
  (if (map? node)
    (if-let [props (get node "properties")]
      [props (set (get node "required"))]
      (or (when (next (object-variants node)) [nil #{}])
          (some (fn [variant]
                  (when-let [props (and (map? variant) (get variant "properties"))]
                    [props (set (get variant "required"))]))
                (concat (get node "oneOf") (get node "anyOf")))
          [nil #{}]))
    [nil #{}]))

(defn- type-set
  "Set of JSON types a schema accepts, or nil when unconstrained."
  [node]
  (when (and (map? node) (seq node))
    (if-let [variants (seq (concat (get node "oneOf") (get node "anyOf")))]
      (let [parts (map type-set variants)]
        (when-not (some nil? parts)
          (reduce set/union #{} parts)))
      (when-let [t (get node "type")]
        (if (string? t) #{t} (set t))))))

(defn- enum-set
  "Set of literal values a schema accepts, or nil when it is not an enum."
  [node]
  (when (map? node)
    (cond
      (contains? node "const") #{(json/write-str (get node "const"))}
      (sequential? (get node "enum")) (set (map json/write-str (get node "enum")))
      :else nil)))

(defn- widening?
  "True when `new-schema` accepts every input `old-schema` did.

  Widening requires the same or less of the caller, so existing callers keep working. Narrowing a
  type, shrinking an enum, adding a required field, or closing a schema all require more."
  [old-schema new-schema]
  (cond
    (= old-schema new-schema) true

    ;; An ABSENT old schema constrained nothing, so anything that does not newly demand something
    ;; is safe. `{}` is not absent - it accepts any value, and narrowing it requires more - so it
    ;; falls through to the type and enum checks below.
    (and (nil? old-schema) (map? new-schema))
    (not (or (seq (get new-schema "required"))
             (false? (get new-schema "additionalProperties"))))

    :else
    (let [old-types (type-set old-schema)
          new-types (type-set new-schema)
          old-enum  (enum-set old-schema)
          new-enum  (enum-set new-schema)]
      (cond
        ;; Dropped an accepted type, or went from unconstrained to constrained.
        (and old-types new-types (not (set/subset? old-types new-types))) false
        (and (nil? old-types) new-types) false
        ;; Removed an accepted value, or went from open to a restricted value set.
        (and old-enum new-enum (not (set/subset? old-enum new-enum))) false
        (and (nil? old-enum) new-enum) false

        ;; Object unions compare by whole variant: widening only when every old variant survives
        ;; unchanged. This does not look inside a variant, so an edited variant reads as narrowing -
        ;; conservative, but no union change stays invisible. A plain object counts as one variant.
        (or (next (object-variants old-schema)) (next (object-variants new-schema)))
        (let [variants #(set (or (not-empty (object-variants %)) [%]))]
          (set/subset? (variants old-schema) (variants new-schema)))

        ;; An array narrows when its element schema narrows. Without this an `items` change is
        ;; invisible: the enclosing arrays compare as equal-typed and the leaf never gets checked.
        ;; Nullable arrays unwrap first; the type check above already governed the null itself.
        (let [o (non-null old-schema), n (non-null new-schema)]
          (and (= "array" (get o "type")) (= "array" (get n "type"))
               (not= (get o "items") (get n "items"))))
        (widening? (get (non-null old-schema) "items" {}) (get (non-null new-schema) "items" {}))

        :else
        (let [[old-props old-req] (schema-props old-schema)
              [new-props new-req] (schema-props new-schema)]
          (cond
            ;; No object structure to compare; the type/enum checks above governed.
            (or (nil? old-props) (nil? new-props)) true
            ;; Undeclared keys now rejected.
            (and (false? (get new-schema "additionalProperties"))
                 (not (false? (get old-schema "additionalProperties")))) false
            ;; A field the caller could send is gone, or something became required.
            (seq (set/difference (set (keys old-props)) (set (keys new-props)))) false
            (seq (set/difference new-req old-req)) false
            :else (every? (fn [k]
                            (let [o (get old-props k), n (get new-props k)]
                              (or (= o n) (widening? o n))))
                          (set/intersection (set (keys old-props)) (set (keys new-props))))))))))

(defn- operations
  "`{\"POST /api/card\" {:params .. :body .. :responses .. :description ..}}` for every operation."
  [spec]
  (into {}
        (for [[path methods] (get spec "paths")
              [method op] methods
              :when (map? op)]
          [(str (str/upper-case method) " " path)
           {:params (into {}
                          (for [p (get op "parameters")]
                            [(str (get p "in") ":" (get p "name"))
                             {:required (boolean (get p "required"))
                              :schema   (resolve-refs (get p "schema" {}) spec)}]))
            ;; nil when there is no body at all. An empty MAP means "any value" (Malli `:any`) and
            ;; must still be compared: narrowing it to a type requires more of the caller.
            :body (some-> (get-in op ["requestBody" "content" "application/json" "schema"])
                          (resolve-refs spec))
            :responses (into {}
                             (for [[code resp] (get op "responses")
                                   :when (map? resp)
                                   :let [schema (get-in resp ["content" "application/json" "schema"])]
                                   :when schema]
                               [code (resolve-refs schema spec)]))
            :description (str/trim (or (get op "description") ""))}])))

(defn- brief
  "One-line schema summary: type/enum/const rather than a wall of JSON."
  ([value] (brief value 200))
  ([value limit]
   (if (map? value)
     (let [truncate #(cond-> % (> (count %) limit) (-> (subs 0 limit) (str "...")))]
       (cond
         (contains? value "const") (str "const=" (truncate (json/write-str (get value "const"))))
         (contains? value "enum") (str "enum=" (truncate (json/write-str (get value "enum"))))
         (seq (concat (get value "oneOf") (get value "anyOf")))
         (str/join " | " (map #(brief % 60) (take 4 (concat (get value "oneOf") (get value "anyOf")))))
         (and (= "object" (get value "type")) (map? (get value "properties")))
         (str "object{" (truncate (str/join "," (sort (keys (get value "properties"))))) "}")
         (= "array" (get value "type")) (str "array<" (brief (get value "items" {}) 60) ">")
         (get value "type") (str (get value "type"))
         :else (truncate (json/write-str value))))
     (let [s (json/write-str value)]
       (cond-> s (> (count s) limit) (-> (subs 0 limit) (str "...")))))))

(def ^:private breaking :breaking)
(def ^:private additive :additive)
(def ^:private doc-only :doc-only)

(def ^:private severity-order {breaking 0, additive 1, doc-only 2})

(defn- worst
  "Most severe of `severities`, for ranking an endpoint by its findings."
  [severities]
  (or (first (sort-by severity-order severities)) doc-only))

(defn- body-lines
  "Recursively compare request-body schemas, reporting leaf-level changes as `[severity text]`."
  ([label old-schema new-schema] (body-lines label old-schema new-schema 0))
  ([label old-schema new-schema depth]
   (let [pad (str "    " (str/join (repeat depth "  ")))
         [old-props old-req] (schema-props old-schema)
         [new-props new-req] (schema-props new-schema)]
     (cond
       (> depth 4)
       [[(if (widening? old-schema new-schema) additive breaking)
         (str pad "~ " label ": " (brief old-schema) " -> " (brief new-schema))]]

       (or (nil? old-props) (nil? new-props))
       (let [closed? (and (false? (get new-schema "additionalProperties"))
                          (not (false? (get old-schema "additionalProperties"))))]
         (cond-> [[(if (widening? old-schema new-schema) additive breaking)
                   (str pad "~ " label ": " (brief old-schema) " -> " (brief new-schema))]]
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
          (when (and (false? (get new-schema "additionalProperties"))
                     (not (false? (get old-schema "additionalProperties"))))
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
                       (when-not (= o n) (body-lines (str label "." k) o n (inc depth)))
                       (cond
                         (and (contains? new-req k) (not (contains? old-req k)))
                         [[breaking (str pad "! " label "." k " is now REQUIRED (breaking)")]]
                         (and (contains? old-req k) (not (contains? new-req k)))
                         [[additive (str pad "! " label "." k " is no longer required")]]))))
                  (sort (set/intersection old-keys new-keys)))))))))

(defn- response-lines
  "Compare one response schema, recursively. The rule inverts for output: a caller breaks when the
  API PROVIDES LESS. Returning extra data is additive - clients ignore unknown fields.

  Recurses rather than delegating a nested schema to [[widening?]]: swapping that function's
  arguments inverts value-set semantics (which is why a nullable string reads correctly) but NOT
  object-property semantics. A schema that drops a property is more permissive as INPUT whichever
  way the arguments are passed, so a removed response field would read as additive. Arrays recurse
  through their `items` for the same reason."
  ([code old-schema new-schema] (response-lines code old-schema new-schema 0))
  ([code old-schema new-schema depth]
   (let [label (str "response " code)
         pad (str "    " (str/join (repeat depth "  ")))
         [old-props old-req] (schema-props old-schema)
         [new-props new-req] (schema-props new-schema)]
     (cond
       (> depth 6)
       [[(if (widening? new-schema old-schema) additive breaking)
         (str pad "~ " label ": " (brief old-schema) " -> " (brief new-schema))]]

       ;; An array's element schema carries the output contract, so it recurses in the output
       ;; direction. Falling through to the leaf branch would compare items as INPUT and invert
       ;; every finding inside a response array. Nullable arrays unwrap, but only when nullability is
       ;; unchanged: otherwise the leaf branch must see, and report, the null.
       (let [o (non-null old-schema), n (non-null new-schema)]
         (and (= "array" (get o "type")) (= "array" (get n "type"))
              (= (type-set old-schema) (type-set new-schema))
              (not= (get o "items") (get n "items"))))
       (response-lines (str code "[]") (get (non-null old-schema) "items" {})
                       (get (non-null new-schema) "items" {}) (inc depth))

       (or (nil? old-props) (nil? new-props))
       ;; Leaf/non-object: providing a narrower set of values is safe, a wider one (a new null, a
       ;; new variant) can break a parsing client. Note the reversed argument order.
       [[(if (widening? new-schema old-schema) additive breaking)
         (str pad "~ " label ": " (brief old-schema) " -> " (brief new-schema))]]

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
                      (when (not= o n)
                        (response-lines (str code "." k) o n (inc depth)))))
                  (sort (set/intersection old-keys new-keys)))))))))

(defn- changed-operation-lines
  "All findings for one surviving operation, as `[severity text]` pairs."
  [old-op new-op]
  (let [old-params (:params old-op), new-params (:params new-op)
        old-keys (set (keys old-params)), new-keys (set (keys new-params))]
    (concat
     (for [p (sort (set/difference new-keys old-keys))]
       (if (:required (get new-params p))
         [breaking (str "    + param " p " (REQUIRED - breaking): " (brief (:schema (get new-params p))))]
         [additive (str "    + param " p ": " (brief (:schema (get new-params p))))]))
     (for [p (sort (set/difference old-keys new-keys))]
       [breaking (str "    - param " p " removed")])
     (mapcat (fn [p]
               (let [po (get old-params p), pn (get new-params p)]
                 (concat
                  (when (not= (:required po) (:required pn))
                    ;; Becoming optional requires LESS of the caller: additive.
                    [[(if (:required pn) breaking additive)
                      (str "    ! param " p " required: " (:required po) " -> " (:required pn))]])
                  (when (not= (:schema po) (:schema pn))
                    [[(if (widening? (:schema po) (:schema pn)) additive breaking)
                      (str "    ~ param " p " schema: " (brief (:schema po)) " -> " (brief (:schema pn)))]]))))
             (sort (set/intersection old-keys new-keys)))
     (when (not= (:body old-op) (:body new-op))
       (body-lines "body" (:body old-op) (:body new-op)))
     (let [old-resp (:responses old-op), new-resp (:responses new-op)]
       (concat
        (mapcat (fn [code] (response-lines code (get old-resp code) (get new-resp code)))
                (->> (set/intersection (set (keys old-resp)) (set (keys new-resp)))
                     (filter #(not= (get old-resp %) (get new-resp %)))
                     sort))
        (for [code (sort (set/difference (set (keys old-resp)) (set (keys new-resp))))]
          [breaking (str "    - response " code " schema removed (provides less)")]))))))

(defn diff
  "Structured diff of two parsed specs.

  Returns `{:removed :added :changed :old :new :counts}`, with `:changed` sorted breaking-first.
  `:old` and `:new` are the parsed operation maps, which the renderers read for descriptions."
  [old-spec new-spec]
  (let [old (operations old-spec)
        new (operations new-spec)
        old-keys (set (keys old)), new-keys (set (keys new))
        removed (sort (set/difference old-keys new-keys))
        added (sort (set/difference new-keys old-keys))
        changed (->> (sort (set/intersection old-keys new-keys))
                     (keep (fn [k]
                             (let [o (get old k)
                                   n (get new k)
                                   findings (changed-operation-lines o n)
                                   ;; A description-only change carries no schema finding, so
                                   ;; without this the DOC_ONLY severity is unreachable. The skill
                                   ;; reads descriptions to spot changes it cannot explain, so a
                                   ;; reworded docstring is worth surfacing.
                                   findings (cond-> findings
                                              (and (empty? findings)
                                                   (not= (:description o) (:description n)))
                                              (conj [doc-only "    ~ description changed"]))]
                               (when (seq findings)
                                 {:operation k
                                  :findings findings
                                  :severity (worst (map first findings))
                                  :old-description (:description o)
                                  :new-description (:description n)}))))
                     (sort-by (juxt (comp severity-order :severity) :operation)))]
    {:removed removed
     :added added
     :changed changed
     :old old
     :new new
     :counts {:operations-before (count old)
              :operations-after (count new)
              :breaking (+ (count removed)
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
        shown-ops (into (set (mapcat :operations groups)) (concat removed added))]
    (println (format "# %d distinct changes across %d endpoints (%d -> %d operations)"
                     (+ (count groups) (if (seq removed) 1 0) (if (seq added) 1 0))
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
    (println "# Breaking = requires MORE from the caller, or provides LESS to the caller.")))

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
      (let [{:keys [exit err]} (shell/sh* {:quiet? true :dir worktree :timeout-ms 900000}
                                          "clojure" "-M:run:ee" "generate-openapi-spec")
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
        (let [{:keys [out]} (apply shell/sh* {:quiet? true}
                                   "git" "log" "--format=  %h %ad %an | %s" "--date=short"
                                   (str "--since=@" spec-epoch) "--"
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
        (let [d (diff (json/read-str (slurp old-path) {:key-fn identity})
                      (json/read-str (slurp new-path) {:key-fn identity}))]
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
