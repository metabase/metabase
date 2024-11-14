(ns metabase.channel.template.handlebars.cache
  (:require
   [metabase.util.log :as log])
  (:import
   (com.github.jknack.handlebars
    Parser Template)
   (com.github.jknack.handlebars.cache TemplateCache)
   (com.github.jknack.handlebars.io
    TemplateSource)))

;; This is a similar implementation of com.github.jknack.handlebars.cache.ConcurrentMapTemplateCache but with Atom.
;; It fixes a bug where the cache is not reloaded if you use the source only once.
(deftype AtomTemplateCache [cache ^:volatile-mutable reload]
  TemplateCache
  (^void clear [_]
    (reset! cache {})
    nil)
  (^void evict [_ ^TemplateSource source]
    (swap! cache dissoc source)
    nil)
  (^Template get [^TemplateCache this ^TemplateSource source ^Parser parser]
    (let [[cached-source cached-template :as entry] (get @cache source)]
      (cond
        (nil? entry)
        (let [template (.parse parser source)]
          ;; this is the fix for the pre-mentioned bug
          ;; try uncomment this and run the metabase.channel.template.handlebars-test/reload-template-if-it's-changed test
          ;; TODO: fix this upstream for the original ConcurrentMapTemplateCache
          (.lastModified source)
          (log/debugf "Caching template %s" source)
          (swap! cache assoc source [source template])
          template)

        (and reload (not= (.lastModified source) (.lastModified ^TemplateSource cached-source)))
        (do
          (log/debugf "Reloading template %s" source)
          (.evict this source)
          (let [template (.parse parser source)]
            (swap! cache assoc source [source template])
            template))
        :else
        (do
          (log/debugf "Using cached template %s" source)
          cached-template))))

  (setReload [this value]
    (set! reload value)
    this))

(defn make-atom-template-cache
  "Create a new AtomTemplateCache instance."
  [reload?]
  (AtomTemplateCache. (atom {}) reload?))
