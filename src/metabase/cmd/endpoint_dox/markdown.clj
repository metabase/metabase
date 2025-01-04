(ns metabase.cmd.endpoint-dox.markdown
  "Code for generating YAML based on the endpoint metadata returned by [[metabase.cmd.endpoint-dox.metadata]]. This does
  not include the code for WRITING the YAML; that code lives in [[metabase.cmd.endpoint-dox]]."
  (:require
   [clojure.string :as str]
   [metabase.cmd.endpoint-dox.markdown.generate :as endpoint-dox.markdown.generate]
   [metabase.cmd.endpoint-dox.metadata :as metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;;;;
;;;; Markdown tree
;;;;

(mr/def ::node
  any?)

;;;; Index page

(defn- api-docs-intro
  "Exists just so we can write the intro in Markdown."
  []
  [:include-file "src/metabase/cmd/resources/api-intro.md"])

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

(mu/defn- endpoint-link :- ::node
  "Creates a link to the page for each endpoint. Used to build links
  on the API index page at `docs/api-documentation.md`."
  [{:keys [paid?], page-name :name, :as _page} :- ::metadata/page]
  (let [filepath (page-filename (if paid? "api/ee/" "api/") page-name)]
    [:bullet-point
     [:link
      (str page-name (when paid? "*"))
      filepath]]))

(mu/defn- index-page-node :- ::node
  "Creates a string that lists links to all endpoint groups,
  e.g., - [Activity](api/activity.md)."
  [pages :- ::metadata/pages]
  [(api-docs-intro)
   (cons
    :single-newlines
    (map endpoint-link pages))])

;;;; Namespace page

(mu/defn- page-description :- ::node
  "Used to grab namespace description, if it exists."
  [{page-name :name, page-ns :ns, :as _page} :- ::metadata/page]
  (let [desc (-> page-ns
                 meta
                 :doc
                 u/add-period)]
    (if (str/blank? desc)
      (u/add-period (format "API endpoints for %s" page-name))
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

(mu/defn- page-frontmatter :- ::node
  "Formats frontmatter, which includes title and summary, if any."
  [{page-name :name, :as page} :- ::metadata/page]
  (let [desc (format-frontmatter-description (page-description page))]
    [:frontmatter {:title (format "\"%s\"" page-name), :summary desc}]))

(mu/defn- page-title :- ::node
  "Creates a page title for a set of endpoints, e.g., `# Card`."
  [page-title :- string?]
  [:h1 page-title])

(mu/defn- endpoint-docs :- ::node
  "Builds a list of endpoints and their parameters. Relies on docstring generation in [[metabase.api.common.internal]]."
  [endpoints :- [:sequential ::metadata/endpoint]]
  (for [endpoint endpoints
        :let [doc (:doc endpoint)]]
    (cond-> doc
      (string? doc) str/trim)))

(mu/defn- endpoint-footer :- ::node
  "Adds a footer with a link back to the API index."
  [{:keys [paid?], :as _page} :- ::metadata/page]
  (let [dir (if paid? "../../" "../")]
    ["---"
     [:link "<< Back to API index" (str dir "api-documentation.md")]]))

(mu/defn ^:private page-node :- ::node
  [{:keys [endpoints], page-name :name, :as page} :- ::metadata/page]
  [(page-frontmatter page)
   (page-title page-name)
   (page-description page)
   (endpoint-docs endpoints)
   (endpoint-footer page)])

;;;;
;;;; Markdown Generation
;;;;

(mu/defn page :- string?
  "Builds a page with the name, description, table of contents for endpoints in a namespace,
  followed by the endpoint and their parameter descriptions."
  [page :- ::metadata/page]
  (endpoint-dox.markdown.generate/->markdown (page-node page)))

(mu/defn index-page :- string?
  "Generate Markdown for the index page."
  [pages :- ::metadata/pages]
  (endpoint-dox.markdown.generate/->markdown (index-page-node pages)))

;;;;
;;;; Example usages
;;;;

(comment
  (index-page-node (metadata/all-pages))

  (let [page (index-page (metadata/all-pages))]
    (println page)
    nil)

  (page-node (first (#'metadata/endpoints->pages (#'metadata/ns-endpoints 'metabase.api.timeline))))

  (let [page (page (first (#'metadata/endpoints->pages (#'metadata/ns-endpoints 'metabase.api.timeline))))]
    (println page)
    nil))

;;; PLEASE DON'T ADD ANY MORE CODE AFTER THE EXAMPLE USAGES ABOVE, GO ADD IT SOMEWHERE ELSE.
