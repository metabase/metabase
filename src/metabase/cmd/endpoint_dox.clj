(ns metabase.cmd.endpoint-dox
  "Implementation for the `api-documentation` command, which generate"
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.plugins.classloader :as classloader]))

(defn- dox
  "Generate a Markdown string containing documentation for all Metabase API endpoints."
  []
  (str "# API Documentation for Metabase "
       (config/mb-version-info :tag)
       "\n\n"
       (str/join "\n\n\n" (for [ns-symb     @u/metabase-namespace-symbols
                                :when       (.startsWith (name ns-symb) "metabase.api.")
                                [symb varr] (do (classloader/require ns-symb)
                                                (sort (ns-interns ns-symb)))
                                :when       (:is-endpoint? (meta varr))]
                            (:doc (meta varr))))))

(defn generate-dox!
  "Write markdown file containing documentation for all the API endpoints to `docs/api-documentation.md`."
  []
  (spit (io/file "docs/api-documentation.md") (dox))
  (println "Documentation generated at docs/api-documentation.md."))
