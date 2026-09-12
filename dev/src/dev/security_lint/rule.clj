(ns dev.security-lint.rule
  "Rule definition and registry.

  A rule is plain data plus a `detect` function. It declares which call sites it wants to see and decides whether a
  given one is a finding; it knows nothing about how those sites are found or how findings are reported. That
  separation is the point -- adding a rule means adding one file under `dev.security-lint.rules`, never touching the
  engine."
  (:refer-clojure :exclude [all]))

(set! *warn-on-reflection* true)

(defonce ^{:dynamic true
           :doc "id -> rule. An atom, so re-evaluating a rule namespace in the REPL replaces its rule in place.
  `defonce`, so reloading *this* namespace (`:reload-all` from anywhere above it) does not empty the registry
  under the already-loaded rule namespaces and leave `all` returning nothing."}
  *registry*
  (atom {}))

(def severities
  "How a finding is surfaced. Maps onto SARIF levels; `:error` is the only one that fails a build."
  #{:error :warning :note})

(def precisions
  "How much a finding should be trusted, in SARIF's vocabulary.

  We have no dataflow analysis, so the injection rules match on shape and are honest about it: `:high` means a match
  is almost certainly real, `:low` means treat it as a prompt to go look."
  #{:high :medium :low})

(def ^:private severity-rank {:note 0 :warning 1 :error 2})

(defn severity-for
  "The severity a finding should carry.

  `:severity` may be a single keyword, or a map `{:tainted ... :otherwise ...}` for rules that fire on both
  attacker-influenced and merely-unwise code. The distinction matters: bypassing the HTTP wrapper with a
  hard-coded internal URL is architectural debt, while doing it with a request-supplied URL is SSRF, and reporting
  both as errors buries the second under the first."
  [rule tainted?]
  (let [s (:severity rule)]
    (if (map? s)
      (if tainted? (:tainted s) (:otherwise s))
      s)))

(defn worst-severity
  "The more serious of a rule's severities. Used where a rule needs one severity rather than a finding's."
  [rule]
  (let [s (:severity rule)]
    (if (map? s)
      (max-key severity-rank (:tainted s) (:otherwise s))
      s)))

(def ^:private required-keys
  [:id :name :description :severity :precision :cwe :detect])

(def taint-policies
  "What a rule may pin with `:taint-policy`. See `dev.security-lint.engine/taint-positions`."
  #{:call-graph :any-local})

(defn- validate! [{:keys [id severity precision triggers interop-triggers constructor-triggers form-triggers
                          vector-triggers mark-triggers accessor-triggers taint-policy endpoint-rule detect] :as rule}]
  (doseq [k required-keys]
    (when (nil? (get rule k))
      (throw (ex-info (str "Security rule is missing required key " k) {:rule-id id :missing k}))))
  (let [declared (if (map? severity) (vals severity) [severity])]
    (when (or (and (map? severity) (not= #{:tainted :otherwise} (set (keys severity))))
              (not (every? severities declared)))
      (throw (ex-info (str "Unknown severity " (pr-str severity)
                           " -- expected one of " (pr-str severities)
                           " or a map {:tainted _ :otherwise _}")
                      {:rule-id id :severity severity}))))
  (when-not (contains? precisions precision)
    (throw (ex-info (str "Unknown precision " (pr-str precision) " -- expected one of " (pr-str precisions))
                    {:rule-id id :precision precision})))
  (when (and (not endpoint-rule)
             (empty? (concat triggers interop-triggers constructor-triggers form-triggers vector-triggers mark-triggers
                             accessor-triggers)))
    (throw (ex-info "Security rule must declare a trigger, or :endpoint-rule true to fire once per endpoint"
                    {:rule-id id})))
  (when (and taint-policy (not (contains? taint-policies taint-policy)))
    (throw (ex-info (str "Unknown :taint-policy " (pr-str taint-policy) " -- expected one of " (pr-str taint-policies))
                    {:rule-id id :taint-policy taint-policy})))
  (doseq [k (concat vector-triggers mark-triggers)]
    (when-not (keyword? k)
      (throw (ex-info (str "Vector and mark triggers are keywords, e.g. :raw or :allow-subquery; got " (pr-str k))
                      {:rule-id id :trigger k}))))
  (doseq [k accessor-triggers]
    (when-not (instance? java.util.regex.Pattern k)
      (throw (ex-info (str "Accessor triggers are regexes over the key name, e.g. #\"_id$\"; got " (pr-str k))
                      {:rule-id id :trigger k}))))
  (doseq [sym triggers]
    (when-not (qualified-symbol? sym)
      (throw (ex-info (str "Trigger " sym " must be a fully qualified symbol, e.g. clojure.java.shell/sh")
                      {:rule-id id :trigger sym}))))
  (when-not (ifn? detect)
    (throw (ex-info "Rule :detect must be a function" {:rule-id id})))
  rule)

(defn register!
  "Validate `rule` and add it to the registry, replacing any rule with the same `:id`."
  [rule]
  (validate! rule)
  (swap! *registry* assoc (:id rule) rule)
  rule)

(defn all
  "All registered rules, in a stable order."
  []
  (sort-by :id (vals @*registry*)))

(defn by-id
  "The registered rule with `id`, or nil."
  [id]
  (get @*registry* id))

(defn exempt?
  "True if `filename` is exempt from `rule`.

  Exemptions exist for the namespace that legitimately owns a dangerous operation -- the HTTP wrapper is allowed to
  call the raw HTTP client; everyone else has to go through the wrapper."
  [rule filename]
  (boolean (some #(re-find % filename) (:exempt-files rule))))

(defmacro defrule
  "Define and register a security rule.

      (defrule command-injection
        {:name \"Command injection\" :description \"...\" :severity :error :precision :high
         :cwe \"CWE-78\" :triggers #{clojure.java.shell/sh}}
        [{:keys [node]}]
        (when (some ast/dynamic-string? (ast/args node))
          {:message \"...\"}))

  The body receives a context map and returns nil for \"not a finding\", or a map with at least `:message`. The
  rule's `:id` is derived from `rule-name`, so it is stable across refactors as long as the name doesn't change --
  SARIF and GitHub code scanning key alert identity off it.

  A rule fires in one of two ways. With `:triggers` (or `:interop-triggers`, `:constructor-triggers`,
  `:form-triggers`) it fires per matching call site and the context carries `:node`, plus `:tainted?` when
  `:tainted-arg` names an argument. With `:endpoint-rule true` it fires once per `defendpoint` form instead, and the
  context carries `:endpoint-ns` and `:reaches` -- the set of functions the endpoint transitively calls -- so a rule
  can require or forbid something anywhere on any path, which no single call site can answer."
  [rule-name spec argvec & body]
  (let [id (keyword "metabase-security-lint" (name rule-name))]
    `(def ~rule-name
       ;; `:triggers` name vars that may not exist on this classpath (and must not be resolved), so they are quoted
       ;; out of the evaluated spec rather than left in it.
       (register! (assoc ~(dissoc spec :triggers :interop-triggers :constructor-triggers :form-triggers)
                         :id ~id
                         ;; where the rule lives, so a report can link an alert to its source
                         :ns (quote ~(ns-name *ns*))
                         :triggers (quote ~(:triggers spec))
                         :interop-triggers (quote ~(:interop-triggers spec))
                         :constructor-triggers (quote ~(:constructor-triggers spec))
                         :form-triggers (quote ~(:form-triggers spec))
                         :detect (fn ~argvec ~@body))))))
