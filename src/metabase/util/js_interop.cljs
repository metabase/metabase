(ns metabase.util.js-interop
  "Shared utilities for CLJS<->JS interoperability.

  Provides functions to convert between:
  - CLJS keywords (`:kebab-case`) <-> JS strings (`\"camelCase\"`)
  - CLJS maps <-> JS objects
  - Nested CLJS data structures <-> JS objects/arrays (for display info)"
  (:require
   [clojure.string :as str]
   [goog.object :as gobject]
   [metabase.util :as u]
   [metabase.util.memoize :as memoize]
   [metabase.util.performance :as perf]))

(defn cljs-key->js-key
  "Converts idiomatic Clojure keys (`:kebab-case-keywords`) into idiomatic JavaScript keys (`\"camelCaseStrings\"`).

  Namespaces are preserved. A `?` suffix in Clojure is replaced with an `\"is\"` prefix in JavaScript, eg.
  `:many-pks?` becomes `isManyPks`."
  [cljs-key]
  (let [key-str (u/qualified-name cljs-key)
        key-str (if (str/ends-with? key-str "?")
                  (str "is-" (str/replace key-str #"\?$" ""))
                  key-str)]
    (u/->camelCaseEn key-str)))

(defn js-key->cljs-key
  "Converts idiomatic JavaScript keys (`\"camelCaseStrings\"`) into idiomatic Clojure keys (`:kebab-case-keywords`).

  A `\"is\"` prefix in JavaScript is replaced with a `?` suffix in Clojure, eg. `isManyPks` becomes `:many-pks?`."
  [js-key]
  (let [key-str (if (str/starts-with? js-key "is")
                  (str (subs js-key 2) "?")
                  js-key)]
    (-> key-str u/->kebab-case-en keyword)))

(defn js-obj->cljs-map
  "Converts a JavaScript object with `\"camelCase\"` keys into a Clojure map with `:kebab-case` keys."
  [an-object]
  (-> an-object js->clj (perf/update-keys js-key->cljs-key)))

(defn cljs-map->js-obj
  "Converts a Clojure map with `:kebab-case` keys into a JavaScript object with `\"camelCase\"` keys."
  [a-map]
  (-> a-map (perf/update-keys cljs-key->js-key) clj->js))

;; Forward declaration for recursive display-info->js
(declare display-info->js)

(defn- display-info-map->js*
  "Inner implementation of display-info-map->js without memoization."
  [x]
  (reduce (fn [obj [cljs-key cljs-val]]
            (let [js-key (cljs-key->js-key cljs-key)
                  js-val (display-info->js cljs-val)]
              (gobject/set obj js-key js-val)
              obj))
          #js {}
          x))

(def display-info-map->js
  "Converts a CLJS map to a JS object, recursively converting nested values.
  Memoized with LRU cache for performance."
  (memoize/lru display-info-map->js* :lru/threshold 256))

(defn- display-info-seq->js*
  "Inner implementation of display-info-seq->js without memoization."
  [x]
  (to-array (map display-info->js x)))

(def display-info-seq->js
  "Converts a CLJS sequence to a JS array, recursively converting elements.
  Memoized with LRU cache for performance."
  (memoize/lru display-info-seq->js* :lru/threshold 256))

(defn display-info->js
  "Converts CLJS display info results into JS objects for the FE to consume.
  Recursively converts CLJS maps and sequences into JS objects and arrays.

  Handles:
  - nil -> nil
  - maps -> JS objects (with key conversion)
  - strings -> strings (unchanged)
  - sequences -> JS arrays
  - keywords -> qualified name strings
  - other values -> unchanged"
  [x]
  (cond
    ;; `(seqable? nil) ; => true`, so we need to check for it before
    (nil? x)     nil
    ;; Note that map? is only true for CLJS maps, not JS objects.
    (map? x)     (display-info-map->js x)
    (string? x)  x
    ;; Likewise, JS arrays are not seqable? while CLJS vectors, seqs and sets are.
    ;; (So are maps and strings, but those are already handled above.)
    (seqable? x) (display-info-seq->js x)
    (keyword? x) (u/qualified-name x)
    :else        x))
