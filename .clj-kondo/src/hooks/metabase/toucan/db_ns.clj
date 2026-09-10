(ns hooks.metabase.toucan.db-ns
  "Ensures application database calls stay in their module's `db` namespace.

  This covers Toucan 2 functions and the wrappers in `metabase.app-db.core`.
  A module's database namespace is its effective `:ns-prefix` plus `.db`, such
  as `metabase.metabot.llm.db`. Driver namespaces and test files are exempt.

  `.clj-kondo/config.edn` registers this hook for each database function."
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.common.modules :as modules]))

(def ^:private driver-db-namespace
  "Matches `metabase.driver.<driver>.db`; individual drivers are not modules."
  #"^metabase\.driver\.[^.]+\.db$")

(defn- db-namespace?
  "Whether `ns-symb` is its module's database namespace."
  [config ns-symb]
  (let [ns-str (name ns-symb)]
    (boolean
     ;; Resolve ownership first: a nested `.db` name alone does not make a module.
     (or (when-let [module (modules/module config ns-symb)]
           (= ns-str (str (modules/module-ns-prefix (:metabase/modules config) module) ".db")))
         (re-matches driver-db-namespace ns-str)))))

(defn- test-file?
  "Whether `filename` is in a test tree.

  The filename check also covers helpers whose namespace does not match the
  configured test-namespace pattern."
  [filename]
  (boolean (and filename (re-find #"(?:^|/)test/" filename))))

(defn lint-query-call
  "Report database calls outside their module's `db` namespace.

  Returns `input` unchanged so Kondo can continue its normal analysis."
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
