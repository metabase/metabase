(ns metabase.util.embed
  "Utility functions for public links and embedding."
  (:require
   [hiccup.core :refer [html]]
   [metabase.settings.deprecated-grab-bag :as public-settings]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(defn- oembed-url
  "Return an oEmbed URL for the `relative-path`.

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
  "Returns the `<meta>`/`<link>` tags for an embeddable public page."
  ^String [^String url]
  (str embedly-meta (oembed-link url)))

(defn maybe-populate-initially-published-at
  "Populate `initially_published_at` if embedding is set to true"
  [{:keys [enable_embedding initially_published_at] :as card-or-dashboard}]
  (cond-> card-or-dashboard
    (and (true? enable_embedding) (nil? initially_published_at))
    (assoc :initially_published_at :%now)))
