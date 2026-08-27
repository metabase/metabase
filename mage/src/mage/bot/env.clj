(ns mage.bot.env
  "Environment variable resolution across dev infrastructure.
   Priority order: mise.local.toml > .env > .lein-env > system env."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- parse-toml-value
  "Parse a TOML scalar value (RHS of `key = value`). Returns the unquoted string
   for basic strings (with `\\\"` and `\\\\` escapes), the inner text for literal
   strings, or the raw token for bare scalars (ints, bools). Returns nil for
   values we don't handle (multi-line strings, arrays, inline tables)."
  [v]
  (let [v (str/trim v)]
    (cond
      (and (str/starts-with? v "\"")
           (not (str/starts-with? v "\"\"\""))
           (re-matches #"\"(?:[^\"\\]|\\.)*\"" v))
      (-> v
          (subs 1 (dec (count v)))
          (str/replace #"\\(.)" "$1"))

      (and (str/starts-with? v "'")
           (not (str/starts-with? v "'''"))
           (re-matches #"'[^']*'" v))
      (subs v 1 (dec (count v)))

      (re-matches #"[A-Za-z0-9_+\-.]+" v)
      v

      :else nil)))

(defn read-mise-local-toml
  "Parse mise.local.toml [env] section and return a map of env var name -> value.
   Handles double-quoted strings (with escapes), single-quoted literal strings,
   and bare scalars. Keys may contain word chars, hyphens, or dots."
  ([] (read-mise-local-toml u/project-root-directory))
  ([root-dir]
   (let [path (str root-dir "/mise.local.toml")]
     (when (.exists (java.io.File. ^String path))
       (with-open [rdr (io/reader path)]
         (->> (line-seq rdr)
              (drop-while #(not= (str/trim %) "[env]"))
              (drop 1)
              (take-while #(not (re-matches #"\s*\[.*\]\s*" %)))
              (keep (fn [line]
                      (when-let [[_ k raw-v] (re-matches #"\s*([\w.\-]+)\s*=\s*(.*?)\s*" line)]
                        (when-let [v (parse-toml-value raw-v)]
                          [k v]))))
              (into {})))))))

(defn read-dot-env
  "Parse .env file and return a map of env var name -> value.
   Supports KEY=value, export KEY=value, and quoted values."
  ([] (read-dot-env u/project-root-directory))
  ([root-dir]
   (let [path (str root-dir "/.env")]
     (when (.exists (java.io.File. ^String path))
       (into {}
             (keep (fn [line]
                     (let [trimmed (-> (str/trim line)
                                       (str/replace #"^\s*export\s+" ""))]
                       (when (and (seq trimmed)
                                  (not (str/starts-with? trimmed "#"))
                                  (str/includes? trimmed "="))
                         (let [idx (str/index-of trimmed "=")
                               k   (str/trim (subs trimmed 0 idx))
                               v   (-> (subs trimmed (inc idx))
                                       str/trim
                                       (str/replace #"^\"(.*)\"$" "$1")
                                       (str/replace #"^'(.*)'$" "$1"))]
                           [k v])))))
             (str/split-lines (slurp path)))))))

(defn read-lein-env
  "Parse .lein-env (EDN map with keyword keys) and return a map of env var name -> value."
  ([] (read-lein-env u/project-root-directory))
  ([root-dir]
   (let [path (str root-dir "/.lein-env")]
     (when (.exists (java.io.File. ^String path))
       (try
         (into {}
               (map (fn [[k v]]
                      [(-> (name k)
                           (str/replace "-" "_")
                           str/upper-case)
                       (str v)]))
               (edn/read-string (slurp path)))
         (catch Exception _e nil))))))

(defn resolve-env
  "Resolve an environment variable with priority: mise.local.toml > .env > .lein-env > system env.
   Returns the value or nil if not found in any source."
  ([var-name]
   (resolve-env var-name u/project-root-directory))
  ([var-name root-dir]
   (or (get (read-mise-local-toml root-dir) var-name)
       (get (read-dot-env root-dir) var-name)
       (get (read-lein-env root-dir) var-name)
       (let [v (System/getenv var-name)] (when-not (str/blank? v) v)))))

(defn resolve-all
  "Resolve all environment variables from all sources, with mise.local.toml > .env > .lein-env > system env.
   Returns a sorted map of all resolved vars."
  ([] (resolve-all u/project-root-directory))
  ([root-dir]
   (let [mise-map    (or (read-mise-local-toml root-dir) {})
         dot-env-map (or (read-dot-env root-dir) {})
         lein-map    (or (read-lein-env root-dir) {})
         all-keys    (into (sorted-set)
                           (concat (keys mise-map)
                                   (keys dot-env-map)
                                   (keys lein-map)))]
     (into (sorted-map)
           (keep (fn [k]
                   (when-let [v (or (get mise-map k)
                                    (get dot-env-map k)
                                    (get lein-map k)
                                    (let [v (System/getenv k)] (when-not (str/blank? v) v)))]
                     [k v])))
           all-keys))))
