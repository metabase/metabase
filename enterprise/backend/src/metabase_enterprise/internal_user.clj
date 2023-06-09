(ns metabase-enterprise.internal-user
  (:require [metabase.models :refer [User]]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(def ^:private internal-user-id 13371338)

(defenterprise ignore-internal-user-clause
  "Returns the where clause to ignore internal metabase user, or an empty where clause."
  :feature :none
  []
  [:not= :id internal-user-id])

(defn- install-internal-user! []
  (t2/insert-returning-instances!
   User
   {:id internal-user-id
    :first_name "Metabase"
    :last_name "Internal"
    :email "internal@metabase.com"
    :password (str (random-uuid))
    :is_active false
    :is_superuser false
    :login_attributes nil
    :sso_source nil}))

(defn ensure-internal-user-exists!
  "Creates the internal user"
  []
  (if-not (t2/exists? User :id internal-user-id)
    (do (log/info "No internal user found, creating now...")
        (install-internal-user!)
        ::installed)
    ::no-op))
