(ns metabase.api.docs
  "OpenAPI documentation for our API."
  (:require
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [metabase.api.open-api :as open-api]
   [metabase.api.util.handlers :as handlers]
   [ring.middleware.content-type :as content-type]
   [ring.util.response :as response]))

(defn- index-handler
  "OpenAPI 3.1.0 JSON and UI

  https://spec.openapis.org/oas/latest.html"
  ([{:keys [uri], :as _request}]
   ;; /api/docs (no trailing slash) needs to redirect to /api/docs/ (with trailing slash) for the JS to work
   ;; correctly... returning `nil` here will cause the request to fall thru to [[redirect-handler]]
   (when (str/ends-with? uri "/")
     (-> (response/resource-response "openapi/index.html")
         (content-type/content-type-response {:uri "index.html"})
         ;; Better would be to append this to our CSP, but there is no good way right now and it's just a single page.
         ;; Necessary for Scalar to work, script injects styles in runtime.
         (assoc-in [:headers "Content-Security-Policy"] "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net"))))

  ([request respond raise]
   (try
     (respond (index-handler request))
     (catch Throwable e
       (raise e)))))

(defn- json-handler
  "Return `openapi.json`."
  ([_request]
   {:status 200
    :body  (merge
            (open-api/root-open-api-object (requiring-resolve 'metabase.api.routes/routes))
            {:servers [{:url         ""
                        :description "Metabase API"}]})})

  ([request respond raise]
   (try
     (respond (json-handler request))
     (catch Throwable e
       (raise e)))))

(defn- redirect-handler
  ([_request]
   {:status  302
    :headers {"Location" "/api/docs/"}
    :body    ""})

  ([request respond raise]
   (try
     (respond (redirect-handler request))
     (catch Throwable e
       (raise e)))))

(def ^{:arglists '([request respond raise])} routes
  "/api/docs routes"
  (open-api/handler-with-open-api-spec
   (handlers/routes
    (GET "/" [] #'index-handler)
    (GET "/openapi.json" [] #'json-handler)
    #'redirect-handler)
   ;; don't generate a spec for these routes
   (fn [_prefix]
     nil)))
