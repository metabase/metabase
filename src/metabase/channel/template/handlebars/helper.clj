(ns metabase.channel.template.handlebars.helper
  (:refer-clojure :exclude [hash])
  (:require
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log])
  (:import
   (com.github.jknack.handlebars
    Options Parser Handlebars Helper Template Handlebars$SafeString)
   (com.github.jknack.handlebars.cache TemplateCache)
   (com.github.jknack.handlebars.io
    TemplateSource
    ClassPathTemplateLoader)))

(set! *warn-on-reflection* true)

(defn option-param
  "Get a parameter from the options by index."
  ([^Options option idx]
   (.param option idx))
  ([^Options option idx default]
   (.param option idx default)))

(defn option-hash
  "Get a parameter from the options by key."
  ([^Options option key]
   (.hash option key))
  ([^Options option key default]
   (.hash option key default)))

(defn option-block-body
  "Get the body"
  ([^Options option]
   (.fn option)))

(defn option-else-block
  "Get the else block."
  [^Options option]
  (.inverse option))

(defn safe-str
  "A wrapper of Handlebars.SafeString"
  [& text]
  (Handlebars$SafeString. (apply str text)))

(defmacro defhelper
  "Define a helper function."
  [helper-name description argvec & body]
  (let [helper-fn-name (symbol (str helper-name \!))]
    `(do
       (defn ~helper-fn-name
         ~description
         ~argvec
         ~@body)
       (def ~(vary-meta helper-name
                        merge
                        {:doc        description
                         :is-helper? true})
         ~description
         (reify Helper (apply [_# context# option#]
                         (let [f# ~helper-fn-name]
                          (f# context# option#))))))))

#-(var-get #'format-date!)

(defn register-helper
  "Register a helper."
  [^Handlebars hbs ^String name ^Helper helper]
  (.registerHelper hbs name helper))

(defn register-helpers
  "Register a list of helpers."
  [^Handlebars hbs helpers]
  (doseq [[name helper] helpers]
    (register-helper hbs name helper)))

;;---------------- Predefined helpers ----------------;;

(defhelper ifequals
  "If equals helper.

  {{#ifequals name \"hotdog\"}}
  Hotdog
  {{else}}
  Not a hotdog
  {{/ifequals}}"
  [arg options]
  (let [x arg
        y (option-param options 0)]
    (if (= x y)
      (option-block-body options)
      (option-else-block options))))

(defhelper format-date
  "Format date helper.

  {{format-date date 'YYYY-MM-dd}}"
  [date options]
  (let [fmt (option-param fmt 0)]
    (u.date/format fmt
                   (if (string? date)
                     (u.date/parse date)
                     date))))

(defhelper offset-date-time
  "Get the current offset date time with a custom format"
  [fmt _options]
  (let [now (t/offset-date-time)]
    (cond->> now
      (string? fmt)
      (u.date/format fmt))))

(def default-helpers
  "A list of default helpers."
  [["ifequals"         ifequals]
   ["format-date"      format-date]
   ["offset-date-time" offset-date-time]])
