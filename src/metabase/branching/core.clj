(ns metabase.branching.core
  "Middleware that handles setting the current branch."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(def ^:dynamic *current-branch*
  "The current 'branch' for a request in Metabase. Some models support forking changes
  into related groups of changes -- called a 'branch' -- that transparently replace the
  original model when the branch is activated."
  (delay nil))

(def ^:dynamic *enable-branch-hook*
  "Controls whether the toucan pipeline hook is enabled, this exists so we can disable it
   while running code like custom migrations that we do not want it enabled for."
  true)

(defn do-with-current-branch-var
  "Impl for with-current-branch-var"
  [branch-name thunk]
  (binding [*current-branch* (when branch-name (delay (t2/select-one :model/Branch :name branch-name)))]
    (thunk)))

(defmacro with-current-branch-var
  [branch & body]
  `(do-with-current-branch-var ~branch (^:once fn* [] ~@body)))

(defenterprise get-current-branch
  "Extract the current branch from the X-Metabase-Branch header used to extract
   branched models from the common pk depending on the branch set.

  In OSS this does not set the branch."
  metabase-enterprise.branching.core
  [_request]
  nil)

(defn handle-current-branch
  "Ring middleware to set the current branch using the `get-current-branch` function."
  [handler]
  (fn [request respond raise]
    (if-let [current-branch (get-current-branch request)]
      (with-current-branch-var current-branch
        (handler (assoc request :current-branch current-branch) respond raise))
      (handler request respond raise))))
