(ns dev.security-lint.rules.secrets
  "Credentials that are stored, logged or configured in ways that expose them."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]))

(set! *warn-on-reflection* true)

(def ^:private sensitive-name? vocab/credential-name?)

(def ^:private stand-in-name
  "A leading word that says the value is deliberately not a real credential: the fixed hash bcrypt is run
  against when a user does not exist, so that login timing does not reveal which accounts exist."
  #"(?i)^:?(fake|dummy|mock|sample|example|placeholder)[-_]")

(defn- credential-literal?
  "A string literal that could be a real credential, as opposed to a stub or an identifier."
  [node]
  (boolean
   (when-let [s (ast/string-value node)]
     (and (>= (count s) 8)
          ;; An empty or obviously-placeholder value is a stub, not a leak; so is a mask like `**MetabasePass**`,
          ;; the string a password is *replaced with* on the way out.
          (not (re-find #"(?i)^(changeme|placeholder|example|xxx+|\*.*\*)$" s))
          ;; A plain kebab-case word list is an identifier -- a setting name or a config key -- not a credential.
          ;; Real secrets carry mixed case, digits or punctuation.
          (not (re-matches #"[a-z]+(-[a-z0-9]+)*" s))))))

(defrule hardcoded-secret
  {:name        "Credential written into source"
   :description (str "A var or a key that names a credential is bound to a string literal. Anything committed to "
                     "the repository is readable by everyone with clone access and lives forever in git history.")
   :remediation "Read the value from a setting or an environment variable instead."
   :severity    :error
   :precision   :medium
   :cwe         "CWE-798"
   :form-triggers #{def defonce}}
  [{:keys [node]}]
  (let [var-name (some-> (ast/arg node 0) ast/unmeta ast/->str)
        ;; `(def name "value")` or `(def name "docstring" "value")`: the value is the last argument either way
        var-hit  (when (and (sensitive-name? var-name)
                            (not (re-find stand-in-name var-name))
                            (credential-literal? (last (ast/args node))))
                   [var-name])
        key-hits (for [m     (ast/find-nodes ast/map-node? node)
                       [k v] (ast/map-entries m)
                       :when (and (ast/keyword-node? k)
                                  (sensitive-name? (ast/->str k))
                                  (not (re-find stand-in-name (ast/->str k)))
                                  (credential-literal? v))]
                   (ast/->str k))
        hits     (concat var-hit key-hits)]
    (when (seq hits)
      {:message (str "Literal credential bound to " (str/join ", " hits))})))

(def ^:private redacting-name
  "A call whose name says it masks its argument logs a redacted value, which is what the remediation asks for."
  #"(?i)^(mask|redact|obfuscat)|(masked|redacted)$")

(def ^:private about-not-of
  "Calls whose value says something *about* a credential and nothing of it: its id, whether it is set, how long
  it is, its keys. `(log/info \"API key\" (u/the-id existing-api-key) \"already exists\")` logs an id."
  '#{the-id id boolean some? nil? empty? seq? count keys name type class})

(defn- logged-names
  "Every symbol and keyword under `node`, as written, except inside a redacting call or one that tells about the
  value rather than logging it."
  [node]
  (cond
    (and (ast/call? node) (some->> (ast/head-sym node) name (re-find redacting-name)))
    []

    (and (ast/call? node) (contains? about-not-of (some-> (ast/head-sym node) name symbol)))
    []

    (or (ast/keyword-node? node) (ast/symbol-node? node))
    [(ast/->str node)]

    :else
    (mapcat logged-names (ast/children node))))

(defrule sensitive-data-in-logs
  {:name        "Credential passed to a logger"
   :description (str "A value whose name marks it as a credential is being logged. Log output is routinely shipped "
                     "to third-party aggregators and read by people who should not see secrets.")
   :remediation "Log an identifier instead of the credential, or redact the value before logging it."
   :severity    :error
   :precision   :medium
   :cwe         "CWE-532"
   ;; Every level, plain and format variants alike. A secret at debug level ships to the aggregator the day
   ;; someone turns debug logging on to chase an incident, which is exactly when the logs get read.
   :triggers    #{clojure.tools.logging/trace clojure.tools.logging/tracef
                  clojure.tools.logging/debug clojure.tools.logging/debugf
                  clojure.tools.logging/info clojure.tools.logging/infof
                  clojure.tools.logging/warn clojure.tools.logging/warnf
                  clojure.tools.logging/error clojure.tools.logging/errorf
                  clojure.tools.logging/fatal clojure.tools.logging/fatalf
                  metabase.util.log/trace metabase.util.log/tracef
                  metabase.util.log/debug metabase.util.log/debugf
                  metabase.util.log/info metabase.util.log/infof
                  metabase.util.log/warn metabase.util.log/warnf
                  metabase.util.log/error metabase.util.log/errorf
                  metabase.util.log/fatal metabase.util.log/fatalf}}
  [{:keys [node] :as ctx}]
  ;; Look at every symbol and keyword anywhere in the arguments, so (log/info "x" (:password m)) is caught
  ;; alongside (log/info "x" password).
  (let [hits (->> (ast/args node)
                  (mapcat logged-names)
                  (filter sensitive-name?)
                  distinct)
        ;; a whole row of a credential-bearing model, logged as it is or printed -- `(log/warn "syncing" db)`
        ;; carries the connection details whatever the variable is called
        rows (for [a     (ast/args node)
                   :let  [a (ast/unmeta a)
                          v (if (and (ast/call? a) (contains? #{"pr-str" "str" "prn-str"} (some-> (ast/head-sym a) name)))
                              (ast/arg a 0)
                              a)]
                   :when (and v (ast/symbol-node? v))
                   :let  [os (taint/origins ctx v)]
                   :when (vocab/credential-row? (ast/->str v) os)]
               (str (ast/->str v) " (a " (str/join "/" (sort (keep #(when (= "app-db" (namespace %)) (name %)) os))) " row)"))]
    (when (or (seq hits) (seq rows))
      {:message (str "Logging "
                     (str/join "; " (remove nil? [(when (seq hits) (str "a value named " (str/join ", " hits)))
                                                  (when (seq rows) (str/join ", " (distinct rows)))])))})))

(defrule unencrypted-sensitive-setting
  {:name        "Credential setting stored unencrypted"
   :description (str "A setting whose name marks it as a credential declares `:encryption :no`, so its value is "
                     "stored as plaintext in the application database and appears in database backups.")
   :remediation "Declare `:encryption :when-encryption-key-set` so the value is encrypted at rest."
   :severity    :error
   :precision   :high
   :cwe         "CWE-312"
   :triggers    #{metabase.settings.core/defsetting
                  metabase.settings.models.setting/defsetting}}
  [{:keys [node]}]
  (let [setting-name (some-> (ast/arg node 0) ast/->str)]
    (when (sensitive-name? setting-name)
      (let [opts       (ast/kwargs (ast/args node))
            encryption (some-> opts :encryption ast/->str)
            sensitive? (some-> opts :sensitive? ast/truthy-literal?)]
        (cond
          (= ":no" encryption)
          {:message (str "Setting " setting-name " is declared :encryption :no")}

          ;; defsetting defaults :sensitive? settings to :when-encryption-key-set, so an absent declaration is
          ;; only a finding when nothing else marks the setting as secret-bearing.
          (and (nil? encryption) (not sensitive?))
          {:message (str "Setting " setting-name " declares neither :encryption nor :sensitive?")})))))
