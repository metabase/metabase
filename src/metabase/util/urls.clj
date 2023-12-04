(ns metabase.util.urls
  "Utility functions for generating the frontend URLs that correspond various user-facing Metabase *objects*, like Cards or Dashboards.
   This is intended as the central place for all such URL-generation activity, so if frontend routes change, only this file need be changed
   on the backend.

   Functions for generating URLs not related to Metabase *objects* generally do not belong here, unless they are used in many places in the
   codebase; one-off URL-generation functions should go in the same namespaces or modules where they are used."
  (:require
   [metabase.public-settings :as public-settings]))

(defn- site-url
  "Return the Notification Link Base URL if set by enterprise env var, or Site URL."
  []
  (or (public-settings/notification-link-base-url) (public-settings/site-url)))

(defn archive-url
  "Return an appropriate URL to view the archive page."
  []
  (str (site-url) "/archive"))

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

(defn database-url
  "Returns an appropriate URL to view a database.

     (database-url 4) -> \"http://localhost:3000/browse/4\""
  [^Integer db-id]
  (format "%s/browse/%d" (site-url) db-id))

(defn table-url
  "Returns an appropriate URL to view a table.

     (table-url 1 10) -> \"http://localhost:3000/question?db=1&table=10\""
  [^Integer db-id ^Integer table-id]
  (format "%s/question?db=%d&table=%d" (site-url) db-id table-id))

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

(defn unsubscribe-url
  "URL for nonusers to unsubscribe from alerts"
  []
  (str (site-url) "/unsubscribe"))

(defn collection-url
  "Return an appropriate URL for a `Collection` with ID or nil for root.
     (collection-url 10) -> \"http://localhost:3000/collection/10\"
     (collection-url nil) -> \"http://localhost:3000/collection/root\""
  [collection-id-or-nil]
  (format "%s/collection/%s" (site-url) (or collection-id-or-nil "root")))

(defn tools-caching-details-url
  "Return an appropriate URL for linking to caching log details."
  [^Integer persisted-info-id]
  (format "%s/admin/tools/model-caching/%d" (site-url) persisted-info-id))
