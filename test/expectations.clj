(ns expectations
  (:require [clojure
             [data :as data]
             [test :as t]]
            [methodical.core :as m]))

(def compare-expr* nil) ; NOCOMMIT

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


(defmacro ^:deprecated expect
  "Simple macro that simulates converts an Expectations-style `expect` form into a `clojure.test` `deftest` form."
  {:arglists '([actual] [actual expected])}
  ([actual]
   `(expect ::truthy ~actual))

  ([expected actual]
   `(t/deftest ~(symbol (format "expect-%d" (hash &form)))
      (t/is
       (~'expect= ~expected ~actual)))))
