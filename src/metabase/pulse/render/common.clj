(ns metabase.pulse.render.common
  (:require
   [clojure.pprint :refer [cl-format]]
   [clojure.string :as str]
   [hiccup.util]
   [metabase.public-settings :as public-settings]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.shared.util.currency :as currency]
   [metabase.util.ui-logic :as ui-logic]
   [potemkin.types :as p.types]
   [schema.core :as s])
  (:import
   (java.math RoundingMode)
   (java.net URL)
   (java.text DecimalFormat DecimalFormatSymbols)))

(set! *warn-on-reflection* true)

;; Fool Eastwood into thinking this namespace is used
(comment hiccup.util/keep-me)

(def RenderedPulseCard
  "Schema used for functions that operate on pulse card contents and their attachments"
  {:attachments                  (s/maybe {s/Str URL})
   :content                      [s/Any]
   (s/optional-key :render/text) (s/maybe s/Str)})

(p.types/defrecord+ NumericWrapper [^String num-str ^Number num-value]
  hiccup.util/ToString
  (to-str [_] num-str)

  Object
  (toString [_] num-str))

(defn- strip-trailing-zeroes
  [num-as-string decimal]
  (if (str/includes? num-as-string (str decimal))
    (let [pattern (re-pattern (str/escape (str decimal \$) {\. "\\."}))]
      (-> num-as-string
          (str/split #"0+$")
          first
          (str/split pattern)
          first))
    num-as-string))

(defn- digits-after-decimal
  ([value] (digits-after-decimal value "."))
  ([value decimal]
   (if (zero? value)
     0
     (let [val-string (-> (condp = (type value)
                            java.math.BigDecimal (.toPlainString ^BigDecimal value)
                            java.lang.Double (format "%.20f" value)
                            java.lang.Float (format "%.20f" value)
                            (str value))
                          (strip-trailing-zeroes (str decimal)))
           [_n d] (str/split val-string #"[^\d*]")]
       (count d)))))

(defn- sig-figs-after-decimal
  [value decimal]
  (if (zero? value)
    0
    (let [val-string (-> (condp = (type value)
                           java.math.BigDecimal (.toPlainString ^BigDecimal value)
                           java.lang.Double (format "%.20f" value)
                           java.lang.Float (format "%.20f" value)
                           (str value))
                         (strip-trailing-zeroes (str decimal)))
          figs (last (str/split val-string #"[\.0]+"))]
      (count figs))))

(defn number-formatter
  "Return a function that will take a number and format it according to its column viz settings. Useful to compute the
  format string once and then apply it over many values."
  [{:keys [semantic_type effective_type base_type]
    col-id :id field-ref :field_ref col-name :name :as _column}
   viz-settings]
  (let [col-id (or col-id (second field-ref))
        column-settings (-> (get viz-settings ::mb.viz/column-settings)
                            (update-keys #(select-keys % [::mb.viz/field-id ::mb.viz/column-name])))
        column-settings (or (get column-settings {::mb.viz/field-id col-id})
                            (get column-settings {::mb.viz/column-name col-name}))
        global-settings (::mb.viz/global-column-settings viz-settings)
        currency?       (boolean (or (= (::mb.viz/number-style column-settings) "currency")
                                     (and (nil? (::mb.viz/number-style column-settings))
                                          (or
                                           (::mb.viz/currency-style column-settings)
                                           (::mb.viz/currency column-settings)))))
        {::mb.viz/keys [number-separators decimals scale number-style
                        prefix suffix currency-style currency]} (merge
                                                                 (when currency?
                                                                   (:type/Currency global-settings))
                                                                 (:type/Number global-settings)
                                                                 column-settings)
        integral?       (isa? (or effective_type base_type) :type/Integer)
        percent?        (or (isa? semantic_type :type/Percentage) (= number-style "percent"))
        scientific?     (= number-style "scientific")
        [decimal grouping] (or number-separators
                               (get-in (public-settings/custom-formatting) [:type/Number :number_separators])
                               ".,")
        symbols            (doto (DecimalFormatSymbols.)
                             (cond-> decimal (.setDecimalSeparator decimal))
                             (cond-> grouping (.setGroupingSeparator grouping)))
        base               (cond-> (if (= number-style "scientific") "0" "#,##0")
                             (not grouping) (str/replace #"," ""))]
    (fn [value]
      (if (number? value)
        (let [scaled-value (* value (or scale 1))
              decimals-in-value (digits-after-decimal (if percent? (* 100 scaled-value) scaled-value))
              decimal-digits (cond
                               decimals decimals ;; if user ever specifies # of decimals, use that
                               integral? 0
                               currency? (get-in currency/currency [(keyword (or currency "USD")) :decimal_digits])
                               percent?  (min 2 decimals-in-value) ;; 5.5432 -> %554.32
                               :else (if (>= scaled-value 1)
                                       (min 2 decimals-in-value) ;; values greater than 1 round to 2 decimal places
                                       (let [n-figs (sig-figs-after-decimal scaled-value decimal)]
                                         (if (> n-figs 2)
                                           (max 2 (- decimals-in-value (- n-figs 2))) ;; values less than 1 round to 2 sig-dig
                                           decimals-in-value))))
              fmt-str (cond-> base
                        (not (zero? decimal-digits)) (str "." (apply str (repeat decimal-digits "0")))
                        scientific? (str "E0")
                        percent?    (str "%"))
              fmtr (doto (DecimalFormat. fmt-str symbols) (.setRoundingMode RoundingMode/HALF_UP))]
          (map->NumericWrapper
           {:num-value value
            :num-str   (str (when prefix prefix)
                            (when (and currency? (or (nil? currency-style)
                                                     (= currency-style "symbol")))
                              (get-in currency/currency [(keyword (or currency "USD")) :symbol]))
                            (when (and currency? (= currency-style "code"))
                              (str (get-in currency/currency [(keyword (or currency "USD")) :code]) \space))
                            (cond-> (.format fmtr scaled-value)
                              (not decimals) (strip-trailing-zeroes decimal))
                            (when (and currency? (= currency-style "name"))
                              (str \space (get-in currency/currency [(keyword (or currency "USD")) :name_plural])))
                            (when suffix suffix))}))
        value))))

(s/defn format-number :- NumericWrapper
  "Format a number `n` and return it as a NumericWrapper; this type is used to do special formatting in other
  `pulse.render` namespaces."
  ([n :- s/Num]
   (map->NumericWrapper {:num-str   (cl-format nil (if (integer? n) "~:d" "~,2f") n)
                         :num-value n}))
  ([value column viz-settings]
   (let [fmttr (number-formatter column viz-settings)]
     (fmttr value))))

(defn graphing-column-row-fns
  "Return a pair of `[get-x-axis get-y-axis]` functions that can be used to get the x-axis and y-axis values in a row,
  or columns, respectively."
  [card data]
  [(or (ui-logic/x-axis-rowfn card data)
       first)
   (or (ui-logic/y-axis-rowfn card data)
       second)])

(defn coerce-bignum-to-int
  "Graal polyglot system (not the JS machine itself, the polyglot system)
  is not happy with BigInts or BigDecimals.
  For more information, this is the GraalVM issue, open a while
  https://github.com/oracle/graal/issues/2737
  Because of this unfortunately they all have to get smushed into normal ints and decimals in JS land."
  [row]
  (for [member row]
    (cond
      ;; this returns true for bigint only, not normal int or long
      (instance? clojure.lang.BigInt member)
      (int member)

      ;; this returns true for bigdec only, not actual normal decimals
      ;; not the clearest clojure native function in the world
      (decimal? member)
      (double member)

      :else
      member)))

(defn row-preprocess
  "Preprocess rows.

  - Removes any rows that have a nil value for the `x-axis-fn` OR `y-axis-fn`
  - Normalizes bigints and bigdecs to ordinary sizes"
  [x-axis-fn y-axis-fn rows]
  (->> rows
       (filter (every-pred x-axis-fn y-axis-fn))
       (map coerce-bignum-to-int)))
