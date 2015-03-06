(ns metabase.async)

(defn cancel-all-futures []
  (->> (all-ns)                     ; seq of all loaded namespaces
       (mapcat ns-interns)          ; seq of *every* [symbol var]
       vals                         ; seq of *every* var
       (keep (fn [v]
               (let [v (var-get v)] ; get value of var
                 (when (future? v)  ; filter out ones that aren't futures
                   v))))
       (map future-cancel)          ; cancel all futures
       dorun))                      ; force lazy eval without retaining head
