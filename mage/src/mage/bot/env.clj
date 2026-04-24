(ns mage.bot.env
  "Environment variable resolution across dev infrastructure.
   Priority order: mise.local.toml > .env > .lein-env > system env."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn read-mise-local-toml
  "Parse mise.local.toml [env] section and return a map of env var name -> value."
  ([] (read-mise-local-toml u/project-root-directory))
  ([root-dir]
   (let [path (str root-dir "/mise.local.toml")]
     (when (.exists (java.io.File. ^String path))
       (into {}
             (keep (fn [line]
                     (when-let [[_ k v] (re-matches #"\s*(\w+)\s*=\s*\"([^\"]*)\"\s*" (str/trim line))]
                       [k v])))
             (str/split-lines (slurp path)))))))

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
