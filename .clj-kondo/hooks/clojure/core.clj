(ns hooks.clojure.core
  (:refer-clojure :exclude [def defn defmacro])
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.common.parallel]))

(clojure.core/defn def-check-thread-safety
  [{{[_defn fn-symb & fn-tail] :children, :as _defn-node} :node, current-ns :ns}]
  (let [warned? (atom false)]
    (when-not (or (str/ends-with? fn-symb "!")
                  (str/ends-with? fn-symb "!*"))
      ;; we don't need to warn about the stuff that's already listed in the list of unsafe symbols
      (when-not (contains? hooks.common.parallel/thread-unsafe-forms
                           (symbol (name current-ns) (name (hooks/sexpr fn-symb))))
        (letfn [(error [symbol-node qualified-symbol]
                  (when-not (contains? (:metabase/ignored (meta symbol-node))
                                       :metabase/check-for-missing-exclamation-points)
                    ;; only warn once per `defn`/etc. so we don't blast people's eyes out with warnings
                    (when-not @warned?
                      (reset! warned? true)
                      #_{:clj-kondo/ignore [:metabase/check-for-missing-exclamation-points]}
                      (hooks/reg-finding! (assoc (meta symbol-node)
                                                 :message (format "[:metabase/check-for-missing-exclamation-points] Thread-unsafe %s is not allowed in a function or macro that does not end in !"
                                                                  qualified-symbol)
                                                 :type :metabase/check-for-missing-exclamation-points)))))]
          (doseq [node fn-tail]
            (hooks.common.parallel/find-thread-unsafe-symbols node error)))))))

(clojure.core/defn defn [node]
  (def-check-thread-safety node)
  node)

(clojure.core/defn defmacro [node]
  (def-check-thread-safety node)
  node)

(clojure.core/defn def [node]
  (def-check-thread-safety node)
  node)

;; TODO
;;
;; - defmacro
;; - let + fn
;;
;; - mu/defn
;; - s/defn
;;
;; - s/defmethod ?
;; - defmethod ?
;; - mu/defmethod ?
;;
;; - extend-protocol and the like?
