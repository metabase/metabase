(ns metabase.shared.formatting.internal.numbers-core
  "Cross-platform foundation for the number formatters."
  (:require
   [metabase.shared.util.currency :as currency]))

;; Options ========================================================================================================
(defn- default-decimal-places [{:keys [currency number-style]}]
  (if (and currency (= number-style "currency"))
    (let [places (-> currency keyword (@currency/currency-map) :decimal_digits)]
      {:minimum-fraction-digits places
       :maximum-fraction-digits places})
    {:maximum-fraction-digits 2}))

(defn prep-options
  "Transforms input options with defaults and other adjustments.
  Defaults:
  - `:maximum-fraction-digits` is 2 if not specified
  - BUT if `:currency` is set, `:minimum-fraction-digits = :maximum-fraction-digits = (:decimal_digits currency)`

  Adjustments:
  - :decimals is dropped, and both min and max fraction-digits are set to that value."
  [options]
  (letfn [(expand-decimals [opts]
            (-> opts
                (dissoc :decimals)
                (assoc :maximum-fraction-digits (:decimals options)
                       :minimum-fraction-digits (:decimals options))))]
    (cond-> (merge (default-decimal-places options) options)
      (:decimals options) expand-decimals)))

(def non-breaking-space
  "A Unicode non-breaking space character."
  \u00a0)

;; Formatter abstraction ==========================================================================================
(defprotocol NumberFormatter
  (format-number-basic [this number] "Returns a String that represents the number in this format.")
  (split-exponent [this formatted]
                  "Given a scientific notation string, split it at the locale-dependent exponent.
                  Returns a map `{:mantissa \"123\" :exponent \"+4\"}`.")
  (wrap-currency [this text] "Given an opaque string, wraps it with the currency prefix/suffix for this locale."))
