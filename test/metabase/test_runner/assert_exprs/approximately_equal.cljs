(ns metabase.test-runner.assert-exprs.approximately-equal
  "JavaScript version of the hawk approximately-equal test assertion type. Experimental! Doesn't support everything!"
  (:require [metabase.util :as u])
  (:require-macros [metabase.test-runner.assert-exprs.approximately-equal-js]))

(defmulti =?-diff
  "Multimethod to use to diff two things with `=?`."
  {:arglists '([expected actual])}
  (fn [expected actual]
    [(u/dispatch-type-keyword expected) (u/dispatch-type-keyword actual)]))

;;;; Default method impls

(defmethod =?-diff :default
  [expected actual]
  (when-not (= expected actual)
    (list 'not= expected actual)))

(defmethod =?-diff [:dispatch-type/regex :dispatch-type/string]
  [expected-regex s]
  (when-not (re-matches expected-regex s)
    (list 'not (list 're-matches expected-regex s))))

;;; two regexes should be treated as equal if they're the same pattern.
(defmethod =?-diff [:dispatch-type/regex :dispatch-type/regex]
  [expected actual]
  (when-not (= (str expected) (str actual))
    (list 'not= (list 'str expected) (list 'str actual))))

(defmethod =?-diff [:dispatch-type/fn :dispatch-type/*]
  [pred actual]
  (when-not (pred actual)
    (list 'not (list pred actual))))

(defmethod =?-diff [:dispatch-type/sequential :dispatch-type/sequential]
  [expected actual]
  (let [same-size? (= (count expected)
                      (count actual))]
    ;; diff items at each index, e.g. (=?-diff (first expected) (first actual)) then (=?-diff (second expected) (second
    ;; actual)) and so forth. Keep diffing until BOTH sequences are empty.
    (loop [diffs    []
           expected expected
           actual   actual]
      (if (and (empty? expected)
               (empty? actual))
        ;; If there are no more items then return the vector the diffs, if there were any
        ;; non-nil diffs, OR if the sequences were of different sizes. The diff between [1 2 nil] and [1 2]
        ;; in [[clojure.data/diff]] is [nil nil nil]; that's what we'll return in this situation too.
        (when (or (some some? diffs)
                  (not same-size?))
          diffs)
        ;; when there is at least element left in either `expected` or `actual`, diff the first item in each. If one of
        ;; these is empty, it will diff against `nil`, but that's ok, because we will still fail because `same-size?`
        ;; above will be false
        (let [this-diff (=?-diff (first expected) (first actual))]
          (recur (conj diffs this-diff) (rest expected) (rest actual)))))))

(defmethod =?-diff [:dispatch-type/map :dispatch-type/map]
  [expected-map actual-map]
  (not-empty (into {} (for [[k expected] expected-map
                            :let         [actual (get actual-map k (symbol "nil #_\"key is not present.\""))
                                          diff   (=?-diff expected actual)]
                            :when        diff]
                        [k diff]))))

(defn =?-report
  "Implementation for `=?` -- don't use this directly."
  [message expected actual]
  (let [diff (=?-diff expected actual)]
    {:type     (if (not diff) :pass :fail)
     :message  message
     :expected expected
     :actual   actual
     :diffs    [[actual [diff nil]]]}))
