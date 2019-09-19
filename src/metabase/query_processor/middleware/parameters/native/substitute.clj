(ns metabase.query-processor.middleware.parameters.native.substitute
  (:require [metabase.query-processor.middleware.parameters.native
             [interface :as i]
             [substitution :as substitution]]))

(declare substitute)

(defn- has-all-params? [param->value required-params]
  (every?
   (partial contains? param->value)
   required-params))

(defn- substitute-one [param->value [query params] x]
  (cond
    (string? x)
    [(str query x) params]

    (i/Param? x)
    (do
      (when-not (has-all-params? param->value (i/required-params x))
        (throw (Exception. "Missing required param!")))
      (let [param-name                                            (:k x)
            param                                                 (get param->value param-name)
            {:keys [replacement-snippet prepared-statement-args]} (substitution/->replacement-snippet-info param)]
        [(str query replacement-snippet)
         (concat params prepared-statement-args)]))

    (i/Optional? x)
    (do
      (println (list 'has-all-params? 'param->value (i/required-params x)) (has-all-params? param->value (i/required-params x)))
      (if (has-all-params? param->value (i/required-params x))
        (let [[snippet args] (substitute (:args x) param->value)]
          [(str query snippet) (concat params args)])
        [query params]))))

(defn substitute [parsed-query param->value]
  (reduce
   (partial substitute-one param->value)
   ["" []]
   parsed-query))
