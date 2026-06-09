(ns metabase.lib.metadata.cache.macros
  "Lightweight sibling of [[metabase.lib.metadata.cache]] that holds the
  `with-cached-value` macro. Kept on its own so shadow-cljs does not have to
  load `metabase.lib.metadata.cache.cljc` (which transitively pulls
  `metabase.lib.util` → `metabase.lib.schema` → the whole `lib.schema.*`
  graph, ~500 ms) just to expand a one-line macro on CLJS callers."
  #?@(:cljs ((:require
              [metabase.lib.metadata.cache])
             (:require-macros
              [metabase.lib.metadata.cache.macros])))
  #?@(:clj ((:require
             [net.cgrand.macrovich :as macros]))))

#?(:clj
   (defmacro with-cached-value
     "Return the cached value for [[metabase.lib.metadata.cache/cache-key]] `k` if
  one already exists in the CachedMetadataProvider's general cache; otherwise
  calculate the value by executing `body`, save it to the cache, then return
  it."
     {:style/indent 2}
     [metadata-providerable k & body]
     (macros/case
       :clj  `((requiring-resolve 'metabase.lib.metadata.cache/do-with-cached-value)
               ~metadata-providerable ~k (fn [] ~@body))
       :cljs `(metabase.lib.metadata.cache/do-with-cached-value
               ~metadata-providerable ~k (fn [] ~@body)))))
