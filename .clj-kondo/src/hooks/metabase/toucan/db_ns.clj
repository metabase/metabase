(ns hooks.metabase.toucan.db-ns
  "Lint that application database query calls -- Toucan 2's `t2/select`, `t2/query`, `t2/insert!`, `t2/update!`,
  `t2/delete!` and friends, plus the `metabase.app-db.core` wrappers around them such as `mdb/query` and
  `mdb/update-or-insert!` -- live in a module's `db` namespace, i.e. `metabase[-enterprise].<module>.db` (or `metabase.driver.<driver>.db` for
  driver modules). Every other namespace in a module goes through those functions instead of talking to the
  application database directly.

  Registered as an `:analyze-call` hook on each of those functions in `.clj-kondo/config.edn`. The hook
  returns its input unchanged so Kondo's normal analysis of the call (arity, var usage) still runs."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common.modules :as modules]))

(def ^:private driver-db-namespace
  "Matches `metabase.driver.<driver>.db`; individual drivers are not modules."
  #"^metabase\.driver\.[^.]+\.db$")

(defn- db-namespace? [config ns-sym]
  (let [ns-str (name ns-sym)]
    (boolean
     ;; Resolve ownership first: a nested `.db` name alone does not make a module.
     (or (when-let [module (modules/module config ns-sym)]
           (= ns-str (str (modules/module-ns-prefix (:metabase/modules config) module) ".db")))
         (re-matches driver-db-namespace ns-str)))))

(defn- test-file?
  "Whether `filename` is in a test source tree. Test namespaces are exempt through the `test-namespaces` group in
  `config.edn`, but helper namespaces like `metabase.sso.test-helpers` don't match that group's pattern."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn lint-query-call
  "Register a `:metabase/t2-query-namespace` finding when a Toucan 2 query call appears outside a `<module>.db`
  namespace."
  [{:keys [node ns filename] :as input}]
  (when (and ns
             (not (db-namespace? (modules/config input) ns))
             (not (test-file? filename)))
    (let [fn-node (first (:children node))]
      (hooks/reg-finding!
       (assoc (meta fn-node)
              :message (format "Application database query calls like `%s` must live in metabase[-enterprise].<module>.db (or metabase.driver.<driver>.db) namespaces"
                               (hooks/sexpr fn-node))
              :type :metabase/t2-query-namespace))))
  input)
