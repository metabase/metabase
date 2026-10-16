(ns metabase.public-sharing.validation
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.routes.common :as routes.common]
   [metabase.database-routing.core :as database-routing]
   [metabase.public-sharing.db :as public-sharing.db]
   [metabase.public-sharing.reach :as public-sharing.reach]
   [metabase.public-sharing.settings :as public-sharing.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (api/check (public-sharing.settings/enable-public-sharing)
             [400 (tru "Public sharing is not enabled.")]))

(mr/def ::refusing-database
  "A database named as refusing a public link."
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:name :string]])

(mr/def ::public-link-refusal
  "Whether a public link may be created on one entity, as the surfaces that offer the link read it."
  [:map {:closed true}
   [:refusing_database
    {:description (str "The database that would make a new public link on this entity return no data, or null when"
                       " one may be created. Named so the caller can say which database to go and change.")}
    [:maybe ::refusing-database]]])

(mu/defn public-link-refusing-database :- [:maybe ::refusing-database]
  "The routed database without anonymous access that a new public link on the entity `id` of `model` would reach, or
  nil when a link may be created."
  [model :- ::public-sharing.reach/public-link-model
   id    :- ms/PositiveInt]
  ;; sorted so that an entity reaching two refusing databases always names the same one
  (when-let [database-id (m/find-first database-routing/refuses-anonymous-access?
                                       (sort (public-sharing.reach/databases-reached-by-public-link model id)))]
    {:id database-id, :name (public-sharing.db/database-name database-id)}))

(mu/defn check-public-link-allowed!
  "Check that a public link may be created on the entity `id` of `model`, or throw a `400`."
  [model :- ::public-sharing.reach/public-link-model
   id    :- ms/PositiveInt]
  (when-let [{database-id :id, database-name :name} (public-link-refusing-database model id)]
    (log/warnf (str "Refusing to create a public link: database %d (%s) has database routing enabled and"
                    " anonymous_access_granted is false.")
               database-id database-name)
    (throw (ex-info (tru (str "{0} has database routing enabled and does not allow anonymous access, so a public"
                              " link on it would return no data.")
                         database-name)
                    {:status-code 400}))))

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
