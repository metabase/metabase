(ns metabase.cmd.common
  "Common utilities for cmd namespace documentation generation."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.tools.namespace.find :as ns.find]))

(set! *warn-on-reflection* true)

(def ^:private metabase-namespaces-loaded
  (delay
    (doseq [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
            :when (and
                   (str/includes? (name ns-symb) "metabase")
                   (not (str/includes? (name ns-symb) "test")))]
      ;; documentation generation deliberately loads every discovered Metabase namespace
      #_{:clj-kondo/ignore [:metabase/modules]}
      (require ns-symb))))

(defn load-metabase-namespaces!
  "Loads every non-test Metabase namespace on the classpath, which registers every setting, MCP tool, and AI provider.
  Only the first call in a JVM scans the classpath."
  []
  @metabase-namespaces-loaded)

(defn load-resource!
  "Loads a resource file with error handling.

  Returns the resource contents as a string. Throws an informative ex-info with the resource path
  if the resource is not found or cannot be read. This provides better error messages than
  bare `io/resource` which returns nil for missing resources."
  [path]
  (if-let [resource (io/resource path)]
    (try
      (slurp resource)
      (catch Exception e
        (throw (ex-info (str "Failed to read resource: " path)
                        {:path path}
                        e))))
    (throw (ex-info (str "Resource not found: " path)
                    {:path path}))))

(defn write-doc-file!
  "Writes content to a file with error handling.

  Creates parent directories if they don't exist. Throws an informative exception if the write fails.
  Used to ensure documentation files can be written even when the directory structure doesn't exist yet."
  [path content]
  (try
    (io/make-parents path)
    (spit path content)
    (catch Exception e
      (throw (ex-info (str "Failed to write documentation file: " path)
                      {:path path}
                      e)))))
