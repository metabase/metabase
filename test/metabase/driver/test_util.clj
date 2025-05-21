(ns metabase.driver.test-util
  (:require
   [clojure.set :as set]
   [mb.hawk.init :as hawk.init]
   [mb.hawk.parallel]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.test.data :as data]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]
   [metabase.test.initialize :as initialize]))

(defn -notify-all-databases-updated! []
  (mb.hawk.parallel/assert-test-is-not-parallel `-notify-all-databases-updated!)
  ;; It makes sense to notify databases only if app db is initialized.
  (when (initialize/initialized? :db)
    (initialize/initialize-if-needed! :plugins)
    (#'driver/notify-all-databases-updated)))

(defmacro wrap-notify-all-databases-updated!
  [& body]
  `(do
     (-notify-all-databases-updated!)
     (try
       ~@body
       (finally
         (-notify-all-databases-updated!)))))

(defn driver-select
  "Select drivers to be tested.

   +features - a list of features that the drivers should support.
   -features - a list of features that drivers should not support.

   +conn-props - a list of connection-property names that drivers should have.
   -conn-props - a list of connection-property names that drivers should not have.

   +parent - only include drivers whose parent is this.
   -parent - do not include drivers whose parent is this."
  ([]
   (driver-select {}))
  ([{:keys [+features -features +conn-props -conn-props +parent -parent] :as args}]
   (hawk.init/assert-tests-are-not-initializing (pr-str (list* 'normal-drivers args)))
   (set
    (for [driver (tx.env/test-drivers)
          :let   [driver (tx/the-driver-with-test-extensions driver)
                  conn-prop-names (when (or (seq +conn-props) (seq -conn-props))
                                    (into #{} (map :name (driver/connection-properties driver))))]
          :when  (driver/with-driver driver
                   (let [db (data/db)]
                     (cond-> true
                       (seq +features)
                       (and (every? #(driver.u/supports? driver % db) +features))

                       (seq -features)
                       (and (not (some #(driver.u/supports? driver % db) -features)))

                       (seq +conn-props)
                       (and (set/superset? conn-prop-names (set +conn-props)))

                       (seq -conn-props)
                       (and (empty? (set/intersection conn-prop-names (set -conn-props))))

                       +parent
                       (and (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver +parent)))

                       -parent
                       (and (not (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver -parent)))))))]
      driver))))
