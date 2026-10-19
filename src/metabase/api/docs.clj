(ns metabase.api.docs
  "OpenAPI documentation for our API."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [metabase.api.docs.regenerate]
   [metabase.api.open-api :as open-api]
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [potemkin :as p]
   [ring.middleware.content-type :as content-type]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

;; kept on this namespace so existing callers (metabase.api-routes.cmd) are unaffected by the split
(p/import-vars
 [metabase.api.docs.regenerate
  openapi-file-path
  request-spec-regeneration!
  write-openapi-spec-to-file!])

(defn- read-openapi-spec-from-file
  "Read the OpenAPI specification from the local file.
  Returns the parsed JSON content, or nil if the file doesn't exist or can't be read."
  []
  (try
    (let [file (io/file openapi-file-path)]
      (when (.exists ^java.io.File file)
        (with-open [f (io/reader file)]
          (json/decode+kw f))))
    (catch Throwable e
      (log/errorf "Failed to read OpenAPI specification from file: %s" (ex-message e))
      nil)))

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
         (assoc-in [:headers "Content-Security-Policy"] "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net"))))

  ([request respond raise]
   (try
     (respond (index-handler request))
     (catch Throwable e
       (raise e)))))

(defn- json-handler
  "Given the [[metabase.api-routes.core/routes]] handler, return a Ring handler that returns `openapi.json`.
  Attempts to read from the local file first; if not available, generates on-the-fly."
  [root-handler]
  (fn handler*
    ([_request]
     (let [spec (or (when (config/config-bool :mb-enable-openapi-auto-regen)
                      (read-openapi-spec-from-file))
                    (do
                      (log/warn "OpenAPI spec file not found, generating on-the-fly")
                      (merge
                       (open-api/root-open-api-object root-handler)
                       {:servers [{:url         ""
                                   :description "Metabase API"}]})))]
       {:status 200
        :body   spec}))

    ([request respond raise]
     (try
       (respond (handler* request))
       (catch Throwable e
         (raise e))))))

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

(defn make-routes
  "/api/docs routes. Takes the [[metabase.api-routes.core/routes]] handler and returns a Ring handler with the signature

    (handler request respond raise)"
  [root-handler]
  (open-api/handler-with-open-api-spec
   (handlers/routes
    (GET "/" [] #'index-handler)
    (GET "/openapi.json" [] (json-handler root-handler))
    #'redirect-handler)
   ;; don't generate a spec for these routes
   (fn [_prefix]
     nil)))
