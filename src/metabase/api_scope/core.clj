(ns metabase.api-scope.core
  "Scope registry and matching for API authorization.

  Provides a `defscope` macro that registers named scopes with translatable
  descriptions, a `scope-matches?` function for hierarchical wildcard matching,
  and a public API for enumerating registered scopes (for consent screens, admin UIs)."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Scope registry
;;; ──────────────────────────────────────────────────────────────────

(defonce ^:private scope-registry
  (atom {}))

(defn register-scope!
  "Register a scope string with a description thunk. Called by [[defscope]]."
  [scope-string description-fn scope-var]
  (swap! scope-registry assoc scope-string
         {:description description-fn
          :var         scope-var}))

(defmacro defscope
  "Define and register a scope. Creates a var whose value is the scope string and
  registers it in the global scope registry with a translatable description.

    (defscope agent-sql-create \"agent:sql:create\"
      (deferred-tru \"Create SQL queries\"))"
  [var-sym scope-string description]
  `(do
     (def ~var-sym ~scope-string)
     (register-scope! ~scope-string (fn [] ~description) (var ~var-sym))))

(defn registered-scope?
  "Returns true if the given scope string has been registered via [[defscope]]."
  [scope-string]
  (contains? @scope-registry scope-string))

(defn all-scopes
  "Returns a vector of maps describing all registered scopes, suitable for consent
  screens. Each map has `:scope` (string) and `:description` (localized string)."
  []
  (mapv (fn [[scope-str {:keys [description]}]]
          {:scope scope-str :description (description)})
        @scope-registry))

(defn scope-description
  "Returns the localized description for a registered scope string, or nil."
  [scope-string]
  (when-let [entry (get @scope-registry scope-string)]
    ((:description entry))))

;;; ──────────────────────────────────────────────────────────────────
;;; Scope matching
;;; ──────────────────────────────────────────────────────────────────

(def unrestricted
  "A scope set that satisfies any required scope. Use only when explicitly
  granting full access (e.g. superuser context). This is distinct from
  category wildcards like `\"agent:*\"`, which only cover scopes under
  the `agent` prefix."
  #{"*"})

(defn scope-matches?
  "Check if `granted-scopes` (a set of strings) satisfies `required-scope`
  (a string). Supports hierarchical wildcards on the grant side:
  `\"agent:sql:*\"` covers `\"agent:sql:create\"`.

  Returns true when:
  - `granted-scopes` contains `required-scope` exactly, or
  - `granted-scopes` contains `\"*\"` (unrestricted), or
  - `granted-scopes` contains a wildcard prefix that covers `required-scope`."
  [granted-scopes required-scope]
  (boolean
   (or (contains? granted-scopes required-scope)
       (contains? granted-scopes "*")
       (some (fn [scope]
               (and (str/ends-with? scope ":*")
                    (str/starts-with? required-scope
                                      (subs scope 0 (dec (count scope))))))
             granted-scopes))))

(defn parse-scopes
  "Parse a space-delimited OAuth scope string into a set of scope strings.
   Returns nil if `scope-string` is nil, blank, or not a string."
  [scope-string]
  (when (string? scope-string)
    (when-not (str/blank? scope-string)
      (into #{} (str/split (str/trim scope-string) #"\s+")))))
