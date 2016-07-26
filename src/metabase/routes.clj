(ns metabase.routes
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [metabase.api.routes :as api]
            [metabase.models.setting :as setting]
            [metabase.util :as u]
            (ring.util [io :as ring-io]
                       [response :as resp])
            [stencil.core :as stencil]))

(defn- index [_]
  (-> (if ((resolve 'metabase.core/initialized?))
        (stencil/render-string (slurp (or (io/resource "frontend_client/index.html")
                                          (throw (Exception. "Cannot find './resources/frontend_client/index.html'. Did you remember to build the Metabase frontend?"))))
                               {:bootstrap_json (json/generate-string (setting/public-settings))})
        (slurp (io/resource "frontend_client/init.html")))
      resp/response
      (resp/content-type "text/html")))

(defn- some-very-long-handler [_]
  (Thread/sleep 30000)
  {:success true})

(defn- some-naughty-handler-that-barfs [_]
  (throw (Exception. "BARF!")))

(def ^:private ^:const streaming-response-keep-alive-interval-ms
  "Interval between sending whitespace bytes to keep Heroku from terminating
   requests like queries that take a long time to complete."
  (* 20 1000)) ; every 20 ms

(defn- streaming-response [handler]
  (fn [request]
    ;; TODO - need maximum timeout for requests
    ;; TODO - error response should have status code != 200 (how ?)
    ;; TODO - handle exceptions in JSON encoding as well
    (-> (fn [^java.io.PipedOutputStream ostream]
          (let [response       (future (try (handler request)
                                            (catch Throwable e
                                              {:error      (.getMessage e)
                                               :stacktrace (u/filtered-stacktrace e)})))
                write-response (future (json/generate-stream @response (io/writer ostream))
                                       (println "Done! closing ostream...")
                                       (.close ostream))]
            (loop []
              (Thread/sleep streaming-response-keep-alive-interval-ms)
              (when-not (realized? response)
                (println "Response not ready, writing one byte & sleeping...")
                (.write ostream (byte \ ))
                (.flush ostream)
                (recur)))))
        ring-io/piped-input-stream
        resp/response
        (resp/content-type "application/json"))))

;; Redirect naughty users who try to visit a page other than setup if setup is not yet complete
(defroutes ^{:doc "Top-level ring routes for Metabase."} routes
  (GET "/" [] index)                                     ; ^/$           -> index.html
  (GET "/favicon.ico" [] (resp/resource-response "frontend_client/favicon.ico"))
  (context "/api" [] api/routes)                         ; ^/api/        -> API routes
  (context "/app" []
    (route/resources "/" {:root "frontend_client/app"})  ; ^/app/        -> static files under frontend_client/app
    (route/not-found {:status 404                        ; return 404 for anything else starting with ^/app/ that doesn't exist
                      :body "Not found."}))
  (context "/stream-test" []
    (streaming-response some-very-long-handler))
  (context "/stream-test-2" []
      (streaming-response some-naughty-handler-that-barfs))
  (GET "*" [] index))                                    ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest
