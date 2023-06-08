(ns metabase-enterprise.internal-user
  #_:clj-kondo/ignore
  (:require [clojure.java.io :as io]
            [metabase-enterprise.serialization.cmd :as serialization.cmd]
            [metabase.config :as config]
            [metabase.db.env :as mdb.env]
            [metabase.models :refer [User]]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.util :as u]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(def ^:private internal-user-id 13371338)

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
  (if-not (t2/select-one User :id internal-user-id)
    (do (log/info "No internal user found, creating now...")
        (install-internal-user!)
        ::installed)
    ::no-op))
