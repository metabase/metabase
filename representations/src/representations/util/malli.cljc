(ns representations.util.malli
  (:require
   [malli.core :as m]
   [malli.error :as me]
   [malli.transform :as mt]
   [representations.util.malli.registry :as mr]))

(defn humanize-include-value
  "Pass into mu/humanize to include the value received in the error message."
  [{:keys [value message]}]
  (str message ", " "received: " (pr-str value)))

(defn explain
  "Explains a schema failure, and returns the offending value."
  [schema value]
  (-> (mr/explain schema value)
      (me/humanize {:wrap humanize-include-value})))

(defn coerce
  [schema value]
  (try
    (m/coerce schema value mt/string-transformer)
    (catch #?(:clj Exception :cljs :default) e
      (let [data (ex-data e)]
        (if (= (:type data) :malli.core/coercion)
          ;; Re-throw with nicer message using humanized error
          (let [{coerced-value :value coercion-schema :schema} (:data data)]
            (throw (ex-info "Value does not match schema"
                            {:error (explain coercion-schema coerced-value)})))
          ;; Re-throw other exceptions as-is
          (throw e))))))
