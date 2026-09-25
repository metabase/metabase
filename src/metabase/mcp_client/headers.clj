(ns metabase.mcp-client.headers
  "The MCP-specific HTTP headers of the Streamable HTTP transport, protocol version 2026-07-28: `Mcp-Name`,
  and `Mcp-Param-*` headers mirrored from tool arguments the server marked with `x-mcp-header`. Pure functions."
  (:require
   [clojure.string :as str]
   [metabase.util :as u])
  (:import
   (java.nio.charset StandardCharsets)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(def ^:private sentinel-prefix "=?base64?")
(def ^:private sentinel-suffix "?=")

(defn header-safe?
  "Whether `s` may be sent as an HTTP header value as-is. Values that would otherwise be ambiguous once decoded (an
  empty string, surrounding whitespace, or something that already looks like the base64 sentinel) are unsafe."
  [^String s]
  (boolean
   (and (not (str/blank? s))
        (= s (str/trim s))
        (every? (fn [^Character c]
                  (let [i (int c)]
                    (or (= i 9) (<= 0x20 i 0x7E))))
                s)
        (not (and (str/starts-with? s sentinel-prefix) (str/ends-with? s sentinel-suffix))))))

(defn encode-header-value
  "`s` as an HTTP header value: verbatim when [[header-safe?]], otherwise base64 of its UTF-8 bytes wrapped in the
  `=?base64?...?=` sentinel the spec defines."
  ^String [^String s]
  (if (header-safe? s)
    s
    (str sentinel-prefix
         (.encodeToString (Base64/getEncoder) (.getBytes s StandardCharsets/UTF_8))
         sentinel-suffix)))

(defn mcp-name-header
  "The raw `Mcp-Name` value for a request, or nil for methods that do not carry one."
  [method params]
  (case method
    ("tools/call" "prompts/get") (:name params)
    "resources/read"             (:uri params)
    nil))

;;; ------------------------------------------------ x-mcp-header ------------------------------------------------

(def ^:private header-name-token #"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")

(def ^:private mirrorable-types #{"string" "integer" "boolean"})

(defn- annotation-paths
  "Key paths to every `x-mcp-header` annotation in `schema`, wherever it occurs."
  [schema]
  (letfn [(walk [x path]
            (cond
              (map? x)        (concat (when (contains? x :x-mcp-header) [path])
                                      (mapcat (fn [[k v]] (walk v (conj path k))) x))
              (sequential? x) (mapcat (fn [i v] (walk v (conj path i))) (range) x)
              :else           nil))]
    (walk schema [])))

(defn- properties-path?
  "Whether `path` reaches a property only through `properties` keys, which is where the spec allows the annotation."
  [path]
  (and (seq path)
       (even? (count path))
       (every? #(= :properties %) (take-nth 2 path))))

(defn- header-params
  "One map per annotated property: the header name, the JSON Schema type, the schema key path, and the path of the
  value in the tool's arguments."
  [tool]
  (let [schema (:inputSchema tool)]
    (for [path (annotation-paths schema)
          :let [property (get-in schema path)]]
      {:path     path
       :arg-path (vec (take-nth 2 (rest path)))
       :header   (:x-mcp-header property)
       :type     (:type property)})))

(defn invalid-tool-reason
  "Why `tool` violates the `x-mcp-header` constraints, or nil when it does not. The spec requires HTTP clients to
  drop such tools rather than call them with unmirrored headers."
  [tool]
  (let [params (header-params tool)]
    (or (some (fn [{:keys [path header type]}]
                (cond
                  (not (properties-path? path))
                  (str "x-mcp-header at " (pr-str path) " is not reachable through properties keys alone")

                  (not (and (string? header) (re-matches header-name-token header)))
                  (str "x-mcp-header " (pr-str header) " is not a valid HTTP header name")

                  (not (contains? mirrorable-types type))
                  (str "x-mcp-header " header " is on a " (pr-str type) " property; only string, integer and boolean are allowed")))
              params)
        (some->> params
                 (map #(u/lower-case-en (str (:header %))))
                 frequencies
                 (some (fn [[header n]] (when (> n 1) header)))
                 (str "x-mcp-header names must be unique ignoring case: ")))))

(defn- argument-at
  "The value at `arg-path` in `arguments`, whether the caller used keyword or string keys."
  [arguments arg-path]
  (reduce (fn [m k]
            (cond
              (not (map? m))              (reduced nil)
              (contains? m k)             (get m k)
              (contains? m (name k))      (get m (name k))
              :else                       (reduced nil)))
          arguments
          arg-path))

(defn- header-value
  [v]
  (cond
    (string? v)  v
    (boolean? v) (if v "true" "false")
    :else        (str v)))

(defn param-headers
  "The `Mcp-Param-*` headers a `tools/call` with `arguments` must carry for `tool`. Arguments that are absent or nil
  produce no header."
  [tool arguments]
  (into {}
        (for [{:keys [arg-path header]} (header-params tool)
              :let [v (argument-at arguments arg-path)]
              :when (some? v)]
          [(str "Mcp-Param-" header) (encode-header-value (header-value v))])))
