(ns metabase.notify.payload
  "Security-lint test example: deserialization, regex and outbound-HTTP sinks fed from a request."
  (:require
   [clj-http.client :as http]
   [metabase.api.macros :as api.macros]
   [taoensso.nippy :as nippy]))

(api.macros/defendpoint :post "/thaw"
  "Deserializes caller-supplied bytes."
  [_route _query {:keys [blob pattern url]}]
  [(nippy/thaw blob)
   (re-pattern pattern)
   (http/get url)
   (http/get "https://internal.example/health")
   (http/get "https://internal.example/x" {:insecure? true})])

(defn parse-config [s] (read-string s))
(defn parse-fixed [] (read-string "{:a 1}"))
