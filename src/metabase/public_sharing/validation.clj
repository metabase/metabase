(ns metabase.public-sharing.validation
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.routes.common :as routes.common]
   [metabase.database-routing.core :as database-routing]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-sharing.settings/enable-public-sharing)
             [400 (tru "Public sharing is not enabled.")]))

(mu/defn check-public-link-allowed!
  "Check that a public link may be created on the Databases with `database-ids`, or throw a `400`.

  A routed database refuses anonymous queries unless an admin has granted it anonymous access, so a public link on one
  could never return data. The warning an admin sees when they enable routing is advisory, so without this an admin
  could still mint dead links afterwards.

  Nils are tolerated in `database-ids` because a Card's `:database_id` is itself nullable; an empty sequence is not,
  so a caller cannot skip the check by passing nothing."
  [database-ids :- [:sequential [:maybe ::lib.schema.id/database]]]
  (when-let [database-id (m/find-first database-routing/refuses-anonymous-access?
                                       (distinct (remove nil? database-ids)))]
    (let [database-name (public-sharing.db/database-name database-id)]
      (log/warnf (str "Refusing to create a public link: database %d (%s) has database routing enabled and"
                      " anonymous_access_granted is false.")
                 database-id database-name)
      (throw (ex-info (tru (str "{0} has database routing enabled and does not allow anonymous access, so a public"
                                " link on it would return no data.")
                           database-name)
                      {:status-code 400})))))

(defn enforce-public-sharing-enabled
  "Ring middleware that checks public sharing is enabled site-wide before handling the request to a public endpoint."
  [handler]
  (fn [request respond raise]
    (if (public-sharing.settings/enable-public-sharing)
      (handler request respond raise)
      (raise (ex-info (tru "Public sharing is not enabled.") {:status-code 400})))))

(def ^{:arglists '([handler])} +public-sharing-enabled
  "Wrap `routes` so they may only be accessed when public sharing is enabled."
  (routes.common/wrap-middleware-for-open-api-spec-generation enforce-public-sharing-enabled))
