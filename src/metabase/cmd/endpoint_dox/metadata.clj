(ns metabase.cmd.endpoint-dox.metadata
  "Code for getting metadata about all the API endpoints and grouping them into pages."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.string :as str]
   [clojure.tools.namespace.find :as ns.find]
   [metabase.api.macros :as api.macros]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

;;; The `::sort-key` used to sort the endpoints in a given namespace should look like
;;;
;;;    [:get "/:id" :id "[0-9]+"]
;;;
;;; e.g.
;;;
;;;    [<method> <route> & <param-1> <regex-str-1> <param-2> <regex-str-2> ...]
;;;
;;; params should be sorted in order by param name, and regex patterns should be converted to strings.

(mr/def ::endpoint-sort-key
  [:and
   [:cat
    #_method [:enum :get :post :put :delete]
    #_route  string?
    #_params [:* [:cat #_param keyword? #_pattern string?]]]
   [:fn
    {:error/message "params must be sorted"}
    (fn [[_method _route & param-pattern-pairs]]
      (let [params (map first (partition-all 2 param-pattern-pairs))]
        (= params (sort params))))]])

(mr/def ::endpoint
  [:map
   [::sort-key ::endpoint-sort-key]
   [:ns        (ms/InstanceOfClass clojure.lang.Namespace)]
   [:doc       string?]])

(mr/def ::page-name
  string?)

(mr/def ::page
  [:map
   [:name      ::page-name]
   [:ns        (ms/InstanceOfClass clojure.lang.Namespace)]
   [:paid?     {:description "Whether this page consists of paid (i.e., EE) endpoints."} boolean?]
   [:endpoints [:sequential ::endpoint]]])

(mr/def ::pages
  [:and
   [:sequential ::page]
   [:fn
    {:error/message "Pages should be sorted"}
    (fn [pages]
      (= (sort-by u/lower-case-en (map ::page-name pages))
         (map ::page-name pages)))]])

(mu/defn- enterprise-page-name :- string?
  [namespace-name :- string?]
  (-> namespace-name
      (str/replace #"^metabase-enterprise\." "")
      ;; "sandbox.api.table" => "sandbox table"
      (str/replace #"\.api\." " ")
      ;; "serialization.api" => "serialization"
      (str/replace #"\.api" "")
      ;; (for metabase-enterprise.sso.api.sso) "sso sso" => "sso"
      (str/replace #"sso sso" "sso")))

(mu/defn- oss-page-name :- string?
  [namespace-name :- string?]
  (last (str/split namespace-name #"\.")))

(def ^:private initialisms
  "Used to format initialisms/acronyms in generated docs."
  '["SSO" "SAML" "GTAP" "LDAP" "SQL" "JSON" "API" "LLM" "SCIM"])

(def ^:private initialisms-pattern
  (re-pattern (str "(?i)(?:" (str/join "|" (map #(str % "\\b") initialisms)) ")")))

(mu/defn- capitalize-initialisms :- string?
  "Converts initialisms to upper case."
  [page-name :- string?]
  (str/replace page-name initialisms-pattern u/upper-case-en))

(mu/defn- ns-symbol->page-name :- ::page-name
  "Generate a page name based on a namespace symbol.

    (ns-symbol->page-name 'metabase.api.table)                    ; => \"Table\"
    (ns-symbol->page-name 'metabase-enterprise.sandbox.api.table) ; => \"Sandbox table\""
  [ns-symb :- symbol?]
  (let [namespace-name (name ns-symb)
        page-name      (if (str/includes? namespace-name "metabase-enterprise")
                         (enterprise-page-name namespace-name)
                         (oss-page-name namespace-name))]
    (-> page-name
        (str/replace #"-" " ")
        u/capitalize-first-char
        capitalize-initialisms)))

(mu/defn- endpoint->page-name :- ::page-name
  "Creates a name for endpoints in a namespace, like all the endpoints for Alerts. Handles some edge cases for
  enterprise endpoints."
  [endpoint :- ::endpoint]
  (-> endpoint :ns ns-name ns-symbol->page-name))

(def ^:private api-namespace-pattern
  "Regular expression to match endpoints. Needs to match namespaces like:
   - metabase.api.search
   - metabase-enterprise.serialization.api
   - metabase.api.api-key"
  #"^metabase(?:-enterprise\.[\w-]+)?\.api(?:\.[\w-]+)?$")

(mu/defn- api-namespace-symbols :- [:sequential symbol?]
  []
  (for [ns-symb (ns.find/find-namespaces (classpath/system-classpath))
        :when   (and (re-find api-namespace-pattern (name ns-symb))
                     (not (str/includes? (name ns-symb) "test")))]
    ns-symb))

(mu/defn- defendpoint-1-sort-key :- ::endpoint-sort-key
  [{:keys [path method], :as _metadata}]
  (let [path-and-params (if (sequential? path)
                          (into [(first path)] cat (into (sorted-map)
                                                         (comp (partition-all 2)
                                                               (map (fn [[k regex]]
                                                                      [k (str regex)])))
                                                         (rest path)))
                          [path])]
    (into [method] path-and-params)))

(mu/defn- defendpoint-2-sort-key :- ::endpoint-sort-key
  "Create a sort key based on the [[metabase.api.macros/defendpoint-unique-key]] for this endpoint."
  [[method route regexes :as _unique-key] :- :metabase.api.macros/unique-key]
  (into [method route] cat (into (sorted-map) regexes)))

(mu/defn- ns-defendpoint-1-metadatas :- [:sequential ::endpoint]
  "Get metadatas for endpoints defined by legacy [[metabase.api.common/defendpoint]]."
  [ns-symb]
  (keep (fn [[_symb varr]]
          (when (:is-endpoint? (meta varr))
            (assoc (meta varr) ::sort-key (defendpoint-1-sort-key (meta varr)))))
        (ns-interns ns-symb)))

(mu/defn- ns-defendpoint-2-metadatas :- [:sequential ::endpoint]
  "Get metadatas for endpoints defined by [[metabase.api.macros/defendpoint]] (\"defendpoint 2.0\")."
  [ns-symb]
  (mapv (fn [[k metadata]]
          (assoc (:form metadata)
                 ::sort-key (defendpoint-2-sort-key k)
                 :ns        (the-ns ns-symb)
                 :doc       (api.macros/defendpoint-dox (:form metadata))))
        (:api/endpoints (meta (the-ns ns-symb)))))

(mu/defn- ns-endpoints :- [:sequential ::endpoint]
  "Return a sorted sequence of metadata maps for the endpoints in a namespace."
  [ns-symb]
  (classloader/require ns-symb)
  (->> (concat (ns-defendpoint-1-metadatas ns-symb)
               (ns-defendpoint-2-metadatas ns-symb))
       (sort-by ::sort-key)))

(mu/defn- all-endpoints :- [:sequential ::endpoint]
  "Returns a sorted sequence of metadata maps for all API endpoints."
  []
  (mapcat ns-endpoints (api-namespace-symbols)))

(mu/defn- endpoint-str :- string?
  "Creates a name for an endpoint: VERB /path/to/endpoint.
  Used to build anchor links in the table of contents."
  [endpoint :- ::endpoint]
  (-> (:doc endpoint)
      (str/split #"\n")
      first
      str/trim))

(mu/defn- paid?
  "Is the endpoint a paid feature?"
  [endpoint :- ::endpoint]
  (let [endpoint-str (endpoint-str endpoint)]
    (or (str/includes? endpoint-str "/api/ee")
        ;; some ee endpoints are inconsistent in naming, see #22687
        (str/includes? endpoint-str "/api/mt")
        (= 'metabase-enterprise.sandbox.api.table (ns-name (:ns endpoint)))
        (str/includes? endpoint-str "/auth/sso")
        (str/includes? endpoint-str "/api/moderation-review"))))

(mu/defn- page :- ::page
  [page-name :- ::page-name
   endpoints :- [:sequential ::endpoint]]
  {:name      page-name
   :ns        (:ns (first endpoints))
   :paid?     (boolean (paid? (first endpoints)))
   :endpoints endpoints})

(mu/defn- endpoints->pages :- ::pages
  [endpoints :- [:sequential ::endpoint]]
  (->> endpoints
       (group-by endpoint->page-name)
       (sort-by (fn [[page-name _metadatas]]
                  (u/lower-case-en page-name)))
       (map (fn [[page-name endpoints]]
              (page page-name endpoints)))))

(mu/defn all-pages :- ::pages
  "Get sorted metadata for all the pages we want to generate API documentation for."
  []
  (endpoints->pages (all-endpoints)))

(comment
  (ns-endpoints 'metabase.api.timeline)

  (endpoints->pages (ns-endpoints 'metabase.api.timeline)))
