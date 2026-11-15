(ns metabase-enterprise.support-access-grants.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting support-access-grant-email
  "Email to grant temporary access to for support"
  :encryption :when-encryption-key-set
  :type :string
  :visibility :internal
  :export? false
  :setter :none
  :audit :never
  :doc false
  :default "success-instance-access@metabase.com")

(defsetting support-access-grant-first-name
  "First name of the support user"
  :encryption :no
  :type :string
  :visibility :internal
  :export? false
  :setter :none
  :audit :never
  :doc false
  :default "Support")

(defsetting support-access-grant-last-name
  "Last name of the support user"
  :encryption :no
  :type :string
  :visibility :internal
  :export? false
  :setter :none
  :audit :never
  :doc false
  :default "User")
