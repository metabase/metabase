(ns metabase.shared.formatting.internal.numbers
  "JVM Clojure implementation of the [[core/NumberFormatter]] abstaction."
  (:require
   [clojure.string :as str]
   [metabase.shared.formatting.internal.numbers-core :as core]
   [metabase.shared.util.currency :as currency])
  (:import
   (java.math BigDecimal MathContext RoundingMode)
   (java.text DecimalFormat NumberFormat)
   (java.util Currency Locale)))

(set! *warn-on-reflection* true)

;; Clojure helpers ================================================================================================
(defn- sig-figs [number figures]
  (BigDecimal. (double number) (MathContext. figures RoundingMode/HALF_UP)))

(defn- str-run [n x]
  (apply str (repeat n x)))

(defn- attach-currency-symbol [text ^NumberFormat nf ^Locale locale currency]
  (str (currency/currency-symbol currency)
       (subs text (count (.getSymbol (.getCurrency nf) locale)))))

(defn- symbol-for [currency locale]
  (case currency
    :BTC "₿"
    (-> (name currency)
        (Currency/getInstance)
        (.getSymbol locale))))

(defn- apply-currency-style [text ^Currency _currency ^Locale locale style currency-key]
  (let [sym   (symbol-for currency-key locale)
        ;; TODO Our currency table has plurals but no translation; Java's `Currency.getDisplayName` is singular but
        ;; translated. We should get the names in currency/currency keyed by locale.
        currency (get currency/currency currency-key)]
    (case (or style "symbol")
      "symbol" (str/replace text sym (:symbol currency)) ; Java's symbols are not identical to ours
      "name"   (str (str/replace text sym "") " " (:name_plural currency))
      "code"   (str/replace text sym (str (:code currency) core/non-breaking-space)))))

;; Core internals =================================================================================================
(def ^:private bad-currencies
  "Currencies known not to be supported by the Java [[Currency]] classes. Rendered as USD, then the symbols are
  replaced."
  #{:BTC})

(defn- active-locale [options]
  (if (:locale options)
    (Locale. (:locale options))
    (Locale/getDefault)))

(defn- number-formatter-for-options-baseline
  ^NumberFormat [{:keys [maximum-fraction-digits minimum-fraction-digits number-style]} locale]
  (let [^NumberFormat nf (case number-style
                           ;; For scientific, assemble the 0.###E0 DecimalFormat pattern.
                           "scientific" (DecimalFormat. (str "0."
                                                             (str-run (or minimum-fraction-digits 0) "0")
                                                             (str-run (- (or maximum-fraction-digits 2)
                                                                         (or minimum-fraction-digits 0))
                                                                      "#")
                                                             "E0"))
                           "currency"   (NumberFormat/getCurrencyInstance locale)
                           "percent"    (NumberFormat/getPercentInstance locale)
                           (NumberFormat/getInstance locale))]
    (when (not (= number-style #"scientific"))
      (.setMaximumFractionDigits nf (or maximum-fraction-digits 300)))
    nf))

(defn- set-rounding! [^NumberFormat nf]
  ;; JavaScript does not support picking the rounding mode; it's always HALF_UP.
  ;; (Intl.NumberFormat has an option `roundingMode` but it's new and not supported anywhere as of EOY2022.)
  ;; Since Java is flexible, we match the HALF_UP behavior here.
  (.setRoundingMode nf RoundingMode/HALF_UP))

(defn- set-minimum-fraction! [^NumberFormat nf options]
  (when (:minimum-fraction-digits options)
    (.setMinimumFractionDigits nf (:minimum-fraction-digits options))))

(defn- set-currency! [^NumberFormat nf currency]
  (when currency
    (.setCurrency nf (if (bad-currencies currency)
                       ;; For the currencies the JVM doesn't support, we use USD and replace the symbols later.
                       (Currency/getInstance "USD")
                       (Currency/getInstance (name currency))))))

(defn- set-separators! [^NumberFormat nf options]
  (when-let [[decimal grouping] (:number-separators options)]
    (let [^DecimalFormat df nf
          syms              (.getDecimalFormatSymbols df)]
      (when decimal
        (.setDecimalSeparator syms decimal))
      (if grouping
        (.setGroupingSeparator syms grouping)
        (.setGroupingUsed df false))
      (.setDecimalFormatSymbols df syms))))

(defn- prepare-number-formatter! [^NumberFormat nf options currency]
  (set-rounding! nf)
  (set-minimum-fraction! nf options)
  (set-currency! nf currency)
  (set-separators! nf options))

(defn- preformat-step
  "Certain options do not map into Java's [[NumberFormat]] classes. They are handled by preprocessing the number
  (eg. by rounding) instead."
  [options]
  (if (:maximum-significant-digits options)
    #(sig-figs % (:maximum-significant-digits options))
    identity))

(defn number-formatter-for-options
  "The key function implemented for each language, and called by the top-level number formatting.
  Returns a [[core/NumberFormatter]] instance for each set of options.
  These formatters are reusable, but this does no caching."
  [options]
  (let [currency     (some-> options :currency keyword)
        locale       (active-locale options)
        currency-sym (some-> currency (symbol-for locale))
        nf           (number-formatter-for-options-baseline options locale)
        pre          (preformat-step options)]
    (prepare-number-formatter! nf options currency)
    (reify
      core/NumberFormatter
      (format-number-basic [_ number]
        (cond-> (.format nf (pre (bigdec (double number))))
          ;; If running a "bad" currency Java doesn't support, replace the default symbol with the real one.
          (and currency (bad-currencies currency))
          (attach-currency-symbol nf locale currency)
          ;; Handle the :currency-style option, which isn't supported natively on Java.
          currency
          (apply-currency-style (.getCurrency nf) locale (:currency-style options) currency)))

      (wrap-currency [_ text]
        (str currency-sym text))

      (split-exponent [_ formatted]
        (let [^DecimalFormat df nf ;; Scientific mode always uses the DecimalFormat subclass.
              sep (.. df getDecimalFormatSymbols getExponentSeparator)
              exp (str/last-index-of formatted sep)]
          {:mantissa (subs formatted 0 exp)
           :exponent (subs formatted (+ exp (count sep)))})))))

;; Scientific notation ============================================================================================
(defn format-number-scientific
  "Formats a number in scientific notation. The wrangling required differs by platform."
  [number options]
  (let [nf   (-> options core/prep-options number-formatter-for-options)
        base (core/format-number-basic nf number)
        {:keys [mantissa exponent]} (core/split-exponent nf base)
        ?plus (when-not (str/starts-with? exponent "-") "+")]
    (str mantissa "e" ?plus exponent)))
