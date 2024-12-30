(ns metabase.premium-features.core
  "API namespace for the Metabase premium features code. This is a collection of functionality that lives in the OSS
  code, but is supports the enforcement of Enterprise Edition features, including the token check logic and the
  defenterprise macro."
  (:require
   [metabase.premium-features.defenterprise]
   [potemkin :as p]))

(p/import-vars
 [metabase.premium-features.defenterprise
  defenterprise])
