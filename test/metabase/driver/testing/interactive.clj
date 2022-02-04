(ns metabase.driver.testing.interactive
  "Tools for interactively testing drivers (especially third party)"
  (:require [clojure.string :as str]
            [clojure.test :as test]
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

(defn- skip-property? [acc driver {prop-nm :name
                                   display-nm :display-name
                                   placeholder :placeholder
                                   default-val :default
                                   required? :required
                                   spec-type :type
                                   visible-if :visible-if
                                   :as conn-prop}]
  (or (contains? #{:info} spec-type) ; don't prompt for certain types (ex: info)
      ; dependent property doesn't match
      (and (map? visible-if) (not= (select-keys acc (keys visible-if)) visible-if))))

(defn prompt-for-driver-connection-properties [driver]
  (reduce
    (fn [acc {prop-nm :name
              display-nm :display-name
              placeholder :placeholder
              default-val :default
              required? :required
              spec-type :type
              visible-if :visible-if
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

(defn interactively-test-driver [driver]
  (let [details  (prompt-for-driver-connection-properties driver)
        temp-env (reduce-kv (fn [acc k v]
                              (assoc acc (keyword (str "mb-" (name driver) "-test-" k)) v))
                   {}
                   details)]
    (prn-str details)
    (loop [[[k v] & more] temp-env
           thunk*         #(mt/with-temp Database [db {:name (str "Test " (name driver) " DB"), :engine driver, :details details}]
                             #_(def db-details details)
                             (printf "To store these to a variable `details`, run:%n(def details %s)%n"
                                     (pr-str details))
                             (mt/with-db db
                               (println "Trying to connect...")
                               (let [conn-res (driver/can-connect? driver (:details db))]
                                 (if (true? conn-res)
                                   (do (println "Successfully connected; trying to run tests")
                                       (mt/test-driver driver
                                         ;; TODO: figure out how to get all tests added here
                                         (test/run-all-tests)
                                         (test-runner/run-tests {:multithread? true})))
                                   (do
                                     (println "Failed to connect!")
                                     (when (instance? Exception conn-res)
                                       (.printStackTrace ^Exception conn-res)))))))]
      (if (empty? more)
        (thunk*)
        (recur more #(tu/do-with-temp-env-var-value k v thunk*))))))
