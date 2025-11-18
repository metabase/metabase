(ns metabase.collections.models.tenant-collection-permissions-test
  "Tests for the after-insert behavior of Tenant Collections, specifically for set-tenant-collection-permissions!"
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.settings :refer [use-tenants]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))
