(ns metabase.junit
  "Formatter for JUnit test output for CI."
  (:require [clojure.pprint :as pp]
            [clojure.string :as str]
            [medley.core :as m]
            [metabase.util :as u]
            [pjstadig.print :as p]
            [test-report-junit-xml.core :as junit-xml]
            [test_report_junit_xml.shaded.clojure.data.xml :as xml]))

(defn- escape-unprintable-characters
  [s]
  (str/join (for [c s]
              (if (and (Character/isISOControl c)
                       (not (Character/isWhitespace c)))
                (format "&#%d;" (int c))
                c))))

(defn- decolorize-and-escape
  "Remove ANSI color escape sequences, then encode things as character entities as needed"
  [s]
  (-> s u/decolorize escape-unprintable-characters))

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
    (decolorize-and-escape s)))

(defmulti format-result
  {:arglists '([event])}
  :type)

(defmethod format-result :default
  [event]
  (-> (#'junit-xml/format-result event)
      (m/update-existing-in [:attrs :message] decolorize-and-escape)
      (m/update-existing :content (comp xml/cdata decolorize-and-escape))))

(defmethod format-result :fail
  [event]
  {:tag     :failure
   :content (xml/cdata (result-output event))})
