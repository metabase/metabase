(ns metabase-enterprise.custom-viz-plugin.csp
  "EE implementation of the custom-viz dev-server CSP `connect-src` lookup declared in
   [[metabase.server.middleware.security]]. Kept separate from the HTTP API so the core security
   middleware's lookup doesn't pull in route code."
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.net URI)))

(set! *warn-on-reflection* true)

(defn- loopback-origin
  "The `scheme://host[:port]` origin of `url`, or nil unless it names a loopback host. Re-checking the host
   here (rather than trusting [[cache/validate-dev-url!]] at write time) keeps a row stored before that
   validation existed from reaching the header."
  [^String url]
  (try
    (let [uri    (URI. url)
          scheme (some-> (.getScheme uri) u/lower-case-en)
          host   (some-> (.getHost uri) u/lower-case-en)
          port   (.getPort uri)]
      (when (and scheme (contains? cache/loopback-hosts host))
        (str scheme "://" host (when (pos? port) (str ":" port)))))
    (catch Exception _ nil)))

(defenterprise custom-viz-dev-connect-src-hosts
  "Origins of the configured custom-viz dev servers, so a superuser's browser can fetch the plugin bundle,
   icon and hot-reload stream directly from the developer's dev server. `[]` unless dev mode is on
   (`MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED`, boot-time only).

   Restricted to loopback origins: the browser doing the fetching always runs on the developer's own
   machine, so widening `connect-src` to one of these adds no route off that machine."
  :feature :custom-viz
  []
  (if-not (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
    []
    (into []
          (comp (keep loopback-origin) (distinct))
          (t2/select-fn-set :dev_bundle_url :model/CustomVizPlugin
                            :status :active :enabled true :dev_bundle_url [:not= nil]))))
