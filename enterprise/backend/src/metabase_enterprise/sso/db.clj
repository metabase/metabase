(ns metabase-enterprise.sso.db
  "Application database queries for the sso module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself.

  The queries on `:model/SsoRelayState` below follow [[::sso-relay-state-opts]]; queries that do not fit it live in
  the sso-only section at the bottom of this namespace."
  (:require
   [metabase-enterprise.sso.schema :as sso.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::sso-relay-state-filters
  "Which SsoRelayStates a query applies to. Keys mirror the columns of `sso_relay_state`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id {:optional true} [:or :string [:set :string]]]])

(mr/def ::sso-relay-state-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::sso-relay-state-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::sso.schema/sso-relay-state.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::sso.schema/sso-relay-state.column
                                              [:tuple ::sso.schema/sso-relay-state.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->args
  [opts]
  (u.query/opts->args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-sso-relay-state! :- :int
  "Insert the SsoRelayState `row`, returning the number inserted."
  [row :- ::sso.schema/sso-relay-state.create]
  (t2/insert! :model/SsoRelayState row))

(mu/defn delete-sso-relay-states! :- :int
  "Delete every SsoRelayState matching `opts`, returning the number deleted."
  [opts :- [:maybe ::sso-relay-state-opts]]
  (apply t2/delete! :model/SsoRelayState (->args opts)))

;;; ------------------------------- Queries used only by the sso module -------------------------------

(mu/defn session-user-email-and-source
  "The email and SSO source of the Session with `session-key-hashed`, plus the identifiers the IdP
  used for it, or nil.

  The `saml_*` columns are NULL for non-SAML sessions and for SAML sessions created before we
  started recording them."
  [session-key-hashed :- :string]
  (t2/query-one {:select [:u.email :u.sso_source :session.saml_session_index
                          :session.saml_name_id :session.saml_name_id_format]
                 :from   [[:core_user :u]]
                 :join   [[:core_session :session] [:= :u.id :session.user_id]]
                 :where  [:= :key_hashed session-key-hashed]}))

(mu/defn delete-session!
  "Delete the Session with `session-key-hashed`, returning the number deleted."
  [session-key-hashed :- :string]
  (t2/delete! :model/Session :key_hashed session-key-hashed))

(mu/defn group-ids-by-name
  "The IDs of the PermissionsGroups named one of `group-names`."
  [group-names :- [:set :string]]
  (t2/select-pks-set :model/PermissionsGroup :name [:in group-names]))

(mu/defn select-one-unexpired-sso-relay-state :- [:maybe ::sso.schema/sso-relay-state.partial]
  "The SsoRelayState with `hashed-key` expiring after `now`, or nil."
  [hashed-key :- :string
   now        :- ms/TemporalInstant]
  (t2/select-one :model/SsoRelayState :id hashed-key :expires_at [:> now]))

(mu/defn delete-expired-sso-relay-states! :- :int
  "Delete the SsoRelayStates expired at or before `now`, returning the number deleted."
  [now :- ms/TemporalInstant]
  (t2/delete! :model/SsoRelayState :expires_at [:<= now]))
