(ns metabase.util.formatting.numbers
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.formatting.internal.numbers :as internal]
   [metabase.util.formatting.internal.numbers-core :as core]))

(declare format-number)

(def compact-currency-options
  "Extra defaults that are mixed in when formatted a currency value in compact mode."
  {:currency-style "symbol"})

#?(:cljs
   (def ^:export compact-currency-options-js
     "Extra defaults that are mixed in when formatted a currency value in compact mode."
     (clj->js compact-currency-options)))

;; Compact form ===================================================================================================
(def ^:private display-compact-decimals-cutoff 1000)

(def ^:private humanized-powers
  [[1000000000000 "T"]
   [1000000000    "B"]
   [1000000       "M"]
   [1000          "k"]])

(def ^:private datasize-units-binary
  [[1125899906842624 "PiB"]  ; 2^50
   [1099511627776    "TiB"]  ; 2^40
   [1073741824       "GiB"]  ; 2^30
   [1048576          "MiB"]  ; 2^20
   [1024             "KiB"]  ; 2^10
   [1                "B"]])

(def ^:private datasize-units-decimal
  [[1000000000000000 "PB"]   ; 10^15
   [1000000000000    "TB"]   ; 10^12
   [1000000000       "GB"]   ; 10^9
   [1000000          "MB"]   ; 10^6
   [1000             "KB"]   ; 10^3
   [1                "B"]])

(defn- format-number-compact-basic [number options]
  (let [options   (dissoc options :compact :number-style)
        abs-value (abs number)]
    (cond
      (zero? number) "0"
      (< abs-value display-compact-decimals-cutoff) (format-number number options)
      :else (let [[power suffix] (first (filter #(>= abs-value (first %)) humanized-powers))]
              (str (format-number (/ number power)
                                  (merge options {:minimum-fraction-digits 1 :maximum-fraction-digits 1}))
                   suffix)))))

(defmulti ^:private format-number-compact*
  {:arglists '([number options])}
  (fn [_ {:keys [number-style]}] number-style))

(defmethod format-number-compact* :default [number options]
  (format-number-compact-basic number options))

(defmethod format-number-compact* "percent" [number options]
  (str (format-number-compact-basic (* 100 number) options) "%"))

(defmethod format-number-compact* "currency" [number options]
  (let [options   (merge options compact-currency-options)
        formatter (internal/number-formatter-for-options options)]
    (if (< (abs number) display-compact-decimals-cutoff)
      (core/format-number-basic formatter number)
      (core/wrap-currency formatter (format-number-compact-basic number options)))))

(defmethod format-number-compact* "scientific" [number options]
  (internal/format-number-scientific number (merge options {:maximum-fraction-digits 1 :minimum-fraction-digits 1})))

(defmethod format-number-compact* "datasize" [number options]
  (let [binary? (= (:datasize-unit-system options "binary") "binary")
        units (if binary? datasize-units-binary datasize-units-decimal)
        abs-value (abs number)
        [threshold unit] (first (filter #(>= abs-value (first %)) units))
        ; Default to Bytes if no unit found (for values < 1)
        unit (or unit "B")
        scaled-value (if threshold (/ number threshold) number)
        abs-scaled (abs scaled-value)]
    (str (cond
           ; Bytes are always shown as integers (including fractional bytes)
           (= unit "B")
           (long (#?(:clj Math/round :cljs js/Math.round) (double scaled-value)))

           ; User explicitly specified decimals = 0, round to nearest integer
           (= (:decimals options) 0)
           (long (#?(:clj Math/round :cljs js/Math.round) (double scaled-value)))

           ; Otherwise, show with appropriate precision
           :else
           (let [; When no decimals specified, default behavior is:
                 ; - Show up to 2 decimal places
                 ; - Don't show trailing zeros
                 ; - Don't show unnecessary .0
                 max-decimals (or (:decimals options) 2)
                 ; For values very close to the next unit, show more precision
                 ; e.g. 1048575 bytes = 1023.9990234375 KiB, should show as 1023.99
                 factor (#?(:clj Math/pow :cljs js/Math.pow) 10 max-decimals)
                 ; Use floor for positive values, ceil for negative values (to truncate towards zero)
                 truncated (if (>= scaled-value 0)
                             (* (#?(:clj Math/floor :cljs js/Math.floor) (* abs-scaled factor)) (/ 1 factor))
                             (* (- (#?(:clj Math/floor :cljs js/Math.floor) (* abs-scaled factor))) (/ 1 factor)))]
             ; Format the number without thousand separators
             (if (= truncated (long truncated))
               ; Whole number - just show the integer part
               (str (long truncated))
               ; Has decimal part - format appropriately
               ; Create decimal string manually to avoid cross-platform issues
               (let [abs-truncated (abs truncated)
                     int-part (long abs-truncated)
                     decimal-part (- abs-truncated int-part)
                     ; Convert decimal part to string with proper precision
                     dec-factor (#?(:clj Math/pow :cljs js/Math.pow) 10 max-decimals)
                     dec-value (long (#?(:clj Math/round :cljs js/Math.round) (double (* decimal-part dec-factor))))
                     dec-str (str dec-value)
                     ; Pad with zeros if needed
                     padded (if (< (count dec-str) max-decimals)
                              (str (apply str (repeat (- max-decimals (count dec-str)) "0")) dec-str)
                              dec-str)
                     ; Remove trailing zeros
                     trimmed (str/replace padded #"0+$" "")
                     ; Add negative sign if needed
                     sign (if (< truncated 0) "-" "")]
                 (if (empty? trimmed)
                   (str sign int-part)
                   (str sign int-part "." trimmed))))))
         " "
         unit)))

(defn- format-number-compact [number options]
  (format-number-compact* number (-> options
                                     (dissoc :compact)
                                     core/prep-options)))

;; High-level =====================================================================================================
(defn- format-number-standard [number options]
  (let [options (core/prep-options options)
        nf (cond
             (:number-formatter options) (:number-formatter options)

             ;; Hacky special case inherited from the TS version - to match classic behavior for small numbers,
             ;; treat maximum-fraction-digits as maximum-significant-digits instead.
             ;; "Small" means |x| < 1, or < 1% for percentages.
             (and (not (:decimals options))
                  (not (:minimum-fraction-digits options))
                  (not= (:number-style options) "currency")
                  (< (abs number)
                     (if (= (:number-style options) "percent")
                       0.01
                       1)))
             (-> options
                 (dissoc :maximum-fraction-digits)
                 (assoc :maximum-significant-digits (max 2 (:minimum-significant-digits options 0)))
                 internal/number-formatter-for-options)

             :else (internal/number-formatter-for-options options))]
    (core/format-number-basic nf number)))

(defn ^:export format-number
  "Formats a number according to a map of options.
  The options:
  - `:compact` boolean: Set true for human-readable contractions like $2.4M rather than $2,413,326.98.
  - `:currency` string: The ISO currency code, eg. USD, RMB, EUR. **Required** when `:number-style \"currency\"`.
  - `:currency-style` \"symbol\" | \"code\" | \"name\": Sets how the currency unit is displayed. Default is \"symbol\".
  - `:maximum-fraction-digits` number: Show at most this many decimal places. Default 2.
  - `:minimum-fraction-digits` number: Show at least this many decimal places. Default 0, or 2 for currencies.
  - `:minimum-integer-digits` number: Show at least this many integer digits. Default 1.
  - `:maximum-significant-digits` number: Show at most this many significant figures. Default not set; no extra rounding.
  - `:minimum-significant-digits` number: Show at least this many significant figures. Default not set; no padding.
  - `:negative-in-parentheses` boolean: True wraps negative values in parentheses; false (the default) uses minus signs.
  - `:number-serpators` string: A two-character string \"ab\" where `a` is the decimal symbol and `b` is the grouping.
    Default is American-style \".,\".
  - `:number-style` \"currency\" | \"decimal\" | \"scientific\" | \"percent\" | \"datasize\": The fundamental type to display.
      - \"currency\" renders as eg. \"$123.45\" based on the `:currency` value.
      - \"percent\" renders eg. 0.432 as \"43.2%\".
      - \"scientific\" renders in scientific notation with 1 integer digit: eg. 0.00432 as \"4.32e-3\".
      - \"datasize\" renders bytes with appropriate units: eg. 1024 as \"1 KiB\" or \"1 KB\".
      - \"decimal\" (the default) is basic numeric notation.
  - `:scale` number: Gives a factor by which to multiply the value before rendering it."
  [number options]
  (let [{:keys [compact negative-in-parentheses number-style scale] :as options} (u/normalize-map options)]
    (cond
      (and scale (not (NaN? scale))) (format-number (* scale number) (dissoc options :scale))

      (and (neg? number)
           negative-in-parentheses)  (str "("
                                          (format-number (- number) (assoc options :negative-in-parentheses false))
                                          ")")

      compact                        (format-number-compact number options)
      (= (keyword number-style)
         :scientific)                (internal/format-number-scientific number options)
      (= number-style "datasize")    (format-number-compact* number options)
      :else                          (format-number-standard   number options))))
