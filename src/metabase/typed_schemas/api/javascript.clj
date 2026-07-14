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
  "Returns a marker for a raw JavaScript expression.

  [[render-value]] normally renders maps as object literals. Some renderer code
  needs to splice an existing JavaScript expression into that object instead,
  such as `tables.orders.fields` or `pickFields(...)`."
  [path]
  {:javascriptReference path})

(defn- entry-value
  "Returns the requested entry without invoking map lookup.

  Some rendered schemas can contain sorted maps with string keys; direct keyword
  lookup can make those maps compare keywords to strings and throw."
  [entries-map entry-key-to-find]
  (some (fn [[entry-key entry-value]]
          (when (= entry-key entry-key-to-find)
            entry-value))
        entries-map))

(defn reference?
  "Returns true when `value` is a raw JavaScript expression marker created by [[reference]]."
  [value]
  (and (map? value)
       (string? (entry-value value :javascriptReference))))

(defn- javascript-key
  "Renders a value as a JavaScript object key.

  Valid identifiers render bare e.g. orders; everything else renders as a quoted
  property name e.g. \"orders-by-month\"."
  [entry-key]
  (let [key-name (u/qualified-name entry-key)]
    (if (re-matches js-identifier-pattern key-name)
      key-name
      (json/encode key-name))))

(defn- javascript-property-access
  "Renders property access for a JavaScript reference path segment."
  [path-segment]
  (let [segment-name (u/qualified-name path-segment)]
    (if (re-matches js-identifier-pattern segment-name)
      (str "." segment-name)
      (str "[" (json/encode segment-name) "]"))))

(defn reference-path
  "Returns a JavaScript property path for `path-segments`."
  [& path-segments]
  (str (u/qualified-name (first path-segments))
       (apply str (map javascript-property-access (rest path-segments)))))

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
  "Renders one nested value with its optional leading comments and object key.

  The four-argument arity is for vector items, which have comments but no key.
  The five-argument arity is for map entries, which render `key: value`."
  ([options indent path value]
   (let [{:keys [item-comments]} options
         comments (item-comments indent path value)
         prefix   (spaces indent)]
     (str (when (seq comments)
            (str (str/join "\n" comments) "\n"))
          prefix
          (render-value* value indent path options))))
  ([options indent path entry-key value]
   (let [{:keys [entry-comments]} options
         comments (entry-comments indent path entry-key value)
         prefix   (spaces indent)]
     (str (when (seq comments)
            (str (str/join "\n" comments) "\n"))
          prefix
          (javascript-key entry-key)
          ": "
          (render-value* value indent (conj path entry-key) options)))))

(defn- render-entry
  [options indent path entry-key value]
  (render-node options indent path entry-key value))

(defn- render-map
  "Renders a map as a JavaScript object literal.

  `:map-keys` controls both key ordering and which keys are emitted."
  [{:keys [map-keys] :as options} value indent path]
  (let [entries (->> (map-keys path value)
                     (map (fn [entry-key]
                            (render-entry options (+ indent 2) path entry-key (get value entry-key)))))]
    (if (seq entries)
      (str "{\n" (str/join ",\n" entries) "\n" (spaces indent) "}")
      "{ }")))

(defn- render-vector
  "Renders a vector as a compact array for primitive values, or multiline array otherwise."
  [options value indent path]
  (cond
    (empty? value)
    "[ ]"

    (every? primitive-value? value)
    (str "[ " (str/join ", " (map json/encode value)) " ]")

    :else
    (let [entries (map-indexed (fn [index item]
                                 (render-node options (+ indent 2) (conj path index) item))
                               value)]
      (str "[\n" (str/join ",\n" entries) "\n" (spaces indent) "]"))))

(defn- render-value*
  "Recursive implementation for [[render-value]].

  `path` tracks where the value lives so callers can choose keys and comments
  based on surrounding schema context."
  [value indent path options]
  (cond
    (reference? value) (entry-value value :javascriptReference)
    (map? value)       (render-map options value indent path)
    (vector? value)    (render-vector options value indent path)
    (seq? value)       (render-vector options (vec value) indent path)
    :else              (json/encode value)))

(defn render-value
  "Renders `value` into JavaScript syntax.

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
