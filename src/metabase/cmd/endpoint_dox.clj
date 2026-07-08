(ns metabase.cmd.endpoint-dox
  "Generate OpenAPI + Scalar API documentation by running

    clojure -M:ee:doc api-documentation"
  (:require
   [clojure.string :as str]
   [metabase.api-routes.core]
   [metabase.api.open-api]
   [metabase.cmd.common :as cmd.common]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- validate-single-placeholder
  "Validates that split-parts contains exactly 2 elements (indicating one placeholder was found).
  Throws an ex-info if validation fails."
  [template-path placeholder split-parts]
  (when-not (= 2 (count split-parts))
    (throw (ex-info (str "Template must contain exactly one " placeholder " placeholder")
                    {:path template-path
                     :placeholder placeholder
                     :expected 1
                     :found (dec (count split-parts))}))))

(defn- fill-template-placeholder
  "Loads a template resource and replaces a placeholder with content.
  Validates that exactly one instance of the placeholder exists in the template."
  [template-path placeholder content]
  (let [template    (cmd.common/load-resource! template-path)
        split-parts (str/split template (re-pattern (str "\\Q" placeholder "\\E")))]
    (validate-single-placeholder template-path placeholder split-parts)
    (let [[before after] split-parts]
      (str before content after))))

(def ^:private scalar-config
  "See https://github.com/scalar/scalar/blob/main/documentation/configuration.md"
  {:servers [{:url "http://localhost:3000"
              :description "Localhost"}]
   :info {:title "Metabase API documentation"
          :description (cmd.common/load-resource! "openapi/api-intro.md")}})

(defn- openapi-object
  "Generates the complete OpenAPI specification object by merging the core API routes with Scalar configuration."
  []
  (merge
   (metabase.api.open-api/root-open-api-object #'metabase.api-routes.core/routes)
   scalar-config))

(defn generate-dox!
  "Generates OpenAPI/Scalar documentation and writes it to files.

  With no arguments, writes to `docs/api.html` and `docs/api.json`.
  With an output-file argument, writes to the specified path and generates
  a corresponding JSON file with the same basename."
  ([]
   (generate-dox! "docs/api.html"))

  ([^String output-file]
   (printf "Generating OpenAPI+Scalar documentation in %s\n" output-file)
   (let [openapi-json (json/encode (openapi-object) {:pretty true})
         json-file    (str/replace output-file #"\.html$" ".json")
         content      (fill-template-placeholder
                       "openapi/index_external.html.mustache"
                       "{{json_url}}"
                       "api.json")]
     (printf "Writing OpenAPI JSON to %s\n" json-file)
     (cmd.common/write-doc-file! json-file openapi-json)
     (printf "Writing HTML to %s\n" output-file)
     (cmd.common/write-doc-file! output-file content))
   (println "Done.")))
