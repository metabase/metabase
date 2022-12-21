(ns metabase.shared.formatting.internal.numbers-core
  "Cross-platform foundation for the number formatters.")

;; Options ========================================================================================================
(defn prep-options
  "Transforms input options with defaults and other adjustments.
  Defaults:
  - :maximum-fraction-digits 2 if not specified

  Adjustments:
  - :decimals is dropped, and both min and max fraction-digits are set to that value."
  [options]
  (letfn [(expand-decimals [opts]
            (-> opts
                (dissoc :decimals)
                (assoc :maximum-fraction-digits (:decimals options)
                       :minimum-fraction-digits (:decimals options))))]
    (cond-> (merge {:maximum-fraction-digits 2} options)
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
