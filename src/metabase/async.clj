(ns metabase.async)

(def great-future (future nil))

(defn cancel-all-futures []
  (->> (all-ns)             ; seq of all loaded namespaces
       (mapcat ns-interns)  ; seq of *every* [symbol var]
       vals                 ; seq of *every* var
       (map var-get)        ; get values of each var
       (filter future?)
       (map future-cancel)  ; cancel all futures
       dorun))              ; force lazy eval without retaining head
