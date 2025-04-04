(ns metabase-enterprise.impersonation.core
  (:require
   [metabase-enterprise.impersonation.driver]
   [metabase-enterprise.impersonation.util]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.impersonation.driver enforced-impersonations-for-db]
 [metabase-enterprise.impersonation.util
  impersonated-user?
  impersonation-enforced-for-db?])
