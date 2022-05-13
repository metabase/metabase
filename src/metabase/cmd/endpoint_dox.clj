(ns metabase.cmd.endpoint-dox
  "Implementation for the `api-documentation` command, which generates doc pages
  for API endpoints."
  (:require [clojure.java.classpath :as classpath]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.namespace.find :as ns.find]
            [metabase.config :as config]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]))

;;;; API docs intro

(defn- api-docs-intro
  "Exists just so we can write the intro in Markdown."
  []
  (str (slurp "src/metabase/cmd/resources/api-intro.md") "\n\n"))

;;;; API docs page title

(defn- endpoint-ns-name
  "Creates a name for endpoints in a namespace, like all the endpoints for Alerts."
  [endpoint]
  (->> (:ns endpoint)
       ns-name
       name
       (#(str/split % #"\."))
       last
       str/capitalize))

(defn- endpoint-page-title
  "Creates a page title for a set of endpoints, e.g., `# Card`."
  [ep-title]
  (str/replace (str "# " ep-title "\n\n") #"-" " "))

;;;; API endpoint description

(defn- endpoint-page-description
  "If there is a namespace docstring, include the docstring with a paragraph break."
  [ep-data]
  (let [desc (u/add-period (:doc (meta (:ns (first ep-data)))))]
    (if (str/blank? desc)
      desc
      (str desc "\n\n"))))

;;;; API endpoint page route table of contents

(defn- anchor-link
  "Converts an endpoint string to an anchor link, like [GET /api/alert](#get-apialert),
  for use in tables of contents for endpoint routes."
  [ep-name]
  (let [al (-> (str "#" (str/lower-case ep-name))
               (str/replace #"[/:%]" "")
               (str/replace " " "-")
               (#(str "(" % ")")))]
    (str "[" ep-name "]" al)))

(defn- toc-links
  "Creates a list of links to endpoints in the relevant namespace."
  [endpoint]
  (-> (:endpoint-str endpoint)
      (str/replace #"[#+`]" "")
      str/trim
      anchor-link
      (#(str "  - " %))))

(defn route-toc
  "Generates a table of contents for routes in a page."
  [ep-data]
  (str (str/join "\n" (map toc-links ep-data)) "\n\n"))

;;;; API endpoints

(defn- endpoint-str
  "Creates a name for an endpoint: VERB /path/to/endpoint.
  Used to build anchor links in the table of contents."
  [endpoint]
  (-> (:doc endpoint)
      (str/split #"\n")
      first
      str/trim))

(defn- process-endpoint
  "Decorates endpoints with strings for building API endpoint pages."
  [endpoint]
  (assoc endpoint
         :endpoint-str (endpoint-str endpoint)
         :ns-name  (endpoint-ns-name endpoint)))

(defn- api-namespaces []
  (for [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
        :when   (and (re-find #"^metabase(?:-enterprise\.[\w-]+)?\.api\." (name ns-symb))
                     (not (str/includes? (name ns-symb) "test")))]
    ns-symb))

(defn- collect-endpoints
  "Gets a list of all API endpoints."
  []
  (for [ns-symb     (api-namespaces)
        [_sym varr] (do (classloader/require ns-symb)
                        (sort (ns-interns ns-symb)))
        :when       (:is-endpoint? (meta varr))]
    (meta varr)))

(defn- endpoint-docs
  "Builds a list of endpoints and their parameters.
  Relies on docstring generation in `/api/common/internal.clj`."
  [ep-data]
  (str/join "\n\n" (map #(str/trim (:doc %)) ep-data)))

;;;; Build API pages

(defn endpoint-page
  "Builds a page with the name, description, table of contents for endpoints in a namespace,
  followed by the endpoint and their parameter descriptions."
  [ep ep-data]
  (apply str
         (endpoint-page-title ep)
         (endpoint-page-description ep-data)
         (route-toc ep-data)
         (endpoint-docs ep-data)))

(defn ee?
  [ep-data]
  (str/includes? (:endpoint-str (first ep-data)) "/api/ee"))

(defn- build-filepath
  "Creates a filepath from an endpoint."
  [dir endpoint-name ext]
  (let [file (-> endpoint-name
                 str/trim
                 (str/split #"\s+")
                 (#(str/join "-" %))
                 str/lower-case)]
    (str dir file ext)))

(defn- build-endpoint-link
  "Creates a link to the page for each endpoint. Used to build links
  on the API index page at `docs/api-documentation.md`."
  [ep ep-data]
  (let [filepath (build-filepath (if (ee? ep-data) "api/ee/" "api/") ep ".md")]
    (str "- [" (str/capitalize ep) (when (ee? ep-data) " (Premium feature)") "](" filepath ")")))

(defn- build-index
  "Creates a string that lists links to all endpoint groups,
  e.g., - [Activity](docs/api/activity.md)."
  [endpoints]
  (str/join "\n" (map (fn [[ep ep-data]] (build-endpoint-link ep ep-data)) endpoints)))

(defn- map-endpoints
  "Creates a sorted map of API endpoints. Currently excludes
  endpoints for paid features."
  []
  (->> (collect-endpoints)
       (map process-endpoint)
       (group-by :ns-name)
       (into (sorted-map))))

;;;; Page generators

(defn- generate-index-page!
  "Creates an index page that lists links to all endpoint pages."
  [endpoint-map]
  (let [endpoint-index (str
                        (api-docs-intro)
                        (build-index endpoint-map))]
    (spit (io/file "docs/api-documentation.md") endpoint-index)))

(defn- generate-endpoint-pages!
  "Takes a map of endpoint groups and generates markdown
  pages for all API endpoint groups."
  [endpoints]
  (doseq [[ep ep-data] endpoints]
    (let [file (build-filepath (str "docs/" (if (ee? ep-data) "api/ee/" "api/")) ep ".md")
          contents (endpoint-page ep ep-data)]
      (io/make-parents file)
      (spit file contents))))

(defn delete-dir-recur
  [f]
  (when (.isDirectory f)
    (run! delete-dir-recur (.listFiles f)))
  (when (.exists f) (io/delete-file f)))

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
                        "clojure -M:ee:run api-documentation"))))
  (let [endpoint-map (map-endpoints)]
    (delete-dir-recur (io/file "docs/api"))
    (println (get endpoint-map "Application"))
    (generate-index-page! endpoint-map)
    (println "API doc index generated at docs/api-documentation.md.")
    (generate-endpoint-pages! endpoint-map)
    (println "API endpoint docs generated in docs/api/{endpoint}.")))
