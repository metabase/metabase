(ns metabase-enterprise.impersonation.core
  (:require
   [metabase-enterprise.impersonation.core]
   [metabase-enterprise.impersonation.driver]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.impersonation.driver enforced-impersonations-for-db]
 [metabase-enterprise.impersonation.util
  impersonated-user?
  impersonation-enforced-for-db?])
