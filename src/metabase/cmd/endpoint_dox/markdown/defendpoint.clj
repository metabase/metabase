(ns metabase.cmd.endpoint-dox.markdown.defendpoint
  "Code related to generating a Hiccup-style Markdown node tree for generating API documentation from
  [[metabase.api.macros/defendpoint]] endpoints. See [[metabase.cmd.endpoint-dox.markdown.generate]] for all the known
  Markdown node types."
  (:require
   [metabase.api.macros]
   [metabase.cmd.endpoint-dox.markdown.schema :as endpoint-dox.markdown.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- params-of-type-dox [parsed-args title param-type]
  (when-let [schema (get-in parsed-args [:params param-type :schema])]
    [[:h4 title]
     (endpoint-dox.markdown.schema/schema->html schema)]))

(defn- params-dox [parsed-args]
  (let [route (params-of-type-dox parsed-args "Route parameters" :route)
        query (params-of-type-dox parsed-args "Query parameters" :query)
        body  (params-of-type-dox parsed-args "Request body" :body)]
    (when (or route query body)
      [[:h3 "Params"]
       route
       query
       body])))

(defn- response-dox [parsed-args]
  (when-let [response-schema (:response-schema parsed-args)]
    [[:h3 "Response"]
     (endpoint-dox.markdown.schema/schema->html response-schema)]))

(mu/defn defendpoint-dox :- any?
  "Generate Markdown-formatted documentation for an API endpoint based on parsed `args`. This is used to generate the
  documentation in `docs/api`. See [[metabase.cmd.endpoint-dox.metadata]]."
  {:style/indent [:form]}
  [parsed-args :- :metabase.api.macros/parsed-args]
  (letfn []
    [[:h2 [:code
           (u/upper-case-en (name (:method parsed-args)))
           (get-in parsed-args [:route :path])]]
     (:docstr parsed-args)
     ;; TODO -- permissions inference like must be superuser
     (params-dox parsed-args)
     (response-dox parsed-args)]))

;;;;
;;;; Example usages
;;;;

(comment
  (defendpoint-dox (:form (metabase.api.macros/find-route 'metabase.api.timeline :get "/")))

  (defendpoint-dox (:form (metabase.api.macros/find-route 'metabase.api.timeline :get "/:id")))

  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (metabase.cmd.endpoint-dox.markdown.generate/print-markdown
   (defendpoint-dox (:form (metabase.api.macros/find-route 'metabase.api.timeline :get "/:id"))))

  #_(with-open [os (java.io.FileWriter. "dox.md")]
      (binding [*out* os]
        (metabase.cmd.endpoint-dox.markdown.generate/print-markdown
         (defendpoint-dox (:form (metabase.api.macros/find-route 'metabase.api.timeline :get "/:id"))))))

  #_{:clj-kondo/ignore [:unresolved-namespace]}
  (spit "dox.md"
        (metabase.cmd.endpoint-dox.markdown.generate/->markdown
         (defendpoint-dox (:form (metabase.api.macros/find-route 'metabase.api.timeline :get "/:id")))))
  ;; Then:
  ;; markdown dox.md > dox.html
  ;; wslview dox.html
  )

;;; PLEASE DON'T ADD ANY MORE CODE AFTER THE EXAMPLE USAGES ABOVE, GO ADD IT SOMEWHERE ELSE.
