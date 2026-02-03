#!/usr/bin/env bb

(ns extract-agent-openapi
  "Extract the Agent API subset from the full Metabase OpenAPI specification.

   Produces a standalone OpenAPI 3.1.0 document containing only Agent API endpoints
   and their transitively required schema definitions."
  (:require
   [babashka.cli :as cli]
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private default-config
  {:input "docs/api.json"
   :output "docs/agent-api.json"
   :prefix "/api/agent"
   :pretty true})

(def ^:private cli-spec
  {:input {:alias :i
           :desc "Input OpenAPI spec file"
           :default (:input default-config)}
   :output {:alias :o
            :desc "Output file (use - for stdout)"
            :default (:output default-config)}
   :prefix {:alias :p
            :desc "Path prefix to filter"
            :default (:prefix default-config)}
   :pretty {:desc "Pretty-print JSON output"
            :default (:pretty default-config)
            :coerce :boolean}
   :help {:alias :h
          :desc "Show help"
          :coerce :boolean}})

(defn- read-openapi-spec
  "Read and parse an OpenAPI specification from a JSON file."
  [file-path]
  (let [file (io/file file-path)]
    (when-not (.exists file)
      (throw (ex-info (str "Input file not found: " file-path)
                      {:type :file-not-found :path file-path})))
    (try
      (with-open [reader (io/reader file)]
        (json/parse-stream reader true))
      (catch Exception e
        (throw (ex-info (str "Failed to parse JSON file: " file-path)
                        {:type :parse-error :path file-path :cause (.getMessage e)}))))))

(defn- write-json
  "Write data as JSON to file or stdout."
  [data output-path pretty]
  (let [json-str (json/generate-string data {:pretty pretty})]
    (if (= output-path "-")
      (println json-str)
      (do
        (io/make-parents output-path)
        (spit output-path json-str)
        (binding [*out* *err*]
          (println (str "Written to: " output-path)))))))

(defn- extract-refs
  "Recursively find all schema names referenced via $ref in a data structure.
   Returns a set of schema names (without the #/components/schemas/ prefix)."
  [data]
  (cond
    (map? data)
    (reduce-kv
     (fn [acc k v]
       (if (= k :$ref)
         (if-let [[_ schema-name] (re-matches #"#/components/schemas/(.+)" v)]
           (conj acc schema-name)
           acc)
         (set/union acc (extract-refs v))))
     #{}
     data)

    (sequential? data)
    (reduce #(set/union %1 (extract-refs %2)) #{} data)

    :else #{}))

(defn- resolve-transitive-schemas
  "Resolve all transitively referenced schemas starting from initial refs.
   Returns a map of schema-name -> schema-definition for all required schemas."
  [all-schemas initial-refs]
  (loop [to-resolve initial-refs
         resolved {}
         missing #{}]
    (if (empty? to-resolve)
      (do
        (when (seq missing)
          (binding [*out* *err*]
            (println (str "Warning: " (count missing) " referenced schema(s) not found: "
                          (str/join ", " (sort missing))))))
        resolved)
      (let [schema-name (first to-resolve)
            remaining (disj to-resolve schema-name)]
        (if (contains? resolved schema-name)
          ;; Already resolved
          (recur remaining resolved missing)
          (if-let [schema-def (get all-schemas (keyword schema-name))]
            ;; Found schema - add it and find new refs
            (let [new-refs (extract-refs schema-def)
                  unresolved-refs (set/difference new-refs (set (keys resolved)) #{schema-name})]
              (recur (set/union remaining unresolved-refs)
                     (assoc resolved schema-name schema-def)
                     missing))
            ;; Schema not found
            (recur remaining resolved (conj missing schema-name))))))))

(defn- filter-paths
  "Filter paths that match the given prefix."
  [paths prefix]
  (into {}
        (filter (fn [[path-key _]]
                  ;; Path keys may be keywords like :/api/agent/v1/ping
                  (let [path-str (if (keyword? path-key)
                                   (subs (str path-key) 1)
                                   (str path-key))]
                    (str/starts-with? path-str prefix))))
        paths))

(defn- build-agent-openapi
  "Construct the Agent API OpenAPI document."
  [filtered-paths schemas]
  {:openapi "3.1.0"
   :info {:title "Metabase Agent API"
          :description (str "OpenAPI specification for the Metabase Agent API.\n\n"
                            "This is a subset of the full Metabase API, containing only "
                            "the Agent API endpoints and their required schema definitions.\n\n"
                            "For the full API documentation, see the complete OpenAPI spec for "
                            "your Metabase instance at `https://[your-metabase-url]/api/docs`.")
          :version "1.0.0"}
   :servers [{:url "http://localhost:3000"
              :description "Localhost"}]
   :paths filtered-paths
   :components {:schemas schemas}})

(defn- extract-agent-api
  "Extract the Agent API from a full OpenAPI specification."
  [{:keys [input output prefix pretty]}]
  (let [spec (read-openapi-spec input)
        all-paths (:paths spec)
        all-schemas (get-in spec [:components :schemas])

        ;; Filter paths matching the prefix
        filtered-paths (filter-paths all-paths prefix)
        path-count (count filtered-paths)

        _ (when (zero? path-count)
            (throw (ex-info (str "No paths found matching prefix: " prefix)
                            {:type :no-paths-found :prefix prefix})))

        ;; Extract initial schema refs from filtered paths
        initial-refs (extract-refs filtered-paths)

        ;; Resolve all transitive schema dependencies
        resolved-schemas (resolve-transitive-schemas all-schemas initial-refs)

        ;; Build output document
        agent-api (build-agent-openapi filtered-paths resolved-schemas)]

    (write-json agent-api output pretty)

    (binding [*out* *err*]
      (println (str "Extracted " path-count " path(s) and "
                    (count resolved-schemas) " schema(s)")))

    {:path-count path-count
     :schema-count (count resolved-schemas)}))

;;; CLI

(defn- print-help []
  (println "Extract Agent API OpenAPI specification from the full Metabase API spec.")
  (println)
  (println "Usage: extract-agent-openapi.bb [OPTIONS]")
  (println)
  (println "Options:")
  (println "  -i, --input FILE     Input OpenAPI spec (default: docs/api.json)")
  (println "  -o, --output FILE    Output file, use - for stdout (default: docs/agent-api.json)")
  (println "  -p, --prefix PREFIX  Path prefix to filter (default: /api/agent)")
  (println "  --pretty BOOL        Pretty-print JSON (default: true)")
  (println "  -h, --help           Show this help")
  (println)
  (println "Examples:")
  (println "  # Extract with defaults")
  (println "  ./bin/extract-agent-openapi.bb")
  (println)
  (println "  # Write to stdout for inspection")
  (println "  ./bin/extract-agent-openapi.bb -o -")
  (println)
  (println "  # Use canonical format as input")
  (println "  ./bin/extract-agent-openapi.bb -i resources/openapi/openapi.json"))

(defn -main [& args]
  (try
    (let [opts (cli/parse-opts args {:spec cli-spec})]
      (if (:help opts)
        (print-help)
        (extract-agent-api opts)))
    (catch Exception e
      (let [error-data (ex-data e)]
        (binding [*out* *err*]
          (println (str "Error: " (.getMessage e)))
          (when error-data
            (println (str "  Type: " (:type error-data)))
            (when (:path error-data)
              (println (str "  Path: " (:path error-data))))))
        (System/exit 1)))))

;; Auto-run when executed directly
(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
