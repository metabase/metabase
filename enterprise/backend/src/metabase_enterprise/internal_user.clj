(ns metabase-enterprise.internal-user
  (:require [metabase.config :as config]
            [metabase.models :refer [User]]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(defn- install-internal-user! []
  (t2/insert-returning-instances!
   User
   {:id config/internal-user-id
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
  (if-not (t2/exists? User :id config/internal-user-id)
    (do (log/info "No internal user found, creating now...")
        (install-internal-user!)
        ::installed)
    ::no-op))
