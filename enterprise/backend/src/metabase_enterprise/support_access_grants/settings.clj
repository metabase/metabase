(ns metabase-enterprise.support-access-grants.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting support-access-grant-email
  (deferred-tru "Email to grant temporary access to for support")
  :type :string
  :visibility :internal
  :export? false
  :setter :none
  :audit :never
  :doc false
  :default "success-instance-access@metabase.com")

(defsetting support-access-grant-first-name
  (deferred-tru "First name of the support user")
  :type :string
  :visibility :internal
  :export? false
  :setter :none
  :audit :never
  :doc false
  :default "Support")

(defsetting support-access-grant-last-name
  (deferred-tru "Last name of the support user")
  :type :string
  :visibility :internal
  :export? false
  :setter :none
  :audit :never
  :doc false
  :default "User")
