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
   ;; mage runs under babashka, which bundles cheshire; metabase.util.json isn't on its classpath
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private max-ref-depth
  "Recursion guard for self-referential `$ref` chains."
  12)

(defn- resolve-refs
  "Inline `$ref`s in `node` so two specs compare structurally rather than by ref name. Component
  schemas change too, so a ref that looks identical can point at a different shape."
  ([node spec] (resolve-refs node spec 0 #{}))
  ([node spec depth seen]
   (cond
     (> depth max-ref-depth) "<deep>"

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
           (resolve-refs merged spec (inc depth) (conj seen ref))))
       (update-vals node #(resolve-refs % spec (inc depth) seen)))

     (sequential? node) (mapv #(resolve-refs % spec (inc depth) seen) node)
     :else node)))

(defn- schema-props
  "`[properties required-set]` for an object-ish schema, else `[nil #{}]`. Unwraps the common
  `oneOf [<object> {type: null}]` nullable pattern."
  [node]
  (if (map? node)
    (if-let [props (get node "properties")]
      [props (set (get node "required"))]
      (or (some (fn [variant]
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
      (contains? node "const") #{(json/generate-string (get node "const"))}
      (sequential? (get node "enum")) (set (map json/generate-string (get node "enum")))
      :else nil)))

(defn- widening?
  "True when `new-schema` accepts every input `old-schema` did.

  Widening requires the same or less of the caller, so existing callers keep working. Narrowing a
  type, shrinking an enum, adding a required field, or closing a schema all require more."
  [old-schema new-schema]
  (cond
    (= old-schema new-schema) true

    ;; An absent/empty old schema constrained nothing, so anything that does not newly demand
    ;; something is safe.
    (and (empty? old-schema) (map? new-schema))
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
            :body (resolve-refs (get-in op ["requestBody" "content" "application/json" "schema"] {}) spec)
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
         (contains? value "const") (str "const=" (truncate (json/generate-string (get value "const"))))
         (contains? value "enum") (str "enum=" (truncate (json/generate-string (get value "enum"))))
         (seq (concat (get value "oneOf") (get value "anyOf")))
         (str/join " | " (map #(brief % 60) (take 4 (concat (get value "oneOf") (get value "anyOf")))))
         (and (= "object" (get value "type")) (map? (get value "properties")))
         (str "object{" (truncate (str/join "," (sort (keys (get value "properties"))))) "}")
         (= "array" (get value "type")) (str "array<" (brief (get value "items" {}) 60) ">")
         (get value "type") (str (get value "type"))
         :else (truncate (json/generate-string value))))
     (let [s (json/generate-string value)]
       (cond-> s (> (count s) limit) (subs 0 limit))))))

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
             new-keys (set (keys new-props))]
         (concat
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
  "Compare one response schema. The rule inverts for output: a caller breaks when the API PROVIDES
  LESS. Returning extra data is additive - clients ignore unknown fields."
  [code old-schema new-schema]
  (let [[old-props _] (schema-props old-schema)
        [new-props _] (schema-props new-schema)]
    (if (or (nil? old-props) (nil? new-props))
      ;; Leaf/non-object: providing a narrower set of values is safe, a wider one (a new null, a new
      ;; variant) can break a parsing client. Note the reversed argument order.
      [[(if (widening? new-schema old-schema) additive breaking)
        (str "    ~ response " code ": " (brief old-schema) " -> " (brief new-schema))]]
      (let [old-keys (set (keys old-props))
            new-keys (set (keys new-props))]
        (concat
         (for [k (sort (set/difference old-keys new-keys))]
           [breaking (str "    - response " code "." k " REMOVED (provides less): " (brief (get old-props k)))])
         (for [k (sort (set/difference new-keys old-keys))]
           [additive (str "    + response " code "." k ": " (brief (get new-props k)))])
         (for [k (sort (set/intersection old-keys new-keys))
               :let [o (get old-props k), n (get new-props k)]
               :when (not= o n)]
           [(if (widening? n o) additive breaking)
            (str "    ~ response " code "." k ": " (brief o) " -> " (brief n))]))))))

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
  "Structured diff of two parsed specs. Returns `{:removed :added :changed :counts}`, with `:changed`
  sorted breaking-first."
  [old-spec new-spec]
  (let [old (operations old-spec)
        new (operations new-spec)
        old-keys (set (keys old)), new-keys (set (keys new))
        removed (sort (set/difference old-keys new-keys))
        added (sort (set/difference new-keys old-keys))
        changed (->> (sort (set/intersection old-keys new-keys))
                     (keep (fn [k]
                             (let [findings (changed-operation-lines (get old k) (get new k))]
                               (when (seq findings)
                                 {:operation k
                                  :findings findings
                                  :severity (worst (map first findings))
                                  :old-description (:description (get old k))
                                  :new-description (:description (get new k))}))))
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
        endpoint-changes (+ (count removed) (count added))]
    (println (format "# %d distinct changes across %d endpoints (%d -> %d operations)"
                     (+ (count groups) endpoint-changes)
                     (+ (count changed) endpoint-changes)
                     (:operations-before counts) (:operations-after counts)))
    (println)
    (when (and (visible? breaking) (seq removed))
      (println (format "## BREAKING: %d REMOVED ENDPOINTS" (count removed)))
      (doseq [k removed] (println (str "  - " k)))
      (println))
    (when (and (visible? additive) (seq added))
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
    (when (visible? additive)
      (println)
      (println (format "## ADDITIVE: NEW ENDPOINTS (%d) - check if any replaces a removed one" (count added)))
      (doseq [k added]
        (println (str "  + " k))
        (let [d (:description (get new k))]
          (when-not (str/blank? d) (println (str "      doc: " (subs d 0 (min 400 (count d))))))))
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
                                  "sh" "-c" (str "git show " ref ":" spec-path " > " out-path))]
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

(defn- last-commit-date
  "ISO date of the last commit touching `paths`, or nil when none."
  [& paths]
  (let [{:keys [out]} (apply shell/sh* {:quiet? true} "git" "log" "-1" "--format=%cI" "--" paths)]
    (not-empty (str/trim (str/join out)))))

(defn cli-staleness
  "Entry point for `./bin/mage openapi-staleness`.

  The self-healing CI job only runs on PRs labelled `openapi-self-healing`, so the committed spec
  drifts behind master by default. A stale spec makes a diff produce FALSE NEGATIVES: changes that
  landed in source but were never regenerated are simply not reported."
  [_]
  (let [spec-date (last-commit-date spec-path)
        src-date  (last-commit-date "src/metabase/**/api.clj" "src/metabase/**/routes.clj")]
    (println (str "spec last changed: " (or spec-date "never")))
    (println (str "API source last changed: " (or src-date "never")))
    (cond
      (not (and spec-date src-date))
      (u/exit "\nCould not determine both dates; verify by hand." 1)

      (neg? (compare spec-date src-date))
      (do
        (println "\nSTALE: the committed OpenAPI spec predates the newest API source change.")
        (println "A diff against this spec under-reports. Either regenerate it for the current")
        (println "working tree with `bun run generate-openapi`, or confirm suspected gaps directly")
        (println "in source with `grep -rn defendpoint src/metabase/<module>/api.clj`.")
        (println "\nCommits that touched API source since the spec was last updated:")
        (let [{:keys [out]} (shell/sh* {:quiet? true}
                                       "git" "log" "--format=  %h %ad %an | %s" "--date=short"
                                       (str "--since=" spec-date) "--" "src/metabase/**/api.clj")]
          (doseq [line (take 20 out)] (println line)))
        (u/exit 1))

      :else (println "\nOK: spec is current relative to API source."))))

(defn cli-diff
  "Entry point for `./bin/mage openapi-diff`.

  Takes either two spec files, or two git refs with `--refs`. With `--refs` each ref's spec is
  generated from its source in a throwaway worktree, which is slower than reading the committed
  blob but is not subject to its drift."
  [{:keys [arguments options]}]
  (let [[old-arg new-arg] arguments
        min-severity (case (some-> (:severity options) str/lower-case)
                       "breaking" breaking
                       "additive" additive
                       nil)
        [old-path new-path stale-refs]
        (if (:refs options)
          (let [dir (str "/tmp/openapi-diff-specs-" (System/currentTimeMillis))
                committed? (boolean (:committed options))]
            (.mkdirs (io/file dir))
            (let [[op ostale] (spec-for-ref! old-arg (str dir "/old.json") committed?)
                  [np nstale] (spec-for-ref! new-arg (str dir "/new.json") committed?)]
              [op np (cond-> [] ostale (conj old-arg) nstale (conj new-arg))]))
          [old-arg new-arg []])]
    (when (:refs options) (println))
    (let [d (diff (json/parse-string (slurp old-path))
                  (json/parse-string (slurp new-path)))]
      (if (:grouped options)
        (print-grouped d min-severity)
        (print-diff d min-severity)))
    (when (seq stale-refs)
      (println)
      (println (str "# WARNING: used the committed spec for " (str/join " and " stale-refs) "."))
      (println "# The committed spec only updates on PRs labelled `openapi-self-healing`, so it lags")
      (println "# source. This diff UNDER-REPORTS: changes never regenerated into the spec are absent,")
      (println "# and an empty result does not mean there were no changes."))))
