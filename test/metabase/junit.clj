(ns metabase.junit
  "Formatter for JUnit test output for CI."
  (:require [clojure
             [pprint :as pp]
             [string :as str]]
            [pjstadig.print :as p]))

(defn- event-description [{:keys [file line context message]}]
  (str
   (format "%s:%d" file line)
   (when (seq context)
     (str "\n" (str/join " " (reverse context))))
   (when message
     (str "\n" message))))

(defn- result-output [{:keys [expected actual diffs message], :as event}]
  (with-out-str
    (newline)
    (println (event-description event))
    (p/with-pretty-writer
      (fn []
        (let [print-expected (fn [actual]
                               (p/rprint "expected: ")
                               (pp/pprint expected)
                               (p/rprint "  actual: ")
                               (pp/pprint actual)
                               (p/clear))]
          (if (seq diffs)
            (doseq [[actual [a b]] diffs]
              (print-expected actual)
              (p/rprint "    diff:")
              (if a
                (do (p/rprint " - ")
                    (pp/pprint a)
                    (p/rprint "          + "))
                (p/rprint " + "))
              (when b
                (pp/pprint b))
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
   :attrs   {:message (event-description event)}
   :content (result-output event)})
