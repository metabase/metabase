(ns metabase.shared.parameters.parameters
  "Util functions for dealing with parameters"
  #?@
      (:clj
       [(:require [clojure.string :as str]
                  [metabase.mbql.normalize :as mbql.normalize]
                  [metabase.shared.util.i18n :refer [trs]]
                  [metabase.util.date-2 :as u.date]
                  [metabase.util.date-2.parse.builder :as b]
                  [metabase.util.i18n.impl :as i18n.impl])
        (:import java.time.format.DateTimeFormatter)]
       :cljs
       [(:require ["moment" :as moment]
                  [clojure.string :as str]
                  [metabase.mbql.normalize :as mbql.normalize]
                  [metabase.shared.util.i18n :refer [trs]])]))

;; Without this comment, the namespace-checker linter incorrectly detects moment as unused
#?(:cljs (comment moment/keep-me))

(defmulti formatted-value
  "Formats a value appropriately for inclusion in a text card, based on its type. Does not do any escaping.
  For datetime parameters, the logic here should mirror the logic (as best as possible) in
  frontend/src/metabase/parameters/utils/date-formatting.ts"
  (fn [tyype _value _locale] (keyword tyype)))

(defmethod formatted-value :date/single
  [_ value locale]
  #?(:cljs (let [m (.locale (moment value) locale)]
             (.format m "MMMM D, YYYY"))
     :clj  (u.date/format "MMMM d, yyyy" (u.date/parse value) locale)))

(defmethod formatted-value :date/month-year
  [_ value locale]
  #?(:cljs (let [m (.locale (moment value "YYYY-MM") locale)]
             (if (.isValid m) (.format m "MMMM, YYYY") ""))
     :clj  (u.date/format "MMMM, yyyy" (u.date/parse value) locale)))

#?(:clj
   (def ^:private quarter-formatter-in
     (b/formatter
      "Q" (b/value :iso/quarter-of-year 1) "-" (b/value :year 4))))

#?(:clj
   (def ^:private quarter-formatter-out
     (b/formatter
      "Q" (b/value :iso/quarter-of-year 1) ", " (b/value :year 4))))

(defmethod formatted-value :date/quarter-year
  [_ value locale]
  #?(:cljs (let [m (.locale (moment value "[Q]Q-YYYY") locale)]
             (if (.isValid m) (.format m "[Q]Q, YYYY") ""))
     :clj (.format (.withLocale ^DateTimeFormatter quarter-formatter-out (i18n.impl/locale locale))
                   (.parse ^DateTimeFormatter quarter-formatter-in value))))

(defmethod formatted-value :date/range
  [_ value locale]
  (let [[start end] (str/split value #"~")]
    (if (and start end)
      (str (formatted-value :date/single start locale)
           " - "
           (formatted-value :date/single end locale))
      "")))

(defmethod formatted-value :date/relative
  [_ value locale]
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
    (formatted-value :default locale locale)))

(defmethod formatted-value :date/all-options
  [_ value locale]
  ;; Test value against a series of regexes (similar to those in metabase/parameters/utils/mbql.js) to determine
  ;; the appropriate formatting, since it is not encoded in the parameter type.
  ;; TODO: this is a partial implementation that only handles simple dates
  (condp (fn [re value] (->> (re-find re value) second)) value
    #"^~?([0-9-T:]+)~?$"       :>> #(formatted-value :date/single % locale)
    #"^([0-9-T:]+~[0-9-T:]+)$" :>> #(formatted-value :date/range % locale)
    (str value)))

(defn formatted-list
  "Given a seq of parameter values, returns them as a single comma-separated string. Does not do additional formatting
  on the values."
  [values]
  (if (= (count values) 1)
    (str (first values))
    (str (str/join ", " (butlast values)) (trs " and ") (last values))))

(defmethod formatted-value :default
  [_ value _]
  (cond
    (sequential? value)
    (formatted-list value)

    :else
    (str value)))

(def ^:private escaped-chars-regex
  #"[\\/*_`'\[\](){}<>#+-.!$@%^&=|\?~]")

(defn- escape-chars
  [text]
  (str/replace text escaped-chars-regex #(str \\ %)))

(defn- replacement
  [tag->param locale match]
  (let [tag-name (second match)
        param    (get tag->param tag-name)
        value    (:value param)
        tyype    (:type param)]
    (if value
      (try (-> (formatted-value tyype value locale)
               escape-chars)
           (catch #?(:clj Throwable :cljs js/Error) _
             ;; If we got an exception (most likely during date parsing/formatting), fallback to the default
             ;; implementation of formatted-value
             (formatted-value :default value locale)))
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

(defn ^:export tag_names
  "Given the content of a text dashboard card, return a set of the unique names of template tags in the text."
  [text]
  (let [tag-names (->> (re-seq template-tag-regex (or text ""))
                       (map second)
                       set)]
    #?(:clj  tag-names
       :cljs (clj->js tag-names))))

(defn ^:export substitute_tags
  "Given the context of a text dashboard card, replace all template tags in the text with their corresponding values,
  formatted and escaped appropriately."
  ([text tag->param]
   (substitute_tags text tag->param "en"))
  ([text tag->param locale]
   (when text
     (let [tag->param #?(:clj tag->param
                         :cljs (js->clj tag->param))
           tag->normalized-param (reduce-kv (fn [acc tag param]
                                              (assoc acc tag (normalize-parameter param)))
                                            {}
                                            tag->param)]
       (str/replace text template-tag-regex (partial replacement tag->normalized-param locale))))))
