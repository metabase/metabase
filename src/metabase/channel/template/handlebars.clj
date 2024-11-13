(ns metabase.channel.template.handlebars
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.github.jknack.handlebars
    Parser Handlebars Template)
   (com.github.jknack.handlebars.io
    TemplateSource
    ClassPathTemplateLoader)
   (com.github.jknack.handlebars.cache TemplateCache)))

(set! *warn-on-reflection* true)

;; This is a similar implementation of com.github.jknack.handlebars.cache.ConcurrentMapTemplateCache but with Atom.
;; It fixes a bug where the cache is not reloaded if you use the source only once.
(deftype AtomTemplateCache
  [cache ^:volatile-mutable reload]
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

(defn- make-atom-template-cache
  [reload?]
  (AtomTemplateCache. (atom {}) reload?))

(defn registry
  "Create a new Handlebars instance with a template loader."
  ^Handlebars [loader & {:keys [reload?]}]
  (u/prog1 (doto (Handlebars. loader)
             (.with (make-atom-template-cache false)))
    (when reload?
      (.setReload (.getCache <>) true))))

(defn classpath-loader
  "Create a ClassPathTemplateLoader with a prefix and postfix."
  [prefix postfix]
  (ClassPathTemplateLoader. prefix postfix))

(defn- wrap-context
  [context]
  (walk/postwalk
   #(if (keyword? %)
      (u/qualified-name %)
      %) context))

(def ^:private default-hbs
  (registry (classpath-loader "/" "") :reload? true))

(defn render
  "Render a template with a context."
  ([template-name context]
   (render default-hbs template-name context))
  ([^Handlebars req ^String template-name ctx]
   (let [template ^Template (.compile req template-name)]
     (.apply template (wrap-context ctx)))))

(defn render-string
  "Render a template string with a context."
  ([template context]
   (render-string default-hbs template context))
  ([^Handlebars req ^String template ctx]
   (.apply ^Template (.compileInline req template)
           (wrap-context ctx))))

(comment
  (render-string "Hello {{name}}" {:name "Ngoc"})
  (render-string "Hello {{#unless hide_name}}{{name}}{{/unless}}" {:name "Ngoc" :hide_name false})
  (render "/metabase/email/_header.hbs" {}))
