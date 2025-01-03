(ns metabase.channel.template.handlebars-helper
  (:refer-clojure :exclude [hash])
  (:require
   [java-time.api :as t]
   [metabase.util.date-2 :as u.date]
   [metabase.util.urls :as urls])
  (:import
   (com.github.jknack.handlebars
    Options Handlebars Helper Handlebars$SafeString)))

(set! *warn-on-reflection* true)

(defn option-block-body
  "Get the block body."
  [^Options option]
  (.fn option))

(defn option-else-block
  "Get the else block."
  [^Options option]
  (.inverse option))

(defn safe-str
  "A wrapper of Handlebars.SafeString"
  [& text]
  (Handlebars$SafeString. (apply str text)))

(defmacro defhelper
  "Define a helper function.

  Helper is a function that takes 4 arguments: context, params, hash, and options.

  (defhelper format-name
    \"Format a name with title and uppercase options.\"
    [name _params {:keys [title uppercase] :or {title \"Mr.\"}} _options]
    (if uppercase
      (str title (u/upper-case-en name))
      (str title name)))"
  [helper-name description argvec & body]
  (let [helper-fn-name (symbol (str helper-name \*))
        description#   description]
    (assert (= 4 (count argvec)) "Helper function must have 4 arguments: context, params, hash, and options")
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
                         (~helper-fn-name context# (.params option#) (update-keys (.hash option#) keyword) option#)))))))

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

  {{if (equals product.name \"Hot Dog\")}}
    Hot Dog
  {{else}}
    Not Hot Dog
  {{/if}}"
  [x [y] _kparams _options]
  (= x y))

(defhelper format-date
  "Format date helper.

  {{format-date '2000-30-01''dd-MM-YY'}}
  ;; => 30-01-00

  date can be either a string or a date time object."
  [date [fmt] _kparams _options]
  (assert (string? fmt) "Format must be a string")
  (u.date/format fmt
                 (if (string? date)
                   (u.date/parse date)
                   date)))

(defhelper now
  "Get the current date and time. Returned object is a java.time.Instant"
  [_context _params _kparams _options]
  (t/instant))

;; Metabase specifics

(defhelper card-url
  "Return an appropriate URL for a `Card` with ID.

  {{card-url 10}}
  ;; => \"http://localhost:3000/question/10\""
  [id _params _kparams _options]
  (urls/card-url id))

(defhelper dashboard-url
  "Return an appropriate URL for a `Dashboard` with ID.

     {{dashboard-url 10}} -> \"http://localhost:3000/dashboard/10\""
  [id [parameters] _kparams _options]
  (urls/dashboard-url id (map #(update-keys % keyword) parameters)))

(def default-helpers
  "A list of default helpers."
  {"equals"        equals
   "format-date"   format-date
   "now"           now
   "card-url"      card-url
   "dashboard-url" dashboard-url})
