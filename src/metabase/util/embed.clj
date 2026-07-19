(ns metabase.util.embed
  "Utility functions for public links and embedding."
  (:require
   [hiccup.core :refer [html]]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(defn- oembed-url
  "Return an oEmbed URL for the `relative-path`.

     (oembed-url \"http://localhost:3000\" \"/x\") -> \"http://localhost:3000/api/public/oembed?url=x&format=json\""
  ^String [^String site-url ^String relative-url]
  (str site-url
       "/api/public/oembed"
       ;; NOTE: some oEmbed consumers require `url` be the first param???
       "?url=" (codec/url-encode (str site-url relative-url))
       "&format=json"))

(defn- oembed-link
  "Returns a `<link>` tag for oEmbed support."
  ^String [^String site-url ^String url]
  (html [:link {:rel   "alternate"
                :type  "application/json+oembed"
                :href  (oembed-url site-url url)
                :title "Metabase"}]))

(def ^:private ^:const ^String embedly-meta
  "A `<meta>` tag for `Embed.ly` support."
  (html [:meta {:name "generator", :content "Metabase"}]))

(defn head
  "Returns the `<meta>`/`<link>` tags for an embeddable public page.
  Takes `site-url` as an argument because `util` sits below `system` in the module graph."
  ^String [^String site-url ^String url]
  (str embedly-meta (oembed-link site-url url)))

(defn maybe-populate-initially-published-at
  "Populate `initially_published_at` if embedding is set to true"
  [{:keys [enable_embedding initially_published_at] :as card-or-dashboard}]
  (cond-> card-or-dashboard
    (and (true? enable_embedding) (nil? initially_published_at))
    (assoc :initially_published_at :%now)))
