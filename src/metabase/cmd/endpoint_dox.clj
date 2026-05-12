(ns metabase.cmd.endpoint-dox
  "Generate the OpenAPI spec for the Metabase API by running

    clojure -M:ee:doc api-documentation

  The Astro docs site renders the spec via Scalar at /docs/<version>/api."
  (:require
   [metabase.api-routes.core]
   [metabase.api.open-api]
   [metabase.cmd.common :as cmd.common]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

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
  "Generates the OpenAPI spec and writes it as JSON. Defaults to `docs/api.json`."
  ([]
   (generate-dox! "docs/api.json"))
  ([^String output-file]
   (printf "Writing OpenAPI JSON to %s\n" output-file)
   (cmd.common/write-doc-file! output-file (json/encode (openapi-object) {:pretty true}))
   (println "Done.")))
