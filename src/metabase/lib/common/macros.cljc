(ns metabase.lib.common.macros
  "Lightweight sibling of [[metabase.lib.common]] that holds the `defop`
  macro. Kept on its own so shadow-cljs does not have to load
  `metabase.lib.common.cljc` (which transitively pulls `metabase.lib.options`,
  `metabase.lib.ref`, `metabase.lib.schema.common`, and friends) just to
  expand a 15-line macro on CLJS callers."
  #?@(:cljs ((:require
              [metabase.lib.common])
             (:require-macros
              [metabase.lib.common.macros])))
  #?@(:clj ((:refer-clojure :exclude [every?])
            (:require
             [metabase.util.malli.defn]
             [metabase.util.performance :refer [every?]]
             [net.cgrand.macrovich :as macros]))))

#?(:clj
   (defmacro defop
     "Defines a clause creating function with the given args.
  Calling the clause without query and stage produces a fn that can be resolved later."
     [op-name & argvecs]
     {:pre [(symbol? op-name)
            (every? vector? argvecs) (every? #(every? symbol? %) argvecs)
            (every? #(not-any? #{'query 'stage-number} %) argvecs)]}
     `(metabase.util.malli.defn/defn ~op-name :- ~(keyword "mbql.clause" (name op-name))
        ~(format "Create a standalone clause of type `%s`." (name op-name))
        ~@(for [argvec argvecs
                :let [arglist-expr (if (contains? (set argvec) '&)
                                     (cons `list* (remove #{'&} argvec))
                                     argvec)]]
            `([~@argvec]
              ~(macros/case
                 :clj  `((requiring-resolve 'metabase.lib.common/defop-create) ~(keyword op-name) ~arglist-expr)
                 :cljs `(metabase.lib.common/defop-create ~(keyword op-name) ~arglist-expr)))))))
