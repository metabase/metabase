(ns metabase.cmd.endpoint-dox-2
  "Generate OpenAPI + Scalar API documentation by running

    clojure -M:ee:doc api-documentation-2"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.common]
   [metabase.api.routes]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn generate-dox!
  "Replacement for the [[metabase.cmd.endpoint-dox/generate-dox!]] command that generates OpenAPI documentation instead
  of custom stuff."
  []
  (println "Generating OpenAPI+Scalar documentation in target/doc/index.html")
  (u.files/create-dir-if-not-exists! (u.files/get-path "target/doc"))
  (let [index                          (slurp (io/resource "openapi/index_inline.html.mustache"))
        [^String before ^String after] (str/split index #"\Q{{json}}\E")
        openapi-object                 (merge
                                        (metabase.api.common/openapi-object #'metabase.api.routes/routes)
                                        {:servers [{:url         "http://localhost:3000/api"
                                                    :description "Localhost"}]})]
    (with-open [w (java.io.FileWriter. "target/doc/index.html")]
      (.write w before)
      (json/encode-to openapi-object  w {:pretty true})
      (.write w after)))
  (println "Done."))
