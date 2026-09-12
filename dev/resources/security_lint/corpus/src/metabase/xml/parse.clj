(ns metabase.xml.parse
  "Security-lint test example: XML and transport-security sinks."
  (:require
   [clojure.data.xml :as xml]
   [metabase.api.macros :as api.macros])
  (:import (javax.net.ssl HttpsURLConnection X509TrustManager)))

(api.macros/defendpoint :post "/xml"
  "Parses caller-supplied XML."
  [_route _query {:keys [doc]}]
  (xml/parse-str doc))

(defn trust-everything []
  (reify X509TrustManager
    (checkServerTrusted [_ _ _] nil)))

(defn disable-hostname-check [v]
  (HttpsURLConnection/setDefaultHostnameVerifier v))

(defn jitter [] (java.util.Random.))
