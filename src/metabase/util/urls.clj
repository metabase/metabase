(ns metabase.util.urls
  "Utility functions for generating the frontend URLs that correspond various user-facing Metabase *objects*, like Cards or Dashboards.
   This is intended as the central place for all such URL-generation activity, so if frontend routes change, only this file need be changed
   on the backend.

   Functions for generating URLs not related to Metabase *objects* generally do not belong here, unless they are used in many places in the
   codebase; one-off URL-generation functions should go in the same namespaces or modules where they are used."
  (:require [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]))

;; we want to load this at the top level so the Setting the namespace defines gets loaded
(def ^:private site-url*
  (or (u/ignore-exceptions
        (classloader/require 'metabase-enterprise.embedding.utils)
        (resolve 'metabase-enterprise.embedding.utils/notification-link-base-url))
      (constantly nil)))

(defn- site-url
  "Return the Notification Link Base URL if set by enterprise env var, or Site URL."
  []
  (or (site-url*) (public-settings/site-url)))

(defn pulse-url
  "Return an appropriate URL for a `Pulse` with ID.

     (pulse-url 10) -> \"http://localhost:3000/pulse#10\""
  [^Integer id]
  (format "%s/pulse#%d" (site-url) id))

(defn dashboard-url
  "Return an appropriate URL for a `Dashboard` with ID.

     (dashboard-url 10) -> \"http://localhost:3000/dashboard/10\""
  [^Integer id]
  (format "%s/dashboard/%d" (site-url) id))

(defn card-url
  "Return an appropriate URL for a `Card` with ID.

     (card-url 10) -> \"http://localhost:3000/question/10\""
  [^Integer id]
  (format "%s/question/%d" (site-url) id))

(defn segment-url
  "Return an appropriate URL for a `Segment` with ID.

     (segment-url 10) -> \"http://localhost:3000/admin/datamodel/segment/10\""
  [^Integer id]
  (format "%s/admin/datamodel/segment/%d" (site-url) id))

(defn public-card-prefix
  "URL prefix for a public Cards. Get the complete URL by adding the UUID to the end."
  []
  (str (site-url) "/public/question/"))

(defn public-dashboard-prefix
  "URL prefix for a public Dashboards. Get the complete URL by adding the UUID to the end."
  []
  (str (site-url) "/public/dashboard/"))

(defn notification-management-url
  "URL for the notification management page in account settings."
  []
  (str (site-url) "/account/notifications"))
