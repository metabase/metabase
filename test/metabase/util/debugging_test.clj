(ns metabase.util.debugging-test
  (:require  [clojure.test :refer :all]
             [metabase.config :as config]))

(def dbg-prn-used? (atom false))

(defn dbg-prn*
  "Implementation for the `dbg-prn` macro."
  [p x]
  (p x)
  x)

(defmacro dbg-prn
  "`prn`s the argument and also returns it, which is useful for debugging. There is also a CI check to ensure no usages
  of it sneak into master. With two arguments, uses the first as a printing function instead of `prn`."
  ([x]
   `(dbg-prn prn ~x))
  ([p x]
   `(do
      (when-not (= (ns-name *ns*) 'metabase.util.debugging-test)
        (reset! metabase.util.debugging-test/dbg-prn-used? true))
      (dbg-prn* ~p ~x))))

(deftest test-dbg-prn-is-not-used
  (testing "`dbg-prn` should not be committed to master"
    (is (not @dbg-prn-used?))))

(deftest test-dbg-prn
  (testing "It prns and returns a value"
    (let [stdout (with-out-str
                   (let [result (dbg-prn
                                 {:family "Ramphastidae" :genus "Ramphastos"})]
                     (is (= result {:family "Ramphastidae" :genus "Ramphastos"}))))]
      (is (= "{:family \"Ramphastidae\", :genus \"Ramphastos\"}\n"
             stdout))))
  (testing "It accepts a custom printing function"
    (let [terrible-print (fn [_] (print "ohai"))
          stdout (with-out-str
                   (let [result (dbg-prn
                                 terrible-print
                                 {:family "Ramphastidae" :genus "Ramphastos"})]
                     (is (= result {:family "Ramphastidae" :genus "Ramphastos"}))))]
      (is (= "ohai" stdout)))))
