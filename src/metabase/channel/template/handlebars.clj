(ns metabase.channel.template.handlebars
  (:require
   [clojure.walk :as walk]
   [metabase.util :as u])
  (:import
   (java.io IOException)
   (com.github.jknack.handlebars
    Handlebars Helper Template)
   (com.github.jknack.handlebars.io
    TemplateLoader ClassPathTemplateLoader CompositeTemplateLoader TemplateSource)
   (com.github.jknack.handlebars.cache
    ConcurrentMapTemplateCache)))

(deftype AppDBTemplateSource [^String name ^String the-content last-modified]
  TemplateSource
  (content [_ _] the-content)
  (filename [_] name)
  (lastModified [_] last-modified))

(deftype AppDBLoader []
  TemplateLoader
  (sourceAt [_this _template-name]
    (throw (IOException. "Not implemented"))
    #_(AppDBTemplateSource. template-name "hello {{name}}" (System/currentTimeMillis))
    nil))

(defn- composite-loaders [& loaders]
  (CompositeTemplateLoader. (into-array TemplateLoader loaders)))

(def ^:private handlebars
  (doto (Handlebars. (composite-loaders (AppDBLoader.) (ClassPathTemplateLoader. "/" ".mustache")))
    (.with (ConcurrentMapTemplateCache.))))

(defn- wrap-context
  [context]
  (walk/postwalk
   #(cond
     (map? %) (java.util.HashMap. ^java.util.Map %)
     (keyword? %) (u/qualified-name %)
     :else %) context))

(defn render
  ([template-name context]
   (render handlebars template-name context))
  ([req template-name ctx]
   (let [template ^Template (.compile ^Handlebars req template-name)]
     (.apply template (wrap-context ctx)))))

(defn render-string
  ([template context]
   (render-string handlebars template context))
  ([req template ctx]
   (.apply ^Template (.compileInline ^Handlebars req template)
           (wrap-context ctx))))

(comment
  (render-string "Hello {{name}}" {:name "Ngoc"})
  (render "/metabase/email/_header" {:name "Ngoc"}))

(defmacro defhelper
  [name argvec & body]
  (let [argvec (into [] (concat [(gensym)] argvec))]
    `(def ~name (reify Helper (apply ~argvec ~@body)))))

