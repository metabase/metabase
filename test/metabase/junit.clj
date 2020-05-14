(ns metabase.junit
  "Formatter for JUnit test output for CI."
  (:require [clojure
             [pprint :as pp]
             [test :as t]]
            [pjstadig.print :as p]))

(defn- result-output [{:keys [type expected actual diffs message] :as event}]
  (with-out-str
    (println "\nFAIL in" (t/testing-vars-str event))
    (when (seq t/*testing-contexts*)
      (println (t/testing-contexts-str)))
    (when message (println message))
    (p/with-pretty-writer (fn []
                            (let [print-expected (fn [actual]
                                                   (p/rprint "expected: ")
                                                   (pp/pprint expected *out*)
                                                   (p/rprint "  actual: ")
                                                   (pp/pprint actual *out*)
                                                   (p/clear))]
                              (if (seq diffs)
                                (doseq [[actual [a b]] diffs]
                                  (print-expected actual)
                                  (p/rprint "    diff:")
                                  (if a
                                    (do (p/rprint " - ")
                                        (pp/pprint a *out*)
                                        (p/rprint "          + "))
                                    (p/rprint " + "))
                                  (when b
                                    (pp/pprint b *out*))
                                  (p/clear))
                                (print-expected actual)))))))

(defmulti format-result
  {:arglists '([event])}
  :type)

(defmethod format-result :default
  [event]
  ((requiring-resolve 'test-report-junit-xml.core/format-result) event))

(defmethod format-result :fail
  [event]
  {:tag     :failure
   :attrs   {:message (t/testing-vars-str event)}
   :content (result-output event)})
