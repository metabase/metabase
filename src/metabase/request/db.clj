(ns metabase.request.db
  "Application database queries for the request module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(def ^:private current-user-columns
  ;; `:type` is needed so [[user/add-attributes]] can refuse to add attributes to non-personal (API-key/internal) users
  (into [:model/User :type] user/admin-or-self-visible-columns))

(defn current-user
  "The User with `user-id` with the columns the current user may see of themselves, or nil."
  [user-id]
  (t2/select-one current-user-columns :id user-id))

(defn current-user-for-id
  "The User with `user-id` as `{:metabase-user-id :is-superuser? :is-data-analyst? :user-locale :settings}`, or nil."
  [user-id]
  (t2/select-one [:model/User
                  [:id :metabase-user-id]
                  [:is_superuser :is-superuser?]
                  [:is_data_analyst :is-data-analyst?]
                  [:locale :user-locale]
                  :settings]
                 :id user-id))
