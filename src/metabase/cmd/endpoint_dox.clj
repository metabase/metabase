(ns metabase.cmd.endpoint-dox
  "Generate OpenAPI + Scalar API documentation by running

    clojure -M:ee:doc api-documentation"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api-routes.core]
   [metabase.api.open-api]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private scalar-config
  "See https://github.com/scalar/scalar/blob/main/documentation/configuration.md"
  {:servers [{:url "http://localhost:3000"
              :description "Localhost"}]
   :info {:title "Metabase API documentation"
          :description (slurp (io/resource "openapi/api-intro.md"))}})

(defn- openapi-object []
  (merge
   (metabase.api.open-api/root-open-api-object #'metabase.api-routes.core/routes)
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
       (json/encode-to openapi-object w {:pretty true})
       (.write w after)))
   (println "Done.")))
