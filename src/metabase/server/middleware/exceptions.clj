(ns metabase.server.middleware.exceptions
  "Ring middleware for handling Exceptions thrown in API request handler functions."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.request.core :as request]
   [metabase.server.middleware.security :as mw.security]
   [metabase.server.settings :as server.settings]
   [metabase.util :as u]
   [metabase.util.api-error :as api-error]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log])
  (:import
   (java.sql SQLException)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

(declare api-exception-response)

(def ^:private cors-key ::cors)

(defn- security-headers [request]
  (mw.security/security-headers :origin (get-in request [:headers "origin"])
                                :cors (get request cors-key)))

(defmulti api-exception-response
  "Convert an uncaught exception from an API endpoint into an appropriate format to be returned by the REST API (e.g. a
  map, which eventually gets serialized to JSON, or a plain string message). `request` is the Ring request that
  triggered the exception, for methods that want to include request info in their logging."
  {:arglists '([e request])}
  (fn [e _request]
    (class e)))

(defmethod api-exception-response Throwable
  [^Throwable e request]
  (let [{:keys [status-code], :as info} (ex-data e)
        ;; only the keys the throw site listed go to the client; the rest is server-side context. See
        ;; [[metabase.util.api-error]]
        api-data                        (api-error/response-data info)
        body                            (cond
                                          (and status-code (not= status-code 500) (empty? api-data))
                                          ;; If status code was specified (but not a 500 -- an unexpected error), and
                                          ;; there is nothing client-facing in the ex-data, it's something like a 404.
                                          ;; Return message as the (plain-text) body.
                                          (.getMessage e)

                                          ;; if the response includes `:errors`, (e.g., it's something like a generic
                                          ;; parameter validation exception), just return the client-facing data.
                                          (and status-code (:errors api-data))
                                          api-data

                                          ;; a machine-readable error code means the throw site authored this as an
                                          ;; API response; return it without a stacktrace
                                          (and status-code (not= status-code 500) (:error-code api-data))
                                          (merge {:message (ex-message e)} api-data)

                                          ;; allow administrators to configure their instances to suppress stacktraces
                                          ;; returns 500 with a generic message
                                          (server.settings/hide-stacktraces)
                                          {:message (tru "Something went wrong")}

                                          ;; Otherwise return the `Throwable->map` representation with Stacktrace
                                          ;; and the client-facing ex-data
                                          :else
                                          (merge
                                           (api-error/throwable->map e)
                                           {:message (.getMessage e)}
                                           api-data))]
    (when (nil? status-code)
      (analytics/inc! :metabase-api/unhandled-errors))
    {:status  (or status-code 500)
     :headers (security-headers request)
     :body    body}))

(defmethod api-exception-response SQLException
  [e request]
  (-> ((get-method api-exception-response (.getSuperclass SQLException)) e request)
      (assoc-in [:body :sql-exception-chain] (str/split (with-out-str (jdbc/print-sql-exception-chain e))
                                                        #"\s*\n\s*"))))

(defmethod api-exception-response EofException
  [_e {:keys [request-method uri], :as request}]
  (log/infof "Request canceled before finishing: %s %s from client %s"
             (or (some-> request-method name u/upper-case-en) "?")
             uri
             (or (request/ip-address request) "unknown"))
  {:status-code 204, :body nil, :headers (security-headers request)})

(defn catch-api-exceptions
  "Middleware (with `[request respond raise]`) that catches API Exceptions and returns them in our normal-style format rather than the Jetty 500
  Stacktrace page, which is not so useful for our frontend."
  ([handler]
   (catch-api-exceptions handler nil))
  ([handler cors]
   (fn [request respond _raise]
     (handler
      request
      respond
      #(respond (api-exception-response % (assoc request cors-key cors)))))))

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
