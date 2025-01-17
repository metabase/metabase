(ns metabase.channel.template.handlebars
  (:require
   [clojure.walk :as walk]
   [metabase.channel.template.handlebars-helper :as handlebars-helper]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.github.jknack.handlebars
    Handlebars Template)
   (com.github.jknack.handlebars.cache ConcurrentMapTemplateCache)
   (com.github.jknack.handlebars.io
    ClassPathTemplateLoader)))

(set! *warn-on-reflection* true)

(defn registry
  "Create a new Handlebars instance with a template loader."
  ^Handlebars [loader & {:keys [reload?]}]
  (u/prog1 (doto (Handlebars. loader)
             (.with (ConcurrentMapTemplateCache.)))
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
  (delay (u/prog1 (registry (classpath-loader "/" "") :reload? true)
           (handlebars-helper/register-helpers <> handlebars-helper/default-helpers))))

(when config/is-dev?
  (add-watch #'handlebars-helper/default-helpers :reload-default-helpers!
             (fn [_ _ _ new-default-helpers]
               (try
                 (log/debug "Reloading handlebars default helpers")
                 (handlebars-helper/register-helpers @default-hbs new-default-helpers)
                 (catch Exception e
                   (log/warn e "Error reloading default helpers"))))))

(defn render
  "Render a template with a context."
  ([template-name context]
   (render @default-hbs template-name context))
  ([^Handlebars req ^String template-name ctx]
   (let [template ^Template (.compile req template-name)]
     (.apply template (wrap-context ctx)))))

(defn render-string
  "Render a template string with a context."
  ([template context]
   (render-string @default-hbs template context))
  ([^Handlebars req ^String template ctx]
   (.apply ^Template (.compileInline req template)
           (wrap-context ctx))))

(comment
  (render-string "{{now}}" {})
  (render-string "{{format-date (now) \"YYYY-dd-MM\" }}" {})
  (render-string "{{format-date \"2000-01-02\" \"YYYY-dd-MM\" }}" {})
  (render-string "Hello {{name}}" {:name "Ngoc"})
  (render-string "Hello {{#unless hide_name}}{{name}}{{/unless}}" {:name "Ngoc" :hide_name false})
  (render "/metabase/channel/email/_header.hbs" {}))
