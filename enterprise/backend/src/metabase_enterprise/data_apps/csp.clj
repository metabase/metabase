(ns metabase-enterprise.data-apps.csp
  "EE implementation of the data-app CSP `connect-src` host lookup declared in
   [[metabase.server.middleware.security]]. Kept separate from the HTTP API so
   the core security middleware's lookup doesn't pull in route code."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise data-app-connect-src-hosts
  "Origins the enabled data app with `slug` may reach (its `allowed_hosts`), or
   `[]` when there is no such enabled app. Drives the data-app iframe document's
   CSP `connect-src` so the sandboxed bundle can fetch/XHR those origins."
  :feature :data-apps-preview
  [slug]
  (or (:allowed_hosts (data-apps.db/enabled-non-blob-data-app-by-slug slug))
      []))
