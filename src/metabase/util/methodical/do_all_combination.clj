(ns metabase.util.methodical.do-all-combination
  "A Methodical method combination like [[methodical.core/do-method-combination]] that runs every primary method, also
  when one of them throws."
  (:require
   [methodical.impl.combo.operator :as combo.operator]))

(set! *warn-on-reflection* true)

(combo.operator/defoperator ::do-all [methods invoke]
  (let [errors (into [] (keep (fn [method]
                                (try
                                  (invoke method)
                                  nil
                                  (catch Throwable e
                                    e))))
                     methods)]
    (when-let [[^Throwable e & more] (seq errors)]
      (doseq [^Throwable other more
              :when (not (identical? e other))]
        (.addSuppressed e other))
      (throw e))))

(defn do-all-method-combination
  "A method combination that calls every primary method and returns nil. If methods throw, it throws the first error
  after all methods ran, with the other errors added as suppressed. Supports `:around` methods; primary methods cannot
  call `next-method`."
  []
  (combo.operator/operator-method-combination ::do-all))
