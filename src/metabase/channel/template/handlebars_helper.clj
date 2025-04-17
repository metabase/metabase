(ns metabase.channel.template.handlebars-helper
  (:refer-clojure :exclude [count])
  (:require
   [java-time.api :as t]
   [metabase.models.setting :as setting]
   [metabase.util.date-2 :as u.date]
   [metabase.util.urls :as urls])
  (:import
   (com.github.jknack.handlebars
    Options Handlebars Helper)))

(set! *warn-on-reflection* true)

(defn option-block-body
  "Get the block body."
  [^Options option]
  (.fn option))

(defn option-else-block
  "Get the else block."
  [^Options option]
  (.inverse option))

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
    (assert (= 4 (clojure.core/count argvec)) "Helper function must have 4 arguments: context, params, hash, and options")
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
  (doseq [[name helper] (update-vals helpers var-get)]
    (register-helper hbs name helper)))

;;---------------- Predefined helpers ----------------;;

;; Generics

(defhelper count
  "Counts the number of items in a collection.

   Example:
   ```
   {{count items}}
   ```

   Arguments:
   - collection: The collection to count items in"
  [collection _params _kparams _options]
  (clojure.core/count collection))

(defhelper eq
  "Checks if two values are equal.

   Example:
   ```
   {{#if (eq product.name \"Hot Dog\")}}
     Hot Dog
   {{else}}
     Not Hot Dog
   {{/if}}
   ```

   Arguments:
   - x: First value to compare
   - y: Second value to compare"
  [x [y] _kparams _options]
  (= x y))

(defhelper format-date
  "Formats a date according to specified pattern.

   Example:
   ```
   {{format-date '2000-01-30' 'dd-MM-YY'}}
   ;; => 30-01-00
   ```

   Arguments:
   - date: Date string or date object to format
   - fmt: String format pattern"
  [date [fmt] _kparams _options]
  (assert (string? fmt) "Format must be a string")
  (u.date/format fmt
                 (if (string? date)
                   (u.date/parse date)
                   date)))

(defhelper now
  "Returns the current date and time as java.time.Instant.

   Example:
   ```
   {{format-date (now) 'yyyy-MM-dd'}}
   ;; => 2025-04-17
   ```

   Arguments:
   - None"
  [_context _params _kparams _options]
  (t/instant))

;; Metabase specifics

(defhelper card-url
  "Generates a URL for a Card with the given ID.

   Example:
   ```
   {{card-url 10}}
   ;; => \"https://metabase.com/question/10\"
   ```

   Arguments:
   - id: The ID of the card"
  [id _params _kparams _options]
  (urls/card-url id))

(defhelper trash-url
  "Generates the URL for the trash page.

   Example:
   ```
   {{trash-url}}
   ;; => \"https://metabase.com/admin/trash\"
   ```

   Arguments:
   - None"
  [_ _params _kparams _options]
  (urls/trash-url))

(defhelper dashboard-url
  "Generates a URL for a Dashboard with the given ID.

   Example:
   ```
   {{dashboard-url 10}}
   ;; => \"https://metabase.com/dashboard/10\"
   ```

   Arguments:
   - id: The ID of the dashboard
   - parameters: Optional parameters to include in the URL"
  [id [parameters] _kparams _options]
  (urls/dashboard-url id (map #(update-keys % keyword) parameters)))

(def default-helpers
  "A list of default helpers."
  {"count"         #'count
   "eq"            #'eq
   "format-date"   #'format-date
   "now"           #'now
   "card-url"      #'card-url
   "dashboard-url" #'dashboard-url})

(def ^:private built-in-helpers-info
  (map
   #(assoc % :type :built-in)
   [{:name "if"
     :doc  "Conditionally renders a block based on the truthiness of a value.

   Example:
   ```
   {{#if author}}
     <h1>{{firstName}} {{lastName}}</h1>
   {{else}}
     <h1>Unknown Author</h1>
   {{/if}}
   ```

   Arguments:
   - value: The value to test for truthiness
   - options: Hash options including 'includeZero' to treat 0 as truthy"}
    {:name "unless"
     :doc  "Conditionally renders a block if the value is falsy.

   Example:
   ```
   {{#unless license}}
     <p>WARNING: This entry has no license!</p>
   {{/unless}}
   ```

   Arguments:
   - value: The value to test for falsiness"}
    {:name "each"
     :doc  "Iterates over a collection and renders a block for each item.

   Example:
   ```
   {{#each people}}
     <li>{{this}}</li>
   {{else}}
     <li>No people to display</li>
   {{/each}}
   ```

   Special variables:
   - @index: Current loop index for arrays
   - @key: Current key name for objects
   - @first: True on first iteration
   - @last: True on last iteration"}
    {:name "with"
     :doc  "Changes the evaluation context for a block.

   Example:
   ```
   {{#with person}}
     {{firstName}} {{lastName}}
   {{else}}
     No person found
   {{/with}}
   ```

   Arguments:
   - context: The new context to use
   - blockParam: Optional block parameter name to define reference"}
    {:name "lookup"
     :doc  "Looks up a value in an object or array using dynamic parameter resolution.

   Example:
   ```
   {{lookup person age}}
   ```

   Arguments:
   - object: The object or array to perform lookup on
   - key: The property or index to look up"}
    {:name "log"
     :doc  "Logs a value to the console for debugging.

   Example:
   ```
   {{log \"Current value:\" this}}
   ```

   Arguments:
   - values: Any number of values to log
   - level: Optional hash param for log level (debug, info, warn, error)"}]))

(defn- helpers-info
  "Get a list of helpers with their names and docstrings."
  [helper-name->helper]
  (concat
   built-in-helpers-info
   (for [[helper-name helper] helper-name->helper]
     {:name helper-name
      :doc  (-> helper meta :doc)
      :type :custom})))

;; Exposing this via settings so FE can find it
;; TODO: the better way is to follow metabase.lib's steps by writing this as cljc so FE can access it directly.
(setting/defsetting default-handlebars-helpers
  "A list of default handlebars helpers."
  :type        :json
  :encryption  :no
  :export?     false
  :getter      (fn [] (helpers-info default-helpers))
  :setter      :none
  :visibility  :public
  :description "A list of default handlebars helpers.")
