(ns metabase.channel.template.handlebars
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u])
  (:import
   (com.github.jknack.handlebars
    Handlebars Template)
   (com.github.jknack.handlebars.cache
    ConcurrentMapTemplateCache)
   (com.github.jknack.handlebars.io
    ClassPathTemplateLoader)))

(set! *warn-on-reflection* true)

(defn registry
  "Create a new Handlebars instance with a template loader."
  ^Handlebars [loader]
  (doto (Handlebars. loader)
    (.with (ConcurrentMapTemplateCache.))))

(defn classpath-loader
  "Create a ClassPathTemplateLoader with a prefix and postfix."
  [prefix postfix]
  (ClassPathTemplateLoader. prefix postfix))

(def ^:private default-hbs
  (registry (classpath-loader "/" "")))

(defn- wrap-context
  [context]
  (walk/postwalk
   #(if (keyword? %)
      (u/qualified-name %)
      %) context))

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
