(ns metabase.models.permissions.util
  "Misc utilities for working with permissions and related topics."
  (:require [metabase.public-settings.premium-features :refer [defenterprise]]))

(defenterprise impersonation-enabled-for-db?
  "Is impersonation enabled for the given database, for any groups? OSS implementation always returns false."
  metabase-enterprise.advanced-permissions.driver.impersonation
  [_db-or-id]
  false)
