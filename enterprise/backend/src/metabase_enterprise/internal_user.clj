(ns metabase-enterprise.internal-user
  (:require [metabase.config :as config]
            [metabase.models :refer [User]]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(def ^:private internal-mb-user
  {:id config/internal-mb-user-id
    :first_name "Metabase"
    :last_name "Internal"
    :email "internal@metabase.com"
    :password (str (random-uuid))
    :is_active false
    :is_superuser false
    :login_attributes nil
    :sso_source nil})

(defn- install-internal-user! []
  (t2/insert-returning-instances! User internal-mb-user))

(defn- internal-user-exists? []
  (if-let [internal-user (t2/select-one User :email (:email internal-mb-user))]
    (if (not= (:id internal-user) config/internal-mb-user-id)
      (do
        (log/info "Internal user already exists with an incorrect ID. Deleting...")
        (t2/delete! User :email (:email internal-mb-user))
        false)
      true)
    false))

(defn ensure-internal-user-exists!
  "Creates the internal user"
  []
  (if-not (internal-user-exists?)
    (do (log/info "No internal user found, creating now...")
        (install-internal-user!)
        ::installed)
    ::no-op))
