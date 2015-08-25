(ns metabase.routes
  (:require [cheshire.core :as cheshire]
            [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.util.response :as resp]
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            [metabase.setup :as setup]
            [metabase.util :as u]))

(defn- load-index-template
  "Slurp in the Metabase index.html file as a `String`"
  []
  (slurp (clojure.java.io/resource "frontend_client/index.html")))

(def load-index
  "Memoized version of `load-index-template`"
  ;(memoize load-index-template)
  load-index-template)

(def date-format-rfc2616
  "Java SimpleDateFormat representing rfc2616 style date used in http headers."
  "EEE, dd MMM yyyy HH:mm:ss zzz")

(def index-page-vars
  "Static values that we inject into the index.html page via Mustache."
  {:ga_code "UA-60817802-1"
   :intercom_code "gqfmsgf1"
   :anon_tracking_enabled (metabase.models.setting/get :anon-tracking-enabled)
   :site_name (metabase.models.setting/get :site-name)})

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(let [redirect-to-setup? (fn [{:keys [uri]}]
                           (and (setup/incomplete?)
                                (not (re-matches #"^/setup/.*$" uri))))
      index (fn [request]
              (if (redirect-to-setup? request) (resp/redirect (format "/setup/init/%s" (setup/token-value)))
                  (-> (resp/response (stencil/render-string
                                       (load-index)
                                       {:bootstrap_json (cheshire/generate-string index-page-vars)}))
                      (resp/content-type "text/html")
                      (resp/header "Last-Modified" (u/now-with-format date-format-rfc2616)))))]
  (defroutes routes
    (GET "/" [] index)                                     ; ^/$           -> index.html
    (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
    (context "/api" [] api/routes)                         ; ^/api/        -> API routes
    (context "/app" []
      (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
      (route/not-found {:status 404                        ;                  return 404 for anything else starting with ^/app/ that doesn't exist
                        :body "Not found."}))
    (GET "*" [] index)))                                   ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
