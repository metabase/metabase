(ns metabase.typed-schemas.api.javascript
  "JavaScript syntax rendering helpers for typed schemas."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(def ^:private js-identifier-pattern
  #"[A-Za-z_$][A-Za-z0-9_$]*")

(defn- spaces
  [indent]
  (apply str (repeat indent " ")))

(defn line-block
  "Returns `lines` joined as a JavaScript block followed by a blank line."
  [& lines]
  (str (str/join "\n" lines) "\n\n"))

(defn reference
  "Returns a marker rendered by [[render-value]] as a JavaScript reference instead of an object literal."
  [path]
  {:javascriptReference path})

(defn- entry-value
  [m k]
  (some (fn [[entry-key entry-value]]
          (when (= entry-key k)
            entry-value))
        m))

(defn reference?
  "Returns true when `value` is a marker created by [[reference]]."
  [value]
  (and (map? value)
       (string? (entry-value value :javascriptReference))))

(defn- javascript-key
  [k]
  (let [s (u/qualified-name k)]
    (if (re-matches js-identifier-pattern s)
      s
      (json/encode s))))

(defn- javascript-property-access
  [k]
  (let [s (u/qualified-name k)]
    (if (re-matches js-identifier-pattern s)
      (str "." s)
      (str "[" (json/encode s) "]"))))

(defn reference-path
  "Returns a JavaScript property path for `ks`."
  [& ks]
  (str (u/qualified-name (first ks))
       (apply str (map javascript-property-access (rest ks)))))

(defn- primitive-value?
  [value]
  (or (nil? value)
      (string? value)
      (number? value)
      (true? value)
      (false? value)))

(defn string-vector
  "Renders `values` as a JavaScript string array literal."
  [values]
  (str "[ " (str/join ", " (map json/encode values)) " ]"))

(declare render-value*)

(defn- render-node
  ([options indent path value]
   (let [{:keys [item-comments]} options
         comments (item-comments indent path value)
         prefix   (spaces indent)]
     (str (when (seq comments)
            (str (str/join "\n" comments) "\n"))
          prefix
          (render-value* value indent path options))))
  ([options indent path k value]
   (let [{:keys [entry-comments]} options
         comments (entry-comments indent path k value)
         prefix   (spaces indent)]
     (str (when (seq comments)
            (str (str/join "\n" comments) "\n"))
          prefix
          (javascript-key k)
          ": "
          (render-value* value indent (conj path k) options)))))

(defn- render-entry
  [options indent path k value]
  (render-node options indent path k value))

(defn- render-map
  [{:keys [map-keys] :as options} value indent path]
  (let [entries (->> (map-keys path value)
                     (map (fn [k] (render-entry options (+ indent 2) path k (get value k)))))]
    (if (seq entries)
      (str "{\n" (str/join ",\n" entries) "\n" (spaces indent) "}")
      "{ }")))

(defn- render-vector
  [options value indent path]
  (cond
    (empty? value)
    "[ ]"

    (every? primitive-value? value)
    (str "[ " (str/join ", " (map json/encode value)) " ]")

    :else
    (let [entries (map-indexed (fn [i item]
                                 (render-node options (+ indent 2) (conj path i) item))
                               value)]
      (str "[\n" (str/join ",\n" entries) "\n" (spaces indent) "]"))))

(defn- render-value*
  [value indent path options]
  (cond
    (reference? value) (entry-value value :javascriptReference)
    (map? value)       (render-map options value indent path)
    (vector? value)    (render-vector options value indent path)
    (seq? value)       (render-vector options (vec value) indent path)
    :else              (json/encode value)))

(defn render-value
  "Renders `value` as JavaScript syntax.

  Options:
  - `:path` is the current object path.
  - `:map-keys` returns the keys to render for a map at `[path value]`.
  - `:entry-comments` returns comment lines before a map entry.
  - `:item-comments` returns comment lines before a vector item."
  ([value]
   (render-value value {}))
  ([value {:keys [path map-keys entry-comments item-comments]
           :or   {path           []
                  map-keys       (fn [_path value] (keys value))
                  entry-comments (constantly nil)
                  item-comments  (constantly nil)}}]
   (render-value* value 0 path {:map-keys       map-keys
                                :entry-comments entry-comments
                                :item-comments  item-comments})))
