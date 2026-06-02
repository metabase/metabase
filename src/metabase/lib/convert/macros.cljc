(ns metabase.lib.convert.macros
  "Lightweight sibling of [[metabase.lib.convert]] holding just the
  `with-aggregation-list` macro. Kept on its own so shadow-cljs does not
  have to load `metabase.lib.convert.cljc` (and its
  `metabase.legacy-mbql.normalize` + `metabase.legacy-mbql.schema` + whole
  `metabase.lib.schema.*` dependency graph, ~700 ms) just to expand a
  one-line macro on CLJS callers."
  #?@(:cljs ((:require
              [metabase.lib.convert])
             (:require-macros
              [metabase.lib.convert.macros])))
  #?@(:clj ((:require
             [net.cgrand.macrovich :as macros]))))

#?(:clj
   (defmacro with-aggregation-list
     "Macro for capturing the context of a query stage's `:aggregation` list, so any legacy `[:aggregation 0]` indexed
  refs can be converted correctly to UUID-based MBQL 5 refs."
     [aggregations & body]
     (macros/case
       :clj  `((requiring-resolve 'metabase.lib.convert/do-with-aggregation-list)
               ~aggregations (fn [] ~@body))
       :cljs `(metabase.lib.convert/do-with-aggregation-list ~aggregations (fn [] ~@body)))))
