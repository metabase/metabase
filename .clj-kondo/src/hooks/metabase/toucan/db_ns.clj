(ns hooks.metabase.toucan.db-ns
  "Lint that application database query calls -- Toucan 2's `t2/select`, `t2/query`, `t2/insert!`, `t2/update!`,
  `t2/delete!` and friends, plus the `metabase.app-db.core` wrappers around them such as `mdb/query` and
  `mdb/update-or-insert!` -- live in a module's own `db` namespace. Every other namespace in a module goes
  through those functions instead of talking to the application database directly.

  A module owns exactly one such namespace: its effective `:ns-prefix` plus `.db`. That is `metabase.queries.db`
  for a top-level module and `metabase.metabot.llm.db` for a nested one, so a submodule keeps its own queries
  rather than pushing them up into its parent. Resolving through the module config rather than matching the
  shape of the name is what separates a submodule's `db` from `metabase.queries.models.db`, which names no
  module and stays a finding.

  Driver modules are the exception: individual drivers are not declared modules, so `metabase.driver.<driver>.db`
  is allowed by name.

  Registered as an `:analyze-call` hook on each of those functions in `.clj-kondo/config.edn`. The hook
  returns its input unchanged so Kondo's normal analysis of the call (arity, var usage) still runs."
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
     (or (when-let [module (modules/module config ns-symb)]
           (= ns-str (str (modules/module-ns-prefix config module) ".db")))
         (re-matches driver-db-namespace ns-str)))))

(defn- test-file?
  "Whether `filename` is in a test source tree. Test namespaces are exempt through the `test-namespaces` group in
  `config.edn`, but helper namespaces like `metabase.sso.test-helpers` don't match that group's pattern."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn lint-query-call
  "Register a `:metabase/t2-query-namespace` finding when a Toucan 2 query call appears outside its module's
  `db` namespace."
  [{:keys [node ns filename] :as input}]
  (when (and ns
             (not (db-namespace? (modules/config input) ns))
             (not (test-file? filename)))
    (let [fn-node (first (:children node))]
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format "Application database query calls like `%s` must live in their module's db namespace (`<module>.db`, at whatever depth the module sits, or `metabase.driver.<driver>.db`)"
                               (hooks/sexpr fn-node))
              :type :metabase/t2-query-namespace))))
  input)
