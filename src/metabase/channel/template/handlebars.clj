(ns metabase.channel.template.handlebars
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.channel.template.handlebars-helper :as handlebars-helper]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.github.jknack.handlebars
    Handlebars Template Context)
   (com.github.jknack.handlebars.cache ConcurrentMapTemplateCache)
   (com.github.jknack.handlebars.context MapValueResolver)
   (com.github.jknack.handlebars.io
    ClassPathTemplateLoader CompositeTemplateLoader TemplateLoader)))

(set! *warn-on-reflection* true)

(defn registry
  "Create a new Handlebars instance with a template loader."
  ^Handlebars [loader & {:keys [reload?]}]
  (u/prog1 (doto (Handlebars. loader)
             (.with (ConcurrentMapTemplateCache.)))
    (when reload?
      (.setReload (.getCache <>) true))))

(def ^:private template-dirs
  "Classpath dirs holding `.hbs` templates. A bare template name resolves
  against these dirs in order."
  ["/metabase/channel/email/"
   "/notification/channel_template/"])

(defn classpath-loader
  "Create a `ClassPathTemplateLoader` with a prefix and suffix."
  ^TemplateLoader [prefix suffix]
  (ClassPathTemplateLoader. prefix suffix))

(defn default-loader
  "A `CompositeTemplateLoader` over [[template-dirs]]: on a name it tries each
  dir's loader in order and returns the first hit, throwing if all miss."
  ^TemplateLoader []
  (CompositeTemplateLoader.
   (into-array TemplateLoader (map #(classpath-loader % ".hbs") template-dirs))))

(defn- wrap-context
  [context]
  (walk/postwalk
   #(if (keyword? %)
      (u/qualified-name %)
      %) context))

(defn- build-context
  [context]
  (-> context
      wrap-context
      (Context/newBuilder)
      (.resolver (into-array [(MapValueResolver/INSTANCE)]))
      (.build)))

(def ^:private default-hbs
  (delay (u/prog1 (registry (default-loader) :reload? true)
           (handlebars-helper/register-helpers <> handlebars-helper/default-helpers))))

(when config/is-dev?
  (add-watch #'handlebars-helper/default-helpers :reload-default-helpers!
             (fn [_ _ _ new-default-helpers]
               (try
                 (log/debug "Reloading handlebars default helpers")
                 (handlebars-helper/register-helpers @default-hbs new-default-helpers)
                 (catch Exception e
                   (log/warn e "Error reloading default helpers"))))))

(defn valid-template-name?
  "True iff `template-name` is a well-formed relative template name: non-blank,
  no leading `/`, no `..`, and no `.hbs` suffix (the loader appends it)."
  [^String template-name]
  (boolean
   (and (not (str/blank? template-name))
        (not (str/starts-with? template-name "/"))
        (not (str/includes? template-name ".."))
        (not (str/ends-with? template-name ".hbs")))))

(defn- validate-template-name!
  "Validate that a template name is well-formed, throw if not."
  [^String template-name]
  (when-not (valid-template-name? template-name)
    (throw (ex-info "invalid template name" {:template-name template-name}))))

(defn render
  "Render a template with a context."
  ([template-name context]
   (render @default-hbs template-name context))
  ([^Handlebars req ^String template-name ctx]
   (validate-template-name! template-name)
   (let [template ^Template (.compile req template-name)]
     (.apply template (build-context ctx)))))

(defn render-string
  "Render a template string with a context."
  ([template context]
   (render-string @default-hbs template context))
  ([^Handlebars req ^String template ctx]
   (.apply ^Template (.compileInline req template)
           (build-context ctx))))

(comment
  (render-string "{{now}}" {})
  (render-string "{{format-date (now) \"YYYY-dd-MM\" }}" {})
  (render-string "{{format-date \"2000-01-02\" \"YYYY-dd-MM\" }}" {})
  (render-string "Hello {{name}}" {:name "Ngoc"})
  (render-string "Hello {{#unless hide_name}}{{name}}{{/unless}}" {:name "Ngoc" :hide_name false})
  (render "_header" {}))
