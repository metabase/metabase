(ns sci.core)

(defmacro copy-ns
  ([ns-sym sci-ns]
   `(copy-ns ~ns-sym ~sci-ns nil))
  ([ns-sym sci-ns opts]
   `[(quote ~ns-sym)
     ~sci-ns
     (quote ~opts)]))
