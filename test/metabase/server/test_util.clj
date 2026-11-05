(ns metabase.server.test-util
  (:require
   [clj-http.client :as http]
   [metabase.server.instance :as server.instance]))

(set! *warn-on-reflection* true)

(defn do-with-test-server
  "Call `f` with the base URL of a temporary Jetty server running `handler`, then stop the server."
  [handler f]
  (let [server (server.instance/create-server (bound-fn [request respond raise]
                                                (handler request respond raise))
                                              {:port 0 :join? false})]
    (try
      (.start server)
      (f (str "http://localhost:" (.. server getURI getPort)))
      (finally
        (.stop server)))))

(defmacro with-test-server
  "Run `body` with `url` bound to the base URL of a temporary Jetty server running `handler`."
  [[url handler] & body]
  `(do-with-test-server ~handler (fn [~url] ~@body)))

(defn request
  "Make an HTTP request to `path` on a test server, with optional clj-http `options`."
  [url method path & [options]]
  (http/request (merge {:url                (str url path)
                        :method             method
                        :decompress-body    false
                        :connection-timeout 5000
                        :socket-timeout     5000}
                       options)))
