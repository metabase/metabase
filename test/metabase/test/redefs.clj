(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [mb.hawk.parallel]
   [metabase.classloader.core :as classloader]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.tools.with-temp]))

(def ^:dynamic ^:private *in-with-temp*
  "Used to detect whether we're in a nested [[with-temp]]. Default is false."
  false)

(defonce ^:private prewarm-failures-logged
  ;; Failure messages already reported by the dataset prewarm below, so repeated failures are logged once.
  (atom #{}))

(methodical/defmethod toucan2.tools.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff.
  Make sure metabase.test.util is loaded.
  Run [[f]] in transaction by default, bind [[tu.thread-local/*thread-local*]] to false to disable this."
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; run `f` in a transaction if it's the top-level with-temp
  (if (and tu.thread-local/*thread-local* (not *in-with-temp*))
    (do
      ;; Materialize the test-data Database before opening the transaction. If created inside it, the Database
      ;; and its Tables are rolled back while memoized IDs in [[metabase.test.data.impl]] survive and refer to
      ;; missing rows. The dataset would also be rebuilt for every test because its creation could never commit.
      ;; Skip this for helpers whose app DB must remain empty. Otherwise this is best-effort: failure to build a
      ;; dataset must not fail an unrelated `with-temp`.
      (classloader/require 'metabase.test.data.impl)
      (when-not @(resolve 'metabase.test.data.impl/*skip-dataset-prewarm?*)
        (try
          ((resolve 'metabase.test.data.impl/db-id))
          (catch Throwable e
            ;; A failed prewarm resurfaces much later as a Database that does not exist. Log each message once, since a
            ;; warehouse that is down would otherwise produce a warning for every top-level `with-temp`.
            (let [message (ex-message e)]
              (when-not (contains? (first (swap-vals! prewarm-failures-logged conj message)) message)
                (log/warnf "Could not materialize the test dataset before with-temp: %s" message))))))
      ;; Materialize the test users and their Personal Collections for the same reason as the dataset above.
      ;; `user->personal-collection` is a get-or-create, and the permissions path calls it on every API request. One
      ;; first created inside the transaction is rolled back, so every later request tries to create it again, and
      ;; the parallel ones time out waiting on each other's COLLECTION table lock.
      (when-not @(resolve 'metabase.test.data.impl/*skip-dataset-prewarm?*)
        (try
          ((resolve 'metabase.test.initialize/initialize-if-needed!) :test-users-personal-collections)
          (catch Throwable e
            (let [message (ex-message e)]
              (when-not (contains? (first (swap-vals! prewarm-failures-logged conj message)) message)
                (log/warnf "Could not materialize the test users' Personal Collections before with-temp: %s"
                           message))))))
      (binding [*in-with-temp* true]
        (t2.connection/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
          (next-method model attributes f))))
    (next-method model attributes f)))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
