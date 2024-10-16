(ns metabase-enterprise.metabot-v3.core
  "API namespace for the `metabase-enterprise.metabot-v3` module."
  (:require
   [metabase-enterprise.metabot-v3.client]
   [potemkin :as p]))

(comment
  metabase-enterprise.metabot-v3.client/keep-me)

(p/import-vars
 [metabase-enterprise.metabot-v3.client
  request])
