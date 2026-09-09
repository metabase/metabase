(ns metabase.request.db
  "Application database queries for the request module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.models.user :as user]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private current-user-columns
  ;; `:type` is needed so [[user/add-attributes]] can refuse to add attributes to non-personal (API-key/internal) users
  (into [:model/User :type] user/admin-or-self-visible-columns))

(mu/defn current-user :- [:maybe (mut/optional-keys ::users.schema/user.full)]
  "The User with `user-id` with the columns the current user may see of themselves, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one current-user-columns :id user-id))

(def ^:private CurrentUserForId
  "Rows returned by [[current-user-for-id]]."
  (mut/merge (mut/select-keys ::users.schema/user.full [:settings :common_name])
             [:map
              [:metabase-user-id [:maybe ms/PositiveInt]]
              [:is-superuser?    [:maybe :boolean]]
              [:is-data-analyst? [:maybe :boolean]]
              [:user-locale      [:maybe :string]]]))

(mu/defn current-user-for-id :- [:maybe CurrentUserForId]
  "The User with `user-id` as `{:metabase-user-id :is-superuser? :is-data-analyst? :user-locale :settings}`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User
                  [:id :metabase-user-id]
                  [:is_superuser :is-superuser?]
                  [:is_data_analyst :is-data-analyst?]
                  [:locale :user-locale]
                  :settings]
                 :id user-id))
