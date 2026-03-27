(ns metabase.parameters.shared
  "Util functions for dealing with parameters. Primarily used for substituting parameters into variables in Markdown
  dashboard cards."
  (:require
   #?@(:clj
       ([metabase.util.date-2 :as u.date]
        [metabase.util.date-2.parse.builder :as b]
        [metabase.util.i18n.impl :as i18n.impl]))
   #?@(:cljs
       (["dayjs" :as dayjs]
        ["dayjs/plugin/customParseFormat" :as dayjs-customParseFormat]
        ["dayjs/plugin/quarterOfYear" :as dayjs-quarterOfYear]))
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.time :as time])
  (:import
   #?@(:clj
       ((java.time.format DateTimeFormatter)))))

;; Initialize dayjs plugins
#?(:cljs
   (do
     (dayjs/extend dayjs-customParseFormat)
     (dayjs/extend dayjs-quarterOfYear)))

(defmulti formatted-value
  "Formats a value appropriately for inclusion in a text card, based on its type. Does not do any escaping.
  For datetime parameters, the logic here should mirror the logic (as best as possible) in
  frontend/src/metabase/parameters/utils/date-formatting.ts"
  {:arglists '([tyype value locale])}
  (fn [tyype _value _locale] (keyword tyype)))

(declare formatted-list)

(defmethod formatted-value :string/contains
  [_ values _]
  (let [values (u/one-or-many values)]
    (trs "contains {0}" (formatted-list values :conjunction (trs "or")))))

;; TODO: Refactor to use time/parse-unit and time/format-unit
(defmethod formatted-value :date/single
  [_ value locale]
  #?(:cljs (let [m (.locale (dayjs value) locale)]
             (.format m "MMMM D, YYYY"))
     :clj  (u.date/format "MMMM d, yyyy" (u.date/parse value) locale)))

;; TODO: Refactor to use time/parse-unit and time/format-unit
(defmethod formatted-value :date/month-year
  [_ value locale]
  #?(:cljs (let [m (.locale (dayjs value "YYYY-MM") locale)]
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

;; TODO: Refactor to use time/parse-unit and time/format-unit
(defmethod formatted-value :date/quarter-year
  [_ value locale]
  #?(:cljs (let [m (.locale (dayjs value "[Q]Q-YYYY") locale)]
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

(defn- singularize-unit
  [unit-str]
  (keyword (str/replace unit-str #"s$" "")))

(defn- format-relative-date
  [prefix n interval]
  (let [n #?(:clj (Integer/valueOf ^String n) :cljs (js/parseInt n))
        n (if (= prefix "past") (- n) n)
        unit-kw (singularize-unit interval)]
    (lib/describe-temporal-interval n unit-kw)))

(defn- format-relative-date-with-offset
  [prefix n1 unit1 n2 unit2]
  (let [n1-num    #?(:clj (Integer/valueOf ^String n1) :cljs (js/parseInt n1))
        n2-num    #?(:clj (Integer/valueOf ^String n2) :cljs (js/parseInt n2))
        n1-num    (if (= prefix "past") (- n1-num) n1-num)
        n2-num    (if (= prefix "past") (- n2-num) n2-num)
        unit1-kw  (singularize-unit unit1)
        unit2-kw  (singularize-unit unit2)
        interval1 (lib/describe-temporal-interval n1-num unit1-kw)
        interval2 (lib/describe-relative-datetime n2-num unit2-kw)]
    (str interval1 ", " interval2)))

(defmethod formatted-value :date/relative
  [_ value _]
  (condp (fn [re value] (->> (re-find re value) next)) value
    #"^today$"                              (lib/describe-temporal-interval 0 :day)
    #"^thisday$"                            (lib/describe-temporal-interval 0 :day)
    #"^thisweek$"                           (lib/describe-temporal-interval 0 :week)
    #"^thismonth$"                          (lib/describe-temporal-interval 0 :month)
    #"^thisquarter$"                        (lib/describe-temporal-interval 0 :quarter)
    #"^thisyear$"                           (lib/describe-temporal-interval 0 :year)
    #"^(past|next)([0-9]+)([a-z]+)s~?$" :>> (fn [matches] (apply format-relative-date matches))
    #"^(past|next)([0-9]+)([a-z]+)s-from-([0-9]+)([a-z]+)s$" :>> (fn [matches] (apply format-relative-date-with-offset matches))))

(defn- format-day [value locale]
  (-> value
      (time/parse-unit  :day-of-week-abbrev "en") ;; always read in en locale
      (time/format-unit :day-of-week        locale)))

(defn- format-hour [value locale]
  (-> value
      (time/parse-unit  :hour-of-day-24     "en") ;; always read in en locale
      (time/format-unit :hour-of-day        locale)))

(defn- format-month [value locale]
  (-> value
      (time/parse-unit  :month-of-year      "en") ;; always read in en locale
      (time/format-unit :month-of-year-full locale)))

(defn- format-exclude-unit [value unit locale]
  (case unit
    "hours"    (format-hour value locale)
    "days"     (format-day value locale)
    "months"   (format-month value locale)
    "quarters" (trs "Q{0}" value)))

(defmethod formatted-value :date/exclude
  [_ value locale]
  (let [[exclude unit & parts] (str/split value #"-")]
    (assert (= "exclude" exclude) "The exclude string should start with 'exclude-'.")
    (if (<= (count parts) 2)
      (trs "Exclude {0}" (str/join ", " (map #(format-exclude-unit % unit locale) parts)))
      (trs "Exclude {0} selections" (count parts)))))

(defmethod formatted-value :date/all-options
  [_ value locale]
  ;; Test value against a series of regexes (similar to those in metabase/parameters/utils/mbql.js) to determine
  ;; the appropriate formatting, since it is not encoded in the parameter type.
  (condp (fn [re value] (->> (re-find re value) second)) value
    #"^(this[a-z]+)$"          :>> #(formatted-value :date/relative % locale)
    #"^~([0-9-T:]+)$"          :>> #(trs "Before {0}" (formatted-value :date/single % locale))
    #"^([0-9-T:]+)$"           :>> #(trs "On {0}"     (formatted-value :date/single % locale))
    #"^([0-9-T:]+)~$"          :>> #(trs "After {0}"  (formatted-value :date/single % locale))
    #"^([0-9-T:]+~[0-9-T:]+)$" :>> #(formatted-value :date/range % locale)
    #"^(exclude-.+)$"          :>> #(formatted-value :date/exclude % locale)
    (formatted-value :date/relative value locale)))

(defn formatted-list
  "Given a seq of parameter values, returns them as a single comma-separated string. Does not do additional formatting
  on the values. The conjunction parameter determines whether to use 'and' or 'or' to join the last two items."
  [values & {:keys [conjunction] :or {conjunction (trs "and")}}]
  (condp = (count values)
    1 (str (first values))
    2 (trs "{0} {1} {2}" (first values) conjunction (second values))
    (trs "{0}, {1}, {2} {3}"
         (str/join ", " (drop-last 2 values))
         (nth values (- (count values) 2))
         conjunction
         (last values))))

(defmethod formatted-value :default
  [_ value _]
  (cond
    (sequential? value)
    (formatted-list value)

    :else
    (str value)))

(def escaped-chars-regex
  "Used markdown characters."
  #"[\\/*_`'\[\](){}<>#+-.!$@%^&=|\?~]")

(defn escape-chars
  "Escape markdown characters."
  [text regex]
  (str/replace text regex #(str \\ %)))

(defn- value
  [tag-name tag->param locale escape-markdown]
  (let [param    (get tag->param tag-name)
        value    (:value param)
        tyype    (:type param)]
    (when value
      (try (cond-> (formatted-value tyype value locale)
             escape-markdown (escape-chars escaped-chars-regex))
           (catch #?(:clj Throwable :cljs js/Error) _
             ;; If we got an exception (most likely during date parsing/formatting), fallback to the default
             ;; implementation of formatted-value
             (formatted-value :default value locale))))))

(defn param-val-or-default
  "Returns the parameter value, such that:
    * nil value => nil
    * missing value key => default"
  [parameter]
  (get parameter :value (:default parameter)))

(defn value-string
  "Returns the value(s) of a dashboard filter, formatted appropriately."
  [parameter locale]
  (let [tyype  (:type parameter)
        values (param-val-or-default parameter)]
    (try (formatted-value tyype values locale)
         (catch #?(:clj Throwable :cljs js/Error) _
           (formatted-list (u/one-or-many values))))))

(def ^:private template-tag-regex
  "A regex to find template tags in a text card on a dashboard. This should mirror the regex used to find template
  tags in native queries, with the exception of snippets and card ID references (see the metabase-lib function
  `recognizeTemplateTags` for that regex).

  If you modify this, also modify `template-tag-splitting-regex` below."
  #"\{\{\s*([A-Za-z0-9_\.]+?)\s*\}\}")

(def ^:private template-tag-splitting-regex
  "A regex for splitting text around template tags. This should be identical to `template-tag-regex` above, but without
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
  [tag->normalized-param locale escape-markdown split-text]
  (map
   (fn [maybe-variable]
     (if (TextParam? maybe-variable)
       (assoc maybe-variable :value (value (:tag maybe-variable) tag->normalized-param locale escape-markdown))
       maybe-variable))
   split-text))

(def ^:private optional-block-regex
  #"\[\[.+?\]\]")

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

(defn ^:export tag-names
  "Given the content of a text dashboard card, return a set of the unique names of template tags in the text."
  [text]
  (let [tag-names (->> (re-seq template-tag-regex (or text ""))
                       (map second)
                       set)]
    #?(:clj  tag-names
       :cljs (clj->js tag-names))))

(defn ^:export substitute-tags
  "Given the context of a text dashboard card, replace all template tags in the text with their corresponding values,
  formatted and escaped appropriately if escape-markdown is true. Specifically escape-markdown should be false when the
  output isn't being rendered directly as markdown, such as in header cards."
  ([text tag->param]
   (substitute-tags text tag->param "en" true))
  ([text tag->param locale escape-markdown]
   (when text
     (let [tag->param #?(:clj tag->param
                         :cljs (js->clj tag->param))
           tag->normalized-param (try
                                   (update-vals tag->param parameters.schema/normalize-parameter)
                                   (catch #?(:clj Throwable :cljs :default) e
                                     (log/warnf "Unable to substitute tags: invalid parameters: %s" (ex-message e))))]
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
            (add-values-to-variables tag->normalized-param locale escape-markdown)
            join-consecutive-strings
            strip-optional-blocks)))))
