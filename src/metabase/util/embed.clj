(ns metabase.util.embed
  "Util fns for generating the HTML and metadata used in oEmbed embed code for endpoints like `GET /api/public/oembed`."
  (:require [ring.util.codec :as codec]
            [hiccup.core :refer [html]]
            [metabase.public-settings :as public-settings]))

(defn- oembed-url
  "Return an oEmbed URL for the RELATIVE-PATH.

     (oembed-url \"/x\") -> \"http://localhost:3000/api/public/oembed?url=x&format=json\""
  ^String [^String relative-url]
  (str (public-settings/site-url)
       "/api/public/oembed"
       ;; NOTE: some oEmbed consumers require `url` be the first param???
       "?url=" (codec/url-encode (str (public-settings/site-url) relative-url))
       "&format=json"))

(defn- oembed-link
  "Returns a `<link>` tag for oEmbed support."
  ^String [^String url]
  (html [:link {:rel   "alternate"
                :type  "application/json+oembed"
                :href  (oembed-url url)
                :title "Metabase"}]))

(def ^:private ^:const ^String embedly-meta
  "A `<meta>` tag for `Embed.ly` support."
  (html [:meta {:name "generator", :content "Metabase"}]))

(defn head
  "Returns the <meta>/<link> tags for an embeddable public page"
  ^String [^String url]
  (str embedly-meta (oembed-link url)))

(defn iframe
  "Return an `<iframe>` HTML fragment to embed a public page."
  ^String [^String url, width height]
  (html [:iframe {:src         url
                  :width       width
                  :height      height
                  :frameborder 0}]))
