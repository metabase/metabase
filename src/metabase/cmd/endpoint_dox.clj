(ns metabase.cmd.endpoint-dox
  "Implementation for the `api-documentation` command, which generates doc pages
  for API endpoints."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.cmd.endpoint-dox.markdown :as endpoint-dox.markdown]
   [metabase.cmd.endpoint-dox.metadata :as endpoint-dox.metadata]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- md?
  "Is it a markdown file?"
  [file]
  (= "md"
     (-> file
         str
         (str/split #"\.")
         last)))

(defn- reset-dir!
  "Used to clear the API directory for rebuilding docs from scratch
  so we don't orphan files as the API changes."
  [file]
  (let [files (filter md? (file-seq file))]
    (doseq [f files]
      (try (io/delete-file f)
           (catch Exception e
             (println "File:" f "not deleted")
             (println e))))))

(mu/defn- generate-index-page!
  "Creates an index page that lists links to all endpoint pages."
  [pages :- ::endpoint-dox.metadata/pages]
  (spit "docs/api-documentation.md" (endpoint-dox.markdown/index-page pages)))

(mu/defn- generate-endpoint-pages!
  "Takes a map of endpoint groups and generates markdown
  pages for all API endpoint groups."
  [pages :- ::endpoint-dox.metadata/pages]
  (doseq [page pages]
    (let [file     (endpoint-dox.markdown/page-filename (str "docs/" (if (:paid? page) "api/ee/" "api/")) (:name page))
          contents (endpoint-dox.markdown/page page)]
      (io/make-parents file)
      (spit file contents))))

#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]}
(defn generate-dox!
  "Builds an index page and sub-pages for groups of endpoints.
  Index page is `docs/api-documentation.md`.
  Endpoint pages are in `/docs/api/{endpoint}.md`"
  []
  (when-not config/ee-available?
    (println (u/colorize
              :red (str "Warning: EE source code not available. EE endpoints will not be included. "
                        "If you want to include them, run the command with"
                        \newline
                        \newline
                        "clojure -M:ee:doc api-documentation"))))
  (let [pages (endpoint-dox.metadata/all-pages)]
    (reset-dir! (io/file "docs/api"))
    (generate-index-page! pages)
    (println "API doc index generated at docs/api-documentation.md.")
    (generate-endpoint-pages! pages)
    (println "API endpoint docs generated in docs/api/{endpoint}.")))
