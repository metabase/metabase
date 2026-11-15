(ns metabase.core.config-from-file
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise boot-initialize!
  "Initialize Metabase from a `config.yml` file at boot.
  Only the Enterprise Edition ships the config-file loader, so OSS does nothing."
  metabase-enterprise.advanced-config.file
  [])
