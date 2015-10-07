(ns metabase.routes
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            (ring.util [io :as ring-io]
                       [response :as resp])
            [stencil.core :as stencil]
            [metabase.api.routes :as api]
            [metabase.models.setting :as setting]))

(defn- index [_]
  (-> (io/resource "frontend_client/index.html")
      slurp
      (stencil/render-string {:bootstrap_json (json/generate-string (setting/public-settings))})
      resp/response
      (resp/content-type "text/html")
      (resp/header "Last-Modified" "{now} GMT")))

(defn- some-very-long-handler [_]
  (Thread/sleep 3000)
  {:success true})

(defn- streaming-response [handler]
  (fn [request]
    ;; TODO - handle exceptions  & have some sort of maximum timeout for these requests
    (let [response (future (handler request))
          f        (fn [^java.io.PipedOutputStream ostream]
                     (if (realized? response)
                       (json/generate-stream @response (io/writer ostream))
                       (do
                         (println "Response not ready, writing one byte & sleeping 500ms...")
                         (.write ostream (byte \ ))
                         (.flush ostream)
                         (Thread/sleep 500)
                         (recur ostream))))]
      (-> (resp/response (ring-io/piped-input-stream f))
          (resp/content-type "application/json")))))

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(defroutes routes
  (GET "/" [] index)                                     ; ^/$           -> index.html
  (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
  (context "/api" [] api/routes)                         ; ^/api/        -> API routes
  (context "/app" []
    (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
    (route/not-found {:status 404                        ; return 404 for anything else starting with ^/app/ that doesn't exist
                      :body "Not found."}))
  (context "/stream-test" []
    (streaming-response some-very-long-handler))
  (GET "*" [] index))                                    ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
