(ns metabase.shared.parameters.parameters
  "Util functions for dealing with parameters. Primarily used for substituting parameters into variables in Markdown
  dashboard cards."
  #?@
   (:clj
    [(:require [clojure.string :as str]
               [metabase.mbql.normalize :as mbql.normalize]
               [metabase.shared.util.i18n :refer [trs trsn]]
               [metabase.util.date-2 :as u.date]
               [metabase.util.date-2.parse.builder :as b]
               [metabase.util.i18n.impl :as i18n.impl])
     (:import java.time.format.DateTimeFormatter)]
    :cljs
    [(:require ["moment" :as moment]
               [clojure.string :as str]
               [metabase.mbql.normalize :as mbql.normalize]
               [metabase.shared.util.i18n :refer [trs trsn]])]))

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

(defn- translated-interval
  [interval n]
  (get
   {"minutes"  (trsn "Minute" "Minutes" n)
    "hours"    (trsn "Hour" "Hours" n)
    "days"     (trsn "Day" "Days" n)
    "weeks"    (trsn "Week" "Weeks" n)
    "months"   (trsn "Month" "Months" n)
    "quarters" (trsn "Quarter" "Quarters" n)
    "years"    (trsn "Year" "Years" n)}
   interval))

(defn- format-relative-date
  [prefix n interval]
  (let [n        #?(:clj (Integer. n) :cljs (js/parseInt n))
        interval (translated-interval interval n)]
    (case [prefix (= n 1)]
      ["past" true]  (trs "Previous {0}" interval)
      ["past" false] (trs "Previous {0} {1}" n interval)
      ["next" true]  (trs "Next {0}" interval)
      ["next" false] (trs "Next {0} {1}" n interval))))

(defmethod formatted-value :date/relative
  [_ value _]
  (condp (fn [re value] (->> (re-find re value) next)) value
    #"^today$"                             (trs "Today")
    #"^thisday$"                           (trs "Today")
    #"^thisweek$"                          (trs "This Week")
    #"^thismonth$"                         (trs "This Month")
    #"^thisquarter$"                       (trs "This Quarter")
    #"^thisyear$"                          (trs "This Year")
    #"^past1days$"                         (trs "Yesterday")
    #"^next1days$"                         (trs "Tomorrow")
    #"^(past|next)([0-9]+)([a-z]+)~?$" :>> (fn [matches] (apply format-relative-date matches))))

(defmethod formatted-value :date/all-options
  [_ value locale]
  ;; Test value against a series of regexes (similar to those in metabase/parameters/utils/mbql.js) to determine
  ;; the appropriate formatting, since it is not encoded in the parameter type.
  ;; TODO: this is a partial implementation that only handles simple dates
  (condp (fn [re value] (->> (re-find re value) second)) value
    #"^(this[a-z]+)$"          :>> #(formatted-value :date/relative % locale)
    #"^~?([0-9-T:]+)~?$"       :>> #(formatted-value :date/single % locale)
    #"^([0-9-T:]+~[0-9-T:]+)$" :>> #(formatted-value :date/range % locale)
    (formatted-value :date/relative value locale)))

(defn formatted-list
  "Given a seq of parameter values, returns them as a single comma-separated string. Does not do additional formatting
  on the values."
  [values]
  (if (= (count values) 1)
    (str (first values))
    (trs "{0} and {1}" (str/join ", " (butlast values)) (last values))))

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

(defn- value
  [tag-name tag->param locale]
  (let [param    (get tag->param tag-name)
        value    (:value param)
        tyype    (:type param)]
    (when value
      (try (-> (formatted-value tyype value locale)
               escape-chars)
           (catch #?(:clj Throwable :cljs js/Error) _
             ;; If we got an exception (most likely during date parsing/formatting), fallback to the default
             ;; implementation of formatted-value
             (formatted-value :default value locale))))))

(def ^:private template-tag-regex
  "A regex to find template tags in a text card on a dashboard. This should mirror the regex used to find template
  tags in native queries, with the exception of snippets and card ID references (see the metabase-lib function
  `recognizeTemplateTags` for that regex).

  If you modify this, also modify `template-tag-splitting-regex` below."
  #"\{\{\s*([A-Za-z0-9_\.]+?)\s*\}\}")

(def ^:private template-tag-splitting-regex
  "A regex for spliting text around template tags. This should be identical to `template-tag-regex` above, but without
  the capture group around the tag name."
  #"\{\{\s*[A-Za-z0-9_\.]+?\s*\}\}")

;; Represents a variable parsed out of a text card. `tag` contains the tag name alone, as a string. `source` contains
;; the full original syntax for the parameter)
(defrecord ^:private TextParam [tag source]
  Object
  (toString
    [x]
    (or (:value x) source)))

(defn- TextParam?
  [x]
  (instance? TextParam x))

(defn- split-on-tags
  "Given the text of a Markdown card, splits it into a sequence of alternating strings and TextParam records."
  [text]
  (let [split-text      (str/split text template-tag-splitting-regex)
        matches         (map first (re-seq template-tag-regex text))
        max-len         (max (count split-text) (count matches))
        ;; Pad both `split-text` and `matches` with empty strings until they are equal length, so that nothing is
        ;; dropped by the call to `interleave`
        padded-text     (concat split-text (repeatedly (- max-len (count split-text)) (constantly "")))
        padded-matches  (concat matches (repeatedly (- max-len (count matches)) (constantly "")))
        full-split-text (interleave padded-text padded-matches)]
    (map (fn [text]
           (if-let [[_, match] (re-matches template-tag-regex text)]
             (->TextParam match text)
             text))
         full-split-text)))

(defn- join-consecutive-strings
  "Given a vector of strings and/or TextParam, concatenate consecutive strings and TextParams without values."
  [strs-or-vars]
  (->> strs-or-vars
       (partition-by (fn [str-or-var]
                         (or (string? str-or-var)
                             (not (:value str-or-var)))))
       (mapcat (fn [strs-or-var]
                   (if (string? (first strs-or-var))
                     [(str/join strs-or-var)]
                     strs-or-var)))))

(defn- add-values-to-variables
  "Given `split-text`, containing a list of alternating strings and TextParam, add a :value key to any TextParams
  with a corresponding value in `tag->normalized-param`."
  [tag->normalized-param locale split-text]
  (map
   (fn [maybe-variable]
     (if (TextParam? maybe-variable)
         (assoc maybe-variable :value (value (:tag maybe-variable) tag->normalized-param locale))
         maybe-variable))
   split-text))

(def ^:private optional-block-regex
  #"\[\[.+\]\]")

(def ^:private non-optional-block-regex
  #"\[\[(.+?)\]\]")

(defn- strip-optional-blocks
  "Removes any [[optional]] blocks from individual strings in `split-text`, which are blocks that have no parameters
  with values. Then, concatenates the full string and removes the brackets from any remaining optional blocks."
  [split-text]
  (let [s (->> split-text
               (map #(if (TextParam? %) % (str/replace % optional-block-regex "")))
               str/join)]
    (str/replace s non-optional-block-regex second)))

(defn ^:export tag_names
  "Given the content of a text dashboard card, return a set of the unique names of template tags in the text."
  [text]
  (let [tag-names (->> (re-seq template-tag-regex (or text ""))
                       (map second)
                       set)]
    #?(:clj  tag-names
       :cljs (clj->js tag-names))))

(defn- normalize-parameter
  "Normalize a single parameter by calling [[mbql.normalize/normalize-fragment]] on it, and converting all string keys
  to keywords."
  [parameter]
  (-> (mbql.normalize/normalize-fragment [:parameters] [parameter])
      first
      (update-keys keyword)))

(defn ^:export substitute_tags
  "Given the context of a text dashboard card, replace all template tags in the text with their corresponding values,
  formatted and escaped appropriately."
  ([text tag->param]
   (substitute_tags text tag->param "en"))
  ([text tag->param locale]
   (when text
     (let [tag->param #?(:clj tag->param
                         :cljs (js->clj tag->param))
           tag->normalized-param (update-vals tag->param normalize-parameter)]
       ;; Most of the functions in this pipeline are relating to handling optional blocks in the text which use
       ;; the [[ ]] syntax.
       ;; For example, given an input "[[a {{b}}]] [[{{c}}]]", where `b` has no value and `c` = 3:
       ;; 1. `split-on-tags` =>
       ;;      ("[[a " {:tag "b" :source "{{b}}"} "]] [[" {:tag "c" :source "{{c}}"} "]]")
       ;; 2. `add-values-to-variables` =>
       ;;      ("[[a " {:tag "b" :source "{{b}}" :value nil} "]] [[" {:tag "c" :source "{{c}}" :value 3} "]]")
       ;; 3. `join-consecutive-strings` => ("[[a {{b}}]] [[" {:tag "b" :source "{{c}}" :value 3} "]]")
       ;; 4. `strip-optional-blocks` => "3"
       (->> text
            split-on-tags
            (add-values-to-variables tag->normalized-param locale)
            join-consecutive-strings
            strip-optional-blocks)))))
