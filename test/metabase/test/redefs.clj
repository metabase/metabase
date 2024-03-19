(ns metabase.test.redefs
  "Redefinitions of vars from 3rd-party namespaces to make sure they do extra stuff we want (like initialize things if
  needed when running)."
  (:require
   [clojure.pprint :as pprint]
   [clojure.test :as t]
   [mb.hawk.parallel]
   [metabase.plugins.classloader :as classloader]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]
   [toucan2.util :as t2.u]))

(def ^:dynamic ^:private *in-tx*
  "Used to detect whether we're in a nested [[with-temp]]. Default is false."
  false)

(def ^:dynamic ^:private *with-temp-clean-up*
  "Whether with-temp should clean up afterward, default is true."
  true)

(methodical/defmethod t2.with-temp/do-with-temp* :default
  [model explicit-attributes f]
  (assert (some? model) (format "%s model cannot be nil." `with-temp))
  (when (some? explicit-attributes)
    (assert (map? explicit-attributes) (format "attributes passed to %s must be a map." `with-temp)))
  (let [defaults          (t2.with-temp/with-temp-defaults model)
        merged-attributes (merge {} defaults explicit-attributes)]
    (t2.u/try-with-error-context ["with temp" {::model               model
                                               ::explicit-attributes explicit-attributes
                                               ::default-attributes  defaults
                                               ::merged-attributes   merged-attributes}]
     (log/debugf "Create temporary %s with attributes %s" model merged-attributes)
     (let [temp-object (t2/insert-returning-instance! model merged-attributes)]
       (log/debugf "[with-temp] => %s" temp-object)
       (try
        (t/testing (format "\nwith temporary %s with attributes\n%s\n"
                           (pr-str model)
                           #_{:clj-kondo/ignore [:discouraged-var]}
                           (with-out-str (pprint/pprint merged-attributes)))
          (f temp-object))
        (finally
         (when *with-temp-clean-up*
           (t2/delete! model :toucan/pk ((t2/select-pks-fn model) temp-object)))))))))

(methodical/defmethod t2.with-temp/do-with-temp* :around :default
  "Initialize the DB before doing the other with-temp stuff.
  Make sure metabase.test.util is loaded.
  Run [[f]] in transaction by default, bind [[tu.thread-local/*thread-local*]] to false to disable this."
  [model attributes f]
  (classloader/require 'metabase.test.initialize)
  ((resolve 'metabase.test.initialize/initialize-if-needed!) :db)
  ;; so with-temp-defaults are loaded
  (classloader/require 'metabase.test.util)
  ;; run `f` in a transaction if it's the top-level with-temp
  (if (and tu.thread-local/*thread-local* (not *in-tx*))
    (binding [*in-tx* true]
      (t2.connection/with-transaction [_ t2.connection/*current-connectable* {:rollback-only true}]
        (next-method model attributes f)))
    (next-method model attributes f)))

(defmacro with-temp!-persisted
  "Like [[mt/with-temp]], but all the created items are persisted after."
  [& args]
  `(binding [*with-temp-clean-up*           false
             tu.thread-local/*thread-local* false]
     (t2.with-temp/with-temp ~@args)))

;;; wrap `with-redefs-fn` (used by `with-redefs`) so it calls `assert-test-is-not-parallel`

(defonce orig-with-redefs-fn with-redefs-fn)

(defn new-with-redefs-fn [& args]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-redefs")
  (apply orig-with-redefs-fn args))

(alter-var-root #'with-redefs-fn (constantly new-with-redefs-fn))
