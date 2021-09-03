(ns metabase.cmd.endpoint-dox
  "Implementation for the `api-documentation` command, which generate"
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]))

;;;; API docs intro

(defn- api-docs-intro!
  "Exists just so we can write the intro in Markdown."
  []
  (str (slurp "src/metabase/cmd/resources/api-intro.md") "\n\n"))

;;;; API docs section title

(defn- endpoint-ns-name
  "Creates a name for endpoints in a namespace, like all the endpoints for Alerts."
  [endpoint]
  (->> (:ns endpoint)
       (ns-name)
       (name)
       (#(str/split % #"\."))
       (last)
       (str/capitalize)))

(defn- section-title
  "Creates a section title for a set of endpoints."
  [ep-title]
  (str/replace (str "## " ep-title "\n\n") #"-" " "))

;;;; API docs section description

(defn- section-description
  "If there is a namespace docstring, include the docstring with a paragraph break."
  [ep-data]
  (let [desc (u/add-period (:doc (meta (:ns (first ep-data)))))]
    (if (str/blank? desc) desc
        (str desc "\n\n"))))

;;;; API docs section table of contents

(defn- anchor-link
  "Converts an endpoint string to an anchor link, like [GET /api/alert](#get-apialert),
  for use in section tables of contents."
  [ep-name]
  (let [al (-> (str "#" (str/lower-case ep-name))
               (str/replace #"[/:-_]" "")
               (str/replace " " "-")
               (#(str "(" % ")")))]
    (str "[" ep-name "]" al)))

(defn- toc-links
  "Creates a list of links to endpoints in the relevant namespace."
  [endpoints]
  (->> (map :endpoint-str endpoints)
       (map #(str/replace % #"[#+`]" ""))
       (map str/trim)
       (map anchor-link)
       (map #(str "  - " %))))

(defn section-toc
  "Generates a table of contents for endpoints in a section."
  [ep-data]
  (str (str/join "\n" (toc-links ep-data)) "\n\n"))

;;;; API docs section endpoints

(defn- endpoint-str
  "Creates a name for an endpoint: VERB /path/to/endpoint. Used to build anchor links in the table of contents."
  [endpoint]
  (->> (:doc endpoint)
       (#(str/split % #"\n"))
       (first)
       (str/trim)))

(defn- process-endpoint
  "Decorates endpoints with strings for building api endpoint sections."
  [endpoint]
  (assoc endpoint
         :endpoint-str (endpoint-str endpoint)
         :ns-name  (endpoint-ns-name endpoint)))

(defn- collect-endpoints
  "Gets a list of all API endpoints. Currently excludes Enterprise endpoints."
  []
  (for [ns-symb     u/metabase-namespace-symbols
        :when       (str/includes? (name ns-symb) "metabase.api")
        [symb varr] (do (classloader/require ns-symb)
                        (sort (ns-interns ns-symb)))
        :when       (:is-endpoint? (meta varr))]
    (meta varr)))

(defn- section-endpoints
  "Builds a list of endpoints and their parameters. Relies on docstring generation in /api/common/internal.clj"
  [ep-data]
  (str/join "\n\n" (map :doc ep-data)))

;;;; Generate API sections

(defn endpoint-section
  "Builds a section with the name, description, table of contents for endpoints in a namespace,
  followed by the endpoint and their parameter descriptions."
  [ep-map]
  (for [[ep ep-data] ep-map]
    (apply str
           (section-title ep)
           (section-description ep-data)
           (section-toc ep-data)
           (section-endpoints ep-data))))

(defn- dox
  "Generate a Markdown string containing documentation for all Metabase API endpoints."
  []
  (str (api-docs-intro!)
       (str/join "\n\n\n"
                 (->> (collect-endpoints)
                      (map process-endpoint)
                      (group-by :ns-name)
                      (into (sorted-map))
                      (endpoint-section)))))

(defn generate-dox!
  "Write markdown file containing documentation for all the API endpoints to `docs/api-documentation.md`."
  []
  (spit (io/file "docs/api-documentation.md") (dox))
  (println "Documentation generated at docs/api-documentation.md."))
