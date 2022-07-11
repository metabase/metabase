(ns metabase.shared.util.parameters
  "Util functions for dealing with parameters"
  #?@
      (:clj
       [(:require [clojure.string :as str]
                  [metabase.mbql.normalize :as mbql.normalize]
                  [metabase.shared.util.i18n :refer [trs]])]
       :cljs
       [(:require ["moment" :as moment]
                  [clojure.string :as str]
                  [metabase.mbql.normalize :as mbql.normalize]
                  [metabase.shared.util.i18n :refer [trs]])]))

(defn- formatted-list
  [values]
  (str (str/join ", " (butlast values)) " " (trs "and") " " (last values)))

(defmulti formatted-value
  "Formats a value appropriately for inclusion in a text card, based on its type. Does not do any escaping.
  For datetime parameters, the logic here should mirror the logic (as best as possible) in
  frontend/src/metabase/parameters/utils/date-formatting.ts"
  (fn [tyype _value] (keyword tyype)))

(defmethod formatted-value :date/single
  [_ value]
  #?(:cljs (.format (moment value) "MMMM D, YYYY")
     :clj value))

(defmethod formatted-value :date/month-year
  [_ value]
  #?(:cljs (let [m (moment value "YYYY-MM")]
             (if (.isValid m) (.format m "MMMM, YYYY") ""))
     :clj value))

(defmethod formatted-value :date/quarter-year
  [_ value]
  #?(:cljs (let [m (moment value "[Q]Q-YYYY")]
             (if (.isValid m) (.format m "[Q]Q, YYYY") ""))
     :clj value))

(defmethod formatted-value :date/range
  [_ value]
  (let [[start end] (str/split value "~")]
    (if (and start end)
      (str (formatted-value :date/single start)
           " - "
           (formatted-value :date/single end))
      "")))

(defmethod formatted-value :date/relative
  [_ value]
  (case value
    "today"      (trs "Today")
    "yesterday"  (trs "Yesterday")
    "past7days"  (trs "Past 7 Days")
    "past30days" (trs "Past 30 Days")
    "lastweek"   (trs "Last Week")
    "lastmonth"  (trs "Last Month")
    "lastyear"   (trs "Last Year")
    "thisday"    (trs "Today")
    "thisweek"   (trs "This Week")
    "thismonth"  (trs "This Month")
    "thisyear"   (trs "This Year")
    ;; Always fallback to default formatting, just in case
    (formatted-value :default value)))

(defmethod formatted-value :date/all-options
  [_ value]
  ;; Test value against a series of regexes (similar to those in metabase/parameters/utils/mbql.js) to determine
  ;; the appropriate formatting, since it is not encoded in the parameter type.
  ;; TODO: this is a partial implementation that only handles simple dates
  (condp (fn [re value] (->> (re-find re value) second)) value
    #"^~?([0-9-T:]+)~?$"       :>> (partial formatted-value :date/single)
    #"^([0-9-T:]+~[0-9-T:]+)$" :>> (partial formatted-value :date/range)
    (str value)))

(defmethod formatted-value :default
  [_ value]
  (cond
    (and (sequential? value) (> (count value) 1))
    (formatted-list value)

    (sequential? value)
    (str (first value))

    :else
    (str value)))

(def ^:private escaped-chars-regex
  #"[\\/*_`'\[\](){}<>#+-.!$@%^&=|\?~]")

(defn- escape-chars
  [text]
  (str/replace text escaped-chars-regex #(str \\ %)))

(defn- replacement
  [tag->param match]
  (let [tag-name (second match)
        param    (get tag->param tag-name)
        value    (:value param)
        tyype    (:type param)]
    (if value
      (-> (formatted-value tyype value)
          escape-chars)
      ;; If this parameter has no value, return the original {{tag}} so that no substitution is done.
      (first match))))

(defn- normalize-parameter
  "Normalize a single parameter by calling [[mbql.normalize/normalize-fragment]] on it, and converting all string keys
  to keywords."
  [parameter]
  (->> (mbql.normalize/normalize-fragment [:parameters] [parameter])
       first
       (reduce-kv (fn [acc k v] (assoc acc (keyword k) v)) {})))

(def ^:private template-tag-regex
  "A regex to find template tags in a text card on a dashboard. This should mirror the regex used to find template
  tags in native queries, with the exception of snippets and card ID references (see the metabase-lib function
  `recognizeTemplateTags` for that regex)."
  #"\{\{\s*([A-Za-z0-9_\.]+?)\s*\}\}")

(defn ^:export substitute_tags
  "Given the context of a text dashboard card, replace all template tags in the text with their corresponding values,
  formatted and escaped appropriately."
  [text tag->param]
  (let [tag->param #?(:clj tag->param
                      :cljs (js->clj tag->param))
        tag->normalized-param (reduce-kv (fn [acc tag param]
                                           (assoc acc tag (normalize-parameter param)))
                                         {}
                                         tag->param)]
     (str/replace text template-tag-regex (partial replacement tag->normalized-param))))

(defn ^:export tag-names
  "Impl function for tag_names"
  [text]
  (->> (re-seq template-tag-regex (or text ""))
       (map second)
       set))

(defn ^:export tag_names
  "Given the content of a text dashboard card, return a set of the unique names of template tags in the text."
  [text]
  (let [tag-names (->> (re-seq template-tag-regex (or text ""))
                       (map second)
                       set)]
    #?(:clj  tag-names
       :cljs (clj->js tag-names))))
