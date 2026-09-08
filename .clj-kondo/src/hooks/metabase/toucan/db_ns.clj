(ns hooks.metabase.toucan.db-ns
  "Lints application database calls -- Toucan 2's `t2/select`, `t2/query`, `t2/insert!` and friends, plus
  the `metabase.app-db.core` wrappers such as `mdb/query` -- outside their module's `db` namespace.

  A module's `db` namespace is its effective `:ns-prefix` plus `.db`: `metabase.queries.db` for a top-level
  module, `metabase.metabot.llm.db` for a nested one. Driver namespaces and test files are exempt.

  Registered as an `:analyze-call` hook on each of those functions in `.clj-kondo/config.edn`."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common.modules :as modules]))

(def ^:private driver-db-namespace
  "`metabase.driver.<driver>.db`. Drivers live under the one `driver` module, so no `:ns-prefix` names them."
  #"^metabase\.driver\.[^.]+\.db$")

(defn- db-namespace?
  "Whether `ns-symb` is the `db` namespace of the module that owns it."
  [config ns-symb]
  (let [ns-str (name ns-symb)]
    (boolean
     ;; Resolved through the module config rather than matched by name: `metabase.queries.models.db` is
     ;; shaped like a module db namespace but names no module, and has to stay a finding.
     (or (when-let [module (modules/module config ns-symb)]
           (= ns-str (str (modules/module-ns-prefix config module) ".db")))
         (re-matches driver-db-namespace ns-str)))))

(defn- test-file?
  "Whether `filename` is in a test source tree. Test namespaces are exempt through the `test-namespaces` group in
  `config.edn`, but helper namespaces like `metabase.sso.test-helpers` don't match that group's pattern."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn lint-query-call
  "Registers a `:metabase/t2-query-namespace` finding when the call in `input` sits outside its module's `db`
  namespace. Returns `input` unchanged, so Kondo's own analysis of the call still runs."
  [{:keys [node ns filename] :as input}]
  (when (and ns
             (not (db-namespace? (modules/config input) ns))
             (not (test-file? filename)))
    (let [fn-node (first (:children node))]
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format "Application database calls like `%s` belong in their module's `db` namespace"
                               (hooks/sexpr fn-node))
              :type :metabase/t2-query-namespace))))
  input)
