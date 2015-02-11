(ns metabase.api.common.internal
  "Internal functions used by `metabase.api.common`.")

(defn wrap-response-if-needed
  "If RESPONSE isn't already a map with keys :status and :body, wrap it in one (using status 200)."
  [response]
  (letfn [(is-wrapped? [resp] (and (map? resp)
                                   (:status resp)
                                   (:body resp)))]
    (if (is-wrapped? response) response
        {:status 200
         :body response})))

(defn route-fn-name
  "Generate a symbol suitable for use as the name of an API endpoint fn.
   Name is just METHOD + ROUTE with slashes replaced by underscores.
   `(route-fn-name GET \"/:id\") -> GET_:id`"
  [method route]
  (-> (str (name method) route)
      (^String .replace "/" "_")
      symbol))
