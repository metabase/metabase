(ns metabase.public-sharing.validation
  (:require
   [metabase.api.common :as api]
   [metabase.api.routes.common :as routes.common]
   [metabase.database-routing.core :as database-routing]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-sharing.settings/enable-public-sharing)
             [400 (tru "Public sharing is not enabled.")]))

(mu/defn check-public-link-allowed!
  "Check that a public link may be created on the Databases with `database-ids`, or throw a `400`.

  A routed database refuses anonymous queries unless an admin has granted it anonymous access, so a public link on one
  could never return data. The warning an admin sees when they enable routing is advisory, so without this an admin
  could still mint dead links afterwards."
  [database-ids :- [:maybe [:sequential [:maybe ms/PositiveInt]]]]
  (doseq [database-id (distinct (remove nil? database-ids))
          :when       (database-routing/refuses-anonymous-access? database-id)]
    (let [database-name (public-sharing.db/database-name database-id)]
      (log/warnf (str "Refusing to create a public link: database %d (%s) has database routing enabled and does not"
                      " allow anonymous access.")
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
