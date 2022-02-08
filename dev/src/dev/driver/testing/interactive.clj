(ns dev.driver.testing.interactive
  "Tools for interactively testing drivers (especially third party)"
  (:require [clojure.string :as str]
            [metabase.db :as mdb]
            [metabase.driver :as driver]
            [metabase.models :refer [Database]]
            [metabase.test :as mt]
            [metabase.test-runner :as test-runner]
            [metabase.test.util :as tu]
            [metabuild-common.input :as input]))

(def ^:private ^:const nil-entry
  "Line that the user can enter to designate a nil value (needed because [[read-line]] apparently doesn't return
  a blank line when run under nREPL).
  Remove if possible"
  "NIL")

(defn- skip-property?
  "Controls whether the given `conn-prop` should be skipped during interactive connection property input, either because
  it's not something the user would enter (ex: `:info` type), or because it's hidden (due to the `:visible-if` value for
  a previously entered property value).

  `acc` is the accumulated result so far, and `_driver` is the driver (in case there is any driver-specific logic needed
  for this in the future)."
  [acc _driver {spec-type :type
                visible-if :visible-if
                :as conn-prop}]
  (or (contains? #{:info} spec-type) ; don't prompt for certain types (ex: info)
    ; dependent property doesn't match
    (and (map? visible-if) (not= (select-keys acc (keys visible-if)) visible-if))))

(defn prompt-for-driver-connection-properties
  "For the given `driver`, interactively prompt the user for values for each of its `connection-properties`, and return
  the result in a map."
  [driver]
  (reduce
    (fn [acc {prop-nm :name
              display-nm :display-name
              placeholder :placeholder
              default-val :default
              required? :required
              spec-type :type
              :as conn-prop}]
      (if (skip-property? acc driver conn-prop)
        acc
        (let [prop-type (or spec-type :string)
              parser-fn (fn [v]
                          (case prop-type
                            :boolean (Boolean/parseBoolean v)
                            v))
              prop-val  (input/read-line-with-prompt (format "Enter value for %s (`%s`), a %s%s, or type %s for nil:"
                                                       display-nm
                                                       prop-nm
                                                       prop-type
                                                       (if-let [suggestion (or default-val placeholder)]
                                                         (str " (ex: " suggestion ")")
                                                         "")
                                                       nil-entry)
                          :default    nil
                          :allow-nil? (cond (boolean? required?)
                                            (not required?)

                                            (string? required?)
                                            (or (str/blank? required?) (not (Boolean/parseBoolean required?))))
                          :validator  (fn [v]
                                        (try
                                          (parser-fn v)
                                          nil
                                          (catch Exception e
                                            (.getMessage e)))))]
          (if (and (not (str/blank? (str/trim prop-val))) (not= nil-entry prop-val))
            (assoc acc prop-nm (parser-fn prop-val))
            (assoc acc prop-nm nil)))))
    {}
    (driver/connection-properties driver)))

(defn interactively-test-driver
  "For the given `driver`, prompt for input values for each of its connection details.  Once all are provided, store
  the map of key/value pairs to the user namespace (in `details`), and also define two new functions, `test-connect!`
  and `run-tests!`, to test a connection using the entered details, and to run tests (including core Metabase tests)
  using those details, respectively."
  [driver]
  (mdb/setup-db!)
  (let [details  (prompt-for-driver-connection-properties driver)
        temp-env (reduce-kv (fn [acc k v]
                              (assoc acc (keyword (str "mb-" (name driver) "-test-" k)) v))
                   {}
                   details)]
    (println "Storing to store db-details to `user/details`.")
    (intern 'user 'details details)
    (intern 'user 'test-connect! (fn []
                                   (let [conn-res (driver/can-connect? driver details)]
                                     (if (true? conn-res)
                                       (println "Successfully connected")
                                       (do
                                         (println "Failed to connect!")
                                         (when (instance? Exception conn-res)
                                           (.printStackTrace ^Exception conn-res)))))))
    (println "Run `(user/test-connect!) to test a connection using these details`.")
    (intern 'user 'run-tests! (fn [& tests]
                                (loop [[[k v] & more] temp-env
                                       thunk*         #(do
                                                         (mt/set-test-drivers! #{driver})
                                                         (mt/test-driver driver
                                                           (mt/dataset test-data
                                                             (test-runner/run-tests (cond-> {:prevent-exit? true
                                                                                             :multithread? true}
                                                                                      (some? tests)
                                                                                      (assoc :only tests))))))]
                                  (if (empty? more)
                                    (thunk*)
                                    (recur more #(tu/do-with-temp-env-var-value k v thunk*))))))
    (println (str "Use `(user/run-tests!)` to execute tests against the connection details you entered."
               "  Pass an optional argument to only run certain tests.  Ex:\n"
               "  `(run-tests! 'metabase.query-processor-test.string-extracts-test)`"))))
