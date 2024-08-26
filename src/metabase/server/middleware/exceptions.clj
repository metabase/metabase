(ns metabase.server.middleware.exceptions
  "Ring middleware for handling Exceptions thrown in API request handler functions."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.server.middleware.security :as mw.security]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

(declare api-exception-response)

(defn public-exceptions
  "Catch any exceptions other than 404 thrown in the request handler body and rethrow a generic 400 exception instead.
  This minimizes information available to bad actors when exceptions occur on public endpoints."
  [handler]
  (fn [request respond _raise]
    (let [raise (fn [e]
                  (log/warn e "Exception in API call")
                  (if (= 404 (:status-code (ex-data e)))
                    (respond {:status 404, :body (deferred-tru "Not found.")})
                    (respond {:status 400, :body (deferred-tru "An error occurred.")})))]
      (try
        (handler request respond raise)
        (catch Throwable e
          (raise e))))))

(defn message-only-exceptions
  "Catch any exceptions thrown in the request handler body and rethrow a 400 exception that only has the message from
  the original instead (i.e., don't rethrow the original stacktrace). This reduces the information available to bad
  actors but still provides some information that will prove useful in debugging errors."
  [handler]
  (fn [request respond _raise]
    (let [raise (fn [^Throwable e]
                  (respond {:status 400, :body (ex-message e)}))]
      (try
        (handler request respond raise)
        (catch Throwable e
          (log/error e "Exception in API call")
          (raise e))))))

(defmulti api-exception-response
  "Convert an uncaught exception from an API endpoint into an appropriate format to be returned by the REST API (e.g. a
  map, which eventually gets serialized to JSON, or a plain string message)."
  {:arglists '([e])}
  class)

(defmethod api-exception-response Throwable
  [^Throwable e]
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
                                           other-info))]
    {:status  (or status-code 500)
     :headers (mw.security/security-headers)
     :body    body}))

(defmethod api-exception-response SQLException
  [e]
  (-> ((get-method api-exception-response (.getSuperclass SQLException)) e)
      (assoc-in [:body :sql-exception-chain] (str/split (with-out-str (jdbc/print-sql-exception-chain e))
                                                        #"\s*\n\s*"))))

(defmethod api-exception-response EofException
  [_e]
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
     (comp respond api-exception-response))))

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
