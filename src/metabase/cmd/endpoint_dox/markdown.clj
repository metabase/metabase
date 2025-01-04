(ns metabase.cmd.endpoint-dox.markdown
  "Code for generating YAML based on the endpoint metadata returned by [[metabase.cmd.endpoint-dox.metadata]]. This does
  not include the code for WRITING the YAML; that code lives in [[metabase.cmd.endpoint-dox]]."
  (:require
   [clojure.string :as str]
   [metabase.cmd.endpoint-dox.metadata :as metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- api-docs-intro
  "Exists just so we can write the intro in Markdown."
  []
  (str (slurp "src/metabase/cmd/resources/api-intro.md") "\n\n"))

(mu/defn- page-description :- string?
  "Used to grab namespace description, if it exists."
  [{page-name :name, page-ns :ns, :as _page} :- ::metadata/page]
  (let [desc (-> page-ns
                 meta
                 :doc
                 u/add-period)]
    (if (str/blank? desc)
      (u/add-period (str "API endpoints for " page-name))
      desc)))

(defn- handle-quotes
  "Used for formatting YAML string punctuation for frontmatter descriptions."
  [s]
  (-> s
      (str/replace #"\"" "'")
      str/split-lines
      (#(str/join "\n  " %))))

(mu/defn- format-frontmatter-description :- string?
  "Formats description for YAML frontmatter."
  [description :- string?]
  (str "|\n  " (handle-quotes description)))

(mu/defn- page-frontmatter :- string?
  "Formats frontmatter, which includes title and summary, if any."
  [{page-name :name, :as page} :- ::metadata/page]
  (let [desc (format-frontmatter-description (page-description page))]
    (str "---\ntitle: \"" page-name "\""
         "\nsummary: " desc "\n---\n\n")))

(defn- page-title
  "Creates a page title for a set of endpoints, e.g., `# Card`."
  [page-title]
  (str "# " page-title "\n\n"))

(mu/defn- endpoint-page-description :- string?
  "If there is a namespace docstring, include the docstring with a paragraph break."
  [page :- ::metadata/page]
  (let [desc (page-description page)]
    (if (str/blank? desc)
      desc
      (str desc "\n\n"))))

(mu/defn- endpoint-docs :- string?
  "Builds a list of endpoints and their parameters. Relies on docstring generation in [[metabase.api.common.internal]]."
  [endpoints :- [:sequential ::metadata/endpoint]]
  (str/join "\n\n" (map #(str/trim (:doc %)) endpoints)))

(mu/defn- endpoint-footer :- string?
  "Adds a footer with a link back to the API index."
  [{:keys [paid?], :as _page} :- ::metadata/page]
  (let [level (if paid? "../../" "../")]
    (str "\n\n---\n\n[<< Back to API index](" level "api-documentation.md)")))

(mu/defn page :- string?
  "Builds a page with the name, description, table of contents for endpoints in a namespace,
  followed by the endpoint and their parameter descriptions."
  [{:keys [endpoints], page-name :name, :as page} :- ::metadata/page]
  (str
   (page-frontmatter page)
   (page-title page-name)
   (endpoint-page-description page)
   (endpoint-docs endpoints)
   (endpoint-footer page)))

(mu/defn page-filename :- string?
  "Creates a filepath from an endpoint."
  [dir       :- string?
   page-name :- ::metadata/page-name]
  (let [file (-> page-name
                 str/trim
                 (str/split #"\s+")
                 (#(str/join "-" %))
                 u/lower-case-en)]
    (str dir file ".md")))

(mu/defn- build-endpoint-link
  "Creates a link to the page for each endpoint. Used to build links
  on the API index page at `docs/api-documentation.md`."
  [{:keys [paid?], page-name :name, :as _page} :- ::metadata/page]
  (let [filepath (page-filename (if paid? "api/ee/" "api/") page-name)]
    (str "- [" page-name (when paid? "*") "](" filepath ")")))

(mu/defn- build-index :- string?
  "Creates a string that lists links to all endpoint groups,
  e.g., - [Activity](api/activity.md)."
  [pages :- ::metadata/pages]
  (str/join "\n" (map build-endpoint-link pages)))

(mu/defn index-page :- string?
  "Generate Markdown for the index page."
  [pages :- ::metadata/pages]
  (str
   (api-docs-intro)
   (build-index pages)))

(comment
  (let [page (page (first (#'metadata/endpoints->pages (#'metadata/ns-endpoints 'metabase.api.timeline))))]
    (println page)
    nil))
