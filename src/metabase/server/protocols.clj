(ns metabase.server.protocols
  (:require [potemkin.types :as p.types]
            [ring.util.servlet :as servlet]))

(p.types/defprotocol+ Respond
  "Protocol for converting API endpoint responses to something Jetty can handle."
  (respond [body context]
    "Convert an API endpoint response to something Jetty-friendly. Default impl uses Ring functionality to write the
  response to a Jetty `OutputStream`. Things that need more advanced functionality than what Ring provides (such as
  the streaming response logic) provide their own custom implementations of this method.

  `context` has the following keys:

  * `:request`       -- `javax.servlet.http.HttpServletRequest`
  * `:request-map`   -- Ring request map
  * `:async-context` -- `javax.servlet.AsyncContext`
  * `:response`      -- `javax.servlet.http.HttpServletResponse`
  * `:response-map`  -- Ring response map"))

(extend-protocol Respond
  nil
  (respond [_ {:keys [async-context response response-map]}]
    (servlet/update-servlet-response response async-context response-map))

  Object
  (respond [_ {:keys [async-context response response-map]}]
    (servlet/update-servlet-response response async-context response-map)))
