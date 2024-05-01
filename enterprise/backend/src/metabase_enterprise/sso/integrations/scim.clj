(ns metabase-enterprise.sso.integrations.scim
  (:require [toucan2.core :as t2]))

;; TODO: should we allow multiple SCIM API keys at once?
(defn refresh-scim-api-key!
  "Generates a new SCIM API key and deletes any that already exist."
  []
  (t2/with-transaction [_conn]
    (t2/delete! :model/ApiKey :scope :scim)))
