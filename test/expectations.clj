(ns ^:deprecated expectations
  (:require [clojure
             [data :as data]
             [test :as t]]
            [environ.core :as env]
            [metabase
             [config :as config]
             [util :as u]]
            [methodical.core :as m]))

(alter-meta! *ns* assoc :deprecated true)

;; Basically a Chain of Responibility pattern: we try each impl in turn until one of them accepts the args and returns
;; a report
(m/defmulti ^:private compare-expr*
  {:arglists '([expected actual form])}
  :none
  :combo      (m/or-method-combination)
  :dispatcher (m/everything-dispatcher))

(defrecord ExceptionResult [e])

;; When `actual` throws an Exception. Result is wrapped in ExceptionResult
(m/defmethod compare-expr* :exception-thrown
  [expected actual _]
  (when (instance? ExceptionResult actual)
    (let [{:keys [e]} actual]
      (cond
        (not (isa? expected Throwable))
        (throw e)

        (not (instance? expected e))
        {:type     :fail
         :expected (format "Threw %s" expected)
         :actual   (format "Threw %s" (class e))}

        :else
        {:type   :pass
         :actual (class e)}))))

;; If an Exception was expected, but none was thrown
(m/defmethod compare-expr* :expected-exception-none-thrown
  [expected actual _]
  (when (and (isa? expected Throwable)
             (not (instance? ExceptionResult actual)))
    (if (instance? expected actual)
      {:type :pass}
      {:type     :fail
       :expected (format "Threw %s" expected)})))

(m/defmethod compare-expr* :truthy
  [expected actual _]
  (when (= expected ::truthy)
    (if actual
      {:type :pass}
      {:type :fail, :expected "A truthy value"})))

(m/defmethod compare-expr* :fn
  [expected actual [_ e a]]
  (when (fn? expected)
    (if (expected actual)
      {:type :pass}
      {:type :fail, :expected (list e a)})))

(m/defmethod compare-expr* :regex
  [expected actual _]
  (when (instance? java.util.regex.Pattern expected)
    {:type (if (re-find expected actual)
             :pass
             :fail)}))

(m/defmethod compare-expr* :maps
  [expected actual _]
  (when (and (map? expected)
             (map? actual)
             (not (instance? ExceptionResult actual)))
    (let [[only-in-e only-in-a] (data/diff expected actual)]
      (if (and (nil? only-in-e) (nil? only-in-a))
        {:type :pass}
        {:type   :fail
         :actual [actual]
         :diffs  [[actual [only-in-e only-in-a]]]}))))

(m/defmethod compare-expr* :expected-class
  [expected actual _]
  (when (and (class? expected)
             (not (instance? ExceptionResult actual)))
    (cond
      (instance? expected actual)
      {:type :pass}

      (= expected actual)
      {:type :pass}

      :else
      {:type     :fail
       :expected (format "Instance of %s" expected)
       :actual   actual})))

(defn- default-compare-expr [expected actual _]
  (if (= expected actual)
    {:type :pass}
    {:type  :fail
     :diffs [[actual (take 2 (data/diff expected actual))]]}))

(defn compare-expr [expected actual message form]
  (merge
   {:message  message
    :expected expected
    :actual   actual}
   (or (compare-expr* expected actual form)
       (default-compare-expr expected actual form))))

(defmethod t/assert-expr 'expect= [msg [_ e a :as form]]
  `(let [a# (try
              ~a
              (catch Throwable e#
                (->ExceptionResult e#)))]
     (t/do-report
      (compare-expr ~e a# ~msg '~form))))

;; each time we encounter a new expectations-style test, record a `namespace:line` symbol in `symbols` so we can
;; display some stats on the total number of old-style tests when running tests, and make sure no one adds any new
;; ones
(def symbols (atom #{}))

(t/deftest no-new-expectations-style-tests-test
  (let [total-expect-forms            (count @symbols)
        total-namespaces-using-expect (count (into #{} (map namespace @symbols)))
        [worst-ns worst-ns-symbols]   (when (seq @symbols)
                                        (apply max-key (comp count second) (seq (group-by namespace @symbols))))]
    (println (u/format-color 'red "Total old-style expectations tests: %d" total-expect-forms))
    (println (u/format-color 'red "Total namespaces still using old-style expectations tests: %d" total-namespaces-using-expect))
    (when worst-ns
      (println (u/format-color 'red "Who has the most? %s with %d old-style tests" worst-ns (count worst-ns-symbols))))
    ;; only check total test forms when driver-specific tests are off! Otherwise this number can change without us
    ;; expecting it.
    (when-not (env/env :drivers)
      (t/testing "Don't write any new tests using expect!"
        (t/is (<= total-expect-forms 1084))
        (t/is (<= total-namespaces-using-expect 97))))))

(defmacro ^:deprecated expect
  "Simple macro that simulates converts an Expectations-style `expect` form into a `clojure.test` `deftest` form."
  {:arglists '([actual] [actual expected] [test-name actual expected])}
  ([actual]
   `(expect ::truthy ~actual))

  ([expected actual]
   `(expect ~(symbol (format "expect-%d" (hash &form))) ~expected ~actual))

  ([test-name expected actual]
   `(do
      (t/deftest ~test-name
        (t/testing (format ~(str (name (ns-name *ns*)) ":%d") (:line (meta #'~test-name)))
          (t/is
           (~'expect= ~expected ~actual))))
      (when config/is-test?
        (swap! symbols conj (symbol ~(name (ns-name *ns*)) (str (:line (meta #'~test-name)))))))))
