(ns metabase.cmd.endpoint-dox
  "Generate OpenAPI + Scalar API documentation by running

    clojure -M:ee:doc api-documentation-2"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.common]
   [metabase.api.routes]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private scalar-config
  "See https://github.com/scalar/scalar/blob/main/documentation/configuration.md"
  {:servers [{:url         "http://localhost:3000/api"
              :description "Localhost"}]})

(defn- openapi-object []
  (merge
   (metabase.api.common/openapi-object #'metabase.api.routes/routes)
   scalar-config))

(defn generate-dox!
  "Generates OpenAPI/Scalar documentation and write it to `docs/api.html`."
  ([]
   (generate-dox! "docs/api.html"))

  ([^String output-file]
   (printf "Generating OpenAPI+Scalar documentation in %s\n" output-file)
   (let [index                          (slurp (io/resource "openapi/index_inline.html.mustache"))
         [^String before ^String after] (str/split index #"\Q{{json}}\E")
         openapi-object                 (openapi-object)]
     (with-open [w (java.io.FileWriter. output-file)]
       (.write w before)
       (json/encode-to openapi-object  w {:pretty true})
       (.write w after)))
   (println "Done.")))
