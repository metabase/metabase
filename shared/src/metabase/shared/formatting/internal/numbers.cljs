(ns metabase.shared.formatting.internal.numbers
  "ClojureScript implementation of number formatting.
  Implements the [[NumberFormatter]] protocol from numbers_core, plus some helpers."
  (:require
   [clojure.string :as str]
   [metabase.shared.formatting.internal.numbers-core :as core]
   [metabase.shared.util.currency :as currency]
   [metabase.util :as u]))

(def ^:private default-number-separators ".,")

(defn- adjust-number-separators [text separators]
  (if (and separators
           (not= separators default-number-separators))
    (let [decimal    (first separators)
          grouping   (or (second separators) "") ; grouping separators are optional
          transform  {"," grouping "." decimal}]
      (str/replace text #"[\.,]" transform))
    text))

(defn- fix-currency-symbols [text currency]
  (let [sym (currency/currency-symbol currency)]
    (-> text
        ;; Some have spaces and some don't - remove the space if it's there.
        (str/replace (str (name currency) core/non-breaking-space) sym)
        (str/replace (name currency) sym))))

(defn- base-format-scientific [nf number]
  (letfn [(transform [{:keys [type value]}]
            (case type
              "exponentSeparator" "e"
              value))]
    (let [parts  (js->clj (.formatToParts nf number) {:keywordize-keys true})
          ;; If there's no exponent minus sign, add a plus sign.
          parts  (if (some #(= (:type %) "exponentMinusSign") parts)
                   parts
                   (let [[pre post] (split-with #(not= (:type %) "exponentInteger") parts)]
                     (concat pre [{:type "exponentPlusSign" :value "+"}] post)))]
      (apply str (map transform parts)))))

;; Core internals =================================================================================================
;; TODO(braden) We could get more nicely localized currency values by using the user's locale.
;; The problem is that then we don't know what the number separators are. We could determine it
;; with a simple test like formatting 12345.67, though.
;; Using "en" here means, among other things, that currency values are not localized as well
;; as they could be. Many European languages put currency signs as suffixes, eg. 123 euros is:
;; - "€123.00" in "en"
;; - "€123,00" with "en" but fixing up the separators for a German locale
;; - "123,00 €" in actual German convention, which is what we would get with a native "de" locale here.
(defn- number-formatter-for-options-baseline [options]
  (let [default-fraction-digits (when (= (:number-style options) "currency")
                                  2)]
    (js/Intl.NumberFormat.
      "en"
      (clj->js (u/remove-nils
                 {:style    (when-not (= (:number-style options) "scientific")
                              (:number-style options "decimal"))
                  :notation (when (= (:number-style options) "scientific")
                              "scientific")
                  :currency (:currency options)
                  :currencyDisplay (:currency-style options)
                  ;; Always use grouping separators, but we may remove them per number_separators.
                  :useGrouping              true
                  :minimumIntegerDigits     (:minimum-integer-digits     options)
                  :minimumFractionDigits    (:minimum-fraction-digits    options default-fraction-digits)
                  :maximumFractionDigits    (:maximum-fraction-digits    options default-fraction-digits)
                  :minimumSignificantDigits (:minimum-significant-digits options)
                  :maximumSignificantDigits (:maximum-significant-digits options)})))))

(defn- currency-symbols? [options]
  (let [style (:currency-style options)]
    (and (:currency options)
         (or (nil? style)
             (= style "symbol")))))

(defn- formatter-fn [nf options]
  (case (:number-style options)
    "scientific" #(base-format-scientific nf %)
    #(.format nf %)))

(defn number-formatter-for-options
  "The key function implemented for each language, and called by the top-level number formatting.
  Returns a [[core/NumberFormatter]] instance for each set of options.
  These formatters are reusable, but this does no caching."
  [options]
  (let [nf        (number-formatter-for-options-baseline options)
        symbols?  (currency-symbols? options)
        formatter (formatter-fn nf options)]
    (reify
      core/NumberFormatter
      (format-number-basic [_ number]
        (cond-> (formatter number)
          true     (adjust-number-separators (:number-separators options))
          symbols? (fix-currency-symbols (:currency options))))

      (wrap-currency [_ text]
        ;; Intl.NumberFormat.formatToParts(1) returns, eg. [currency, integer, decimal, fraction]
        ;; Keep only currency and integer, and replace integer's :value with our provided text.
        (apply str (for [{:keys [type value]} (js->clj (.formatToParts nf 1) :keywordize-keys true)
                         :when (#{"currency" "integer"} type)]
                     (if (= type "integer")
                       text
                       value))))

      (split-exponent [_ formatted] (throw (ex-info "split-exponent not implemented" {:text formatted}))))))

;; Scientific notation ============================================================================================
(defn format-number-scientific
  "Formats a number in scientific notation. The wrangling required differs by platform."
  [number options]
  (-> (core/prep-options options)
      number-formatter-for-options
      (core/format-number-basic number)))
