(ns metabase.util.malli.defn
  (:refer-clojure :exclude [defn])
  (:require
   [malli.core :as mc]
   [malli.destructure]
   [malli.experimental :as mx]
   [metabase.util.malli.fn :as mu.fn]
   [net.cgrand.macrovich :as macros]))

;;; TODO -- this should generate type hints from the schemas and from the return type as well.
(defn- deparameterized-arglist [{:keys [args]}]
  (:arglist (malli.destructure/parse args)))

(defn- deparameterized-arglists [{:keys [arities], :as _parsed}]
  (let [[arities-type arities-value] arities]
    (case arities-type
      :single   (list (deparameterized-arglist arities-value))
      :multiple (map deparameterized-arglist (:arities arities-value)))))

(defmacro defn [& [fn-name :as fn-tail]]
  (let [parsed (mc/parse mx/SchematizedParams fn-tail)]
    (when (= ::mc/invalid parsed)
      (mc/-fail! ::parse-error {:schema mx/SchematizedParams, :args fn-tail}))
    (let [{attr-map :meta, docstring :doc} parsed
          attr-map                         (merge
                                            {:arglists (list 'quote (deparameterized-arglists parsed))}
                                            attr-map)]
      `(def ~(vary-meta fn-name merge attr-map)
         ~@(when docstring
             [docstring])
         ~(macros/case
            :clj  (mu.fn/instrumented-fn-form fn-tail)
            :cljs (mu.fn/deparameterized-fn-form fn-tail))))))

(defn ^:amazing x :- :int
  "Dox"
  {:wow true}
  ([y]
   y)
  ([y :- :int z]
   (+ y z)))
