(ns metabase-enterprise.airgap
  (:require    [metabase.models.setting :refer [defsetting]]))

(defsetting airgap-public-key
  "Airgap Public Key, used to decrypt the airgap-style enterprise token"
  :type       :string
  :export?    false
  :visibility :internal
  :setter     :none)
