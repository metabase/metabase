(ns metabase.junit
  "Formatter for JUnit test output for CI."
  (:require [clojure
             [pprint :as pp]
             [string :as str]]
            [metabase.util :as u]
            [pjstadig.print :as p]
            [test-report-junit-xml.core :as junit-xml])
  (:import org.apache.commons.lang3.StringEscapeUtils))

(defn- event-description [{:keys [file line context message]}]
  (str
   (format "%s:%d" file line)
   (when (seq context)
     (str "\n" (str/join " " (reverse context))))
   (when message
     (str "\n" message))))

(defn- print-expected [expected actual]
  (p/rprint "expected: ")
  (pp/pprint expected)
  (p/rprint "  actual: ")
  (pp/pprint actual)
  (p/clear))

(defn- result-output [{:keys [expected actual diffs message], :as event}]
  (let [s (with-out-str
            (println (event-description event))
            ;; this code is adapted from `pjstadig.util`
            (p/with-pretty-writer
              (fn []
                (if (seq diffs)
                  (doseq [[actual [a b]] diffs]
                    (print-expected expected actual)
                    (p/rprint "    diff:")
                    (if a
                      (do (p/rprint " - ")
                          (pp/pprint a)
                          (p/rprint "          + "))
                      (p/rprint " + "))
                    (when b
                      (pp/pprint b))
                    (p/clear))
                  (print-expected expected actual)))))]
    ;; remove ANSI color escape sequences, then encode things as character entities as needed
    (-> s u/decolorize StringEscapeUtils/escapeXml11)))

(defmulti format-result
  {:arglists '([event])}
  :type)

(defmethod format-result :default
  [event]
  (#'junit-xml/format-result event))

(defmethod format-result :fail
  [event]
  {:tag     :failure
   :content (result-output event)})
