(ns macros.toucan2.tools.named-query
  (:require [macros.toucan2.common :as common]))

;;; separate function because recursive macroexpansion doesn't seem to work.
(defn- define-named-query*
  [query-name query-type model resolved-query]
  `(do
     ~query-name
     ~query-type
     ~model
     (fn [~(common/ignore-unused '&query-type)
          ~(common/ignore-unused '&model)
          ~(common/ignore-unused '&parsed-args)
          ~(common/ignore-unused '&unresolved-query)]
       ~resolved-query)))

(defmacro define-named-query
  ([query-name resolved-query]
   (define-named-query* query-name :default :default resolved-query))

  ([query-name query-type model resolved-query]
   (define-named-query* query-name query-type model resolved-query)))
