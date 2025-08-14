(ns metabase.server.middleware.exceptions
  "Ring middleware for handling Exceptions thrown in API request handler functions."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.server.middleware.security :as mw.security]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

(declare api-exception-response)

(defmulti api-exception-response
  "Convert an uncaught exception from an API endpoint into an appropriate format to be returned by the REST API (e.g. a
  map, which eventually gets serialized to JSON, or a plain string message)."
  {:arglists '([e])}
  (fn [_req ex] (class ex)))

(def ^:private resource-patterns
  [
   #"^/api/card"
   #"^/api/collection"
   #"^/api/dashboard"
   #"^/api/database"
   #"^/api/snippet"
   #"^/api/user"
   ])

(defn- resource-url? [path]
  (boolean (some #(re-find % path) resource-patterns)))

(defmethod api-exception-response Throwable
  [req ^Throwable e]
  (let [{:keys [status-code], :as info} (ex-data e)
        other-info                      (dissoc info :status-code :schema :type :toucan2/context-trace)
        body                            (cond
                                          (and status-code (not= status-code 500) (empty? other-info))
                                          ;; If status code was specified (but not a 500 -- an unexpected error, and
                                          ;; other data wasn't, it's something like a 404. Return message as
                                          ;; the (plain-text) body.
                                          (.getMessage e)

                                          ;; if the response includes `:errors`, (e.g., it's something like a generic
                                          ;; parameter validation exception), just return the `other-info` from the
                                          ;; ex-data.
                                          (and status-code (:errors other-info))
                                          other-info

                                          ;; Otherwise return the full `Throwable->map` representation with Stacktrace
                                          ;; and ex-data
                                          :else
                                          (merge
                                           (Throwable->map e)
                                           {:message (.getMessage e)}
                                           other-info))
        path (or (:path-info req)
                 (:uri req))]
    ;; rewrite real 404s and 403s into one response
    (if (and (some-> e ex-data :status-code #{403 404})
             (not= (ex-message e) "The object has been archived.")
             ;; interpret an integer as a resource
             (or (some->> path (re-find #"\d+"))
                 (some->> path resource-url?)))
      {:status  404
       :headers (mw.security/security-headers)
       :body    "You don't have permissions to see that or it doesn't exist"}
      {:status  (or status-code 500)
       :headers (mw.security/security-headers)
       :body    body})))

(defmethod api-exception-response SQLException
  [_req e]
  (-> ((get-method api-exception-response (.getSuperclass SQLException)) e)
      (assoc-in [:body :sql-exception-chain] (str/split (with-out-str (jdbc/print-sql-exception-chain e))
                                                        #"\s*\n\s*"))))

(defmethod api-exception-response EofException
  [_req _e]
  (log/info "Request canceled before finishing.")
  {:status-code 204, :body nil, :headers (mw.security/security-headers)})

(defn catch-api-exceptions
  "Middleware (with `[request respond raise]`) that catches API Exceptions and returns them in our normal-style format rather than the Jetty 500
  Stacktrace page, which is not so useful for our frontend."
  [handler]
  (fn [request respond _raise]
    (handler
     request
     respond
     (comp respond (partial api-exception-response request)))))

(defn catch-uncaught-exceptions
  "Middleware (with `[request respond raise]`) that catches any unexpected Exceptions and reroutes them through `raise`
  where they can be handled appropriately."
  [handler]
  (fn [request respond raise]
    (try
      (handler
       request
       ;; for people that accidentally pass along an Exception, e.g. from qp.async, do the nice thing and route it to
       ;; the right place for them
       (fn [response]
         ((if (instance? Throwable response)
            raise
            respond) response))
       raise)
      (catch Throwable e
        (raise e)))))
