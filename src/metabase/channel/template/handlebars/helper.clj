(ns metabase.channel.template.handlebars.helper
  (:refer-clojure :exclude [hash])
  (:require
   [clojure.walk :as walk]
   [java-time.api :as t]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.urls :as urls]
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
  (let [helper-fn-name (symbol (str helper-name \!))
        description#   description]
    `(do
       (defn ~helper-fn-name
         ~description#
         ~argvec
         ~@body)
       (def ~(vary-meta helper-name
                        merge
                        {:doc        description
                         :is-helper? true})
         ~description#
         (reify Helper (apply [_# context# option#]
                         (let [f# ~helper-fn-name]
                          (f# context# option#))))))))

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

;; Generics
(defhelper equals
  "Return true if two values are equal.

  {{equals 1 1}}"
  [arg options]
  (let [x arg
        y (option-param options 0)]
    #p [x y]
    (= x y)))

(defhelper format-date
  "Format date helper.

  {{format-date '2000-30-01 'dd-MM-YY'}}
  ;; => 30-01-00

  date can be either a string or a date time object."
  [date options]
  (let [fmt (option-param options 0)]
    (u.date/format fmt
                   (if (string? date)
                     (u.date/parse date)
                     date))))

(defhelper now
  "Get the current date and time. Returned object is a java.time.Instant"
  [_arg _options]
  (t/instant))

;; Metabase specifics

(defhelper card-url
  "Return an appropriate URL for a `Card` with ID.

     {{card-url 10}} -> \"http://localhost:3000/question/10\""
  [id _options]
  (urls/card-url id))

(defhelper dashboard-url
  "Return an appropriate URL for a `Dashboard` with ID.

     {{dashboard-url 10}} -> \"http://localhost:3000/dashboard/10\""
  [id options]
  (let [params (option-param options 0 nil)]
   (urls/dashboard-url id params)))

(def default-helpers
  "A list of default helpers."
  [["equals"      equals]
   ["format-date" format-date]
   ["now"         now]])
