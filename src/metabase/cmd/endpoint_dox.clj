(ns metabase.cmd.endpoint-dox
  "Implementation for the `api-documentation` command, which generates doc pages
  for API endpoints."
  (:require
   [clojure.java.classpath :as classpath]
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

(defn- handle-enterprise-ns
  "Some paid endpoints have different formatting. This way we don't combine
  the api/table endpoint with sandbox.api.table, for example."
  [endpoint]
  (if (str/includes? endpoint "metabase-enterprise")
    (str/split endpoint #"metabase-enterprise.")
    (str/split endpoint #"\.")))

(def initialisms
  "Used to format initialisms/acronyms in generated docs."
  '["SSO" "SAML" "GTAP" "LDAP" "SQL" "JSON" "API" "LLM" "SCIM"])

(defn capitalize-initialisms
  "Converts initialisms to upper case."
  [name initialisms]
  (let [re (re-pattern (str "(?i)(?:" (str/join "|" (map #(str % "\\b") initialisms)) ")"))]
    (str/replace name re u/upper-case-en)))

(defn- handle-nonstandard-namespaces
  "Some namespaces are not named in a way that is easy to read. This function
  handles those edge cases."
  [name]
  (-> name
      (str/replace #"(.api.|-)" " ")
      (str/replace ".api" "") ; account for `serialization.api` namespace
      (str/replace "Llm" "LLM Auto-description")
      (capitalize-initialisms initialisms)
      (str/replace "SSO SSO" "SSO")))

(defn- exclude-from-docs?
  "Should we exclude the endpoint from the docs?"
 [endpoint]
  (let [ep-name (:ns-name endpoint)
        eps-to-exclude #{
                         "Cloud migration"
                         "Routes" ; api/routes
                         }]
    (contains? eps-to-exclude ep-name)))

(defn- endpoint-ns-name
  "Creates a name for endpoints in a namespace, like all the endpoints for Alerts.
  Handles some edge cases for enterprise endpoints."
  [endpoint]
  (-> (:ns endpoint)
      ns-name
      name
      handle-enterprise-ns
      last
      u/capitalize-first-char
      handle-nonstandard-namespaces))

(defn- handle-quotes
  "Used for formatting YAML string punctuation for frontmatter descriptions."
  [s]
  (-> s
      (str/replace #"\"" "'")
      str/split-lines
      (#(str/join "\n  " %))))

(defn- format-frontmatter-description
  "Formats description for YAML frontmatter."
  [desc]
  (str "|\n  " (handle-quotes desc)))

(defn- get-description
  "Used to grab namespace description, if it exists."
  [ep ep-data]
  (let [desc (-> ep-data
                 first
                 :ns
                 meta
                 :doc
                 u/add-period)]
    (if (str/blank? desc)
      (u/add-period (str "API endpoints for " ep))
      desc)))

(defn- endpoint-page-frontmatter
  "Formats frontmatter, which includes title and summary, if any."
  [ep ep-data]
  (let [desc (format-frontmatter-description (get-description ep ep-data))]
    (str "---\ntitle: \"" ep "\""
         "\nsummary: " desc "\n---\n\n")))

(defn- endpoint-page-title
  "Creates a page title for a set of endpoints, e.g., `# Card`."
  [ep-title]
  (str "# " ep-title "\n\n"))

;;;; API endpoint description

(defn- endpoint-page-description
  "If there is a namespace docstring, include the docstring with a paragraph break."
  [ep ep-data]
  (let [desc (get-description ep ep-data)]
    (if (str/blank? desc)
      desc
      (str desc "\n\n"))))

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
         :ns-name (endpoint-ns-name endpoint)))

(def api-ns
  "Regular expression to match endpoints. Needs to match namespaces like  - metabase.api.search
  - metabase-enterprise.serialization.api
   - metabase.api.api-key"
  (re-pattern "^metabase(?:-enterprise\\.[\\w-]+)?\\.api(?:\\.[\\w-]+)?$"))

(defn- api-namespaces []
  (for [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
        :when   (and (re-find api-ns (name ns-symb))
                     (not (str/includes? (name ns-symb) "test")))]
    ns-symb))

(defn collect-endpoints
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

(defn- paid?
  "Is the endpoint a paid feature?"
  [ep-data]
  (or (str/includes? (:endpoint-str (first ep-data)) "/api/ee")
      ;; some ee endpoints are inconsistent in naming, see #22687
      (str/includes? (:endpoint-str (first ep-data)) "/api/mt")
      (= 'metabase-enterprise.sandbox.api.table (ns-name (:ns (first ep-data))))
      (str/includes? (:endpoint-str (first ep-data)) "/auth/sso")
      (str/includes? (:endpoint-str (first ep-data)) "/api/moderation-review")))

(defn endpoint-footer
  "Adds a footer with a link back to the API index."
  [ep-data]
  (let [level (if (paid? ep-data) "../../" "../")]
    (str "\n\n---\n\n[<< Back to API index](" level "api-documentation.md)")))

;;;; Build API pages

(defn endpoint-page
  "Builds a page with the name, description, table of contents for endpoints in a namespace,
  followed by the endpoint and their parameter descriptions."
  [ep ep-data]
  (apply str
         (endpoint-page-frontmatter ep ep-data)
         (endpoint-page-title ep)
         (endpoint-page-description ep ep-data)
         (endpoint-docs ep-data)
         (endpoint-footer ep-data)))

(defn- build-filepath
  "Creates a filepath from an endpoint."
  [dir endpoint-name ext]
  (let [file (-> endpoint-name
                 str/trim
                 (str/split #"\s+")
                 (#(str/join "-" %))
                 u/lower-case-en)]
    (str dir file ext)))

(defn build-endpoint-link
  "Creates a link to the page for each endpoint. Used to build links
  on the API index page at `docs/api-documentation.md`."
  [ep ep-data]
  (let [filepath (build-filepath (if (paid? ep-data) "api/ee/" "api/") ep ".md")]
    (str "- [" ep (when (paid? ep-data) "*") "](" filepath ")")))

(defn- build-index
  "Creates a string that lists links to all endpoint groups,
  e.g., - [Activity](api/activity.md)."
  [endpoints]
  (str/join "\n" (map (fn [[ep ep-data]] (build-endpoint-link ep ep-data)) endpoints)))

(defn- map-endpoints
  "Creates a sorted map of API endpoints. Currently includes some
  endpoints for paid features."
  []
  (->> (collect-endpoints)
       (map process-endpoint)
       (remove exclude-from-docs?)
       (group-by :ns-name)
       (into (sorted-map-by (fn [a b] (compare
                                       (u/lower-case-en a)
                                       (u/lower-case-en b)))))))

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
    (let [file (build-filepath (str "docs/" (if (paid? ep-data) "api/ee/" "api/")) ep ".md")
          contents (endpoint-page ep ep-data)]
      (io/make-parents file)
      (spit file contents))))

(defn- md?
  "Is it a markdown file?"
  [file]
  (= "md"
     (-> file
         str
         (str/split #"\.")
         last)))

(defn- reset-dir
  "Used to clear the API directory for rebuilding docs from scratch
  so we don't orphan files as the API changes."
  [file]
  (let [files (filter md? (file-seq file))]
    (doseq [f files]
      (try (io/delete-file f)
           (catch Exception e
             (println "File:" f "not deleted")
             (println e))))))

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
    (reset-dir (io/file "docs/api"))
    (generate-index-page! endpoint-map)
    (println "API doc index generated at docs/api-documentation.md.")
    (generate-endpoint-pages! endpoint-map)
    (println "API endpoint docs generated in docs/api/{endpoint}.")))
