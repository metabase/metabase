(ns metabase.channel.email.logo
  (:require
   [clojure.string :as str]
   [metabase.channel.render.core :as channel.render]
   [metabase.util.jvm :as u.jvm]))

(set! *warn-on-reflection* true)

(def ^:private data-uri-pattern
  #"^data:([^;]+);base64,(.+)$")

(defn- parse-data-uri
  "Parse a data URI and return {:content-type <string> :bytes <byte-array>}, or nil if not a data URI."
  [data-uri]
  (when-let [[_ content-type base64-data] (re-matches data-uri-pattern data-uri)]
    {:content-type content-type
     :bytes        (u.jvm/decode-base64-to-bytes base64-data)}))

(defn logo-bundle
  "Create a logo bundle from the application logo URL.
   Returns {:image-src <url-or-cid> :attachment <attachment-map-or-nil>}.
   For data URIs, converts to an embedded attachment for email compatibility.
   For the default logo asset path, uses the static Metabase logo URL."
  [logo-url]
  (cond
    (nil? logo-url)
    nil

    (= logo-url "app/assets/img/logo.svg")
    {:image-src  "http://static.metabase.com/email_logo.png"
     :attachment nil}

    (str/starts-with? logo-url "data:")
    (when-let [{:keys [bytes]} (parse-data-uri logo-url)]
      (let [bundle (channel.render/make-image-bundle :attachment bytes)]
        {:image-src  (:image-src bundle)
         :attachment (channel.render/image-bundle->attachment bundle)}))

    :else
    {:image-src logo-url
     :attachment nil}))
