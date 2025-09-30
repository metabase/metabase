(ns metabase-enterprise.remote-sync.core
  (:require
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(comment
  source/keep-me)

(p/import-vars
 [source]

 [source.p
  ->ingestable])

(defenterprise editable?
  "Should the remote-synced collection be editable. Always true on OSS"
  :feature :none
  [collection]
  (or (not (collections/remote-synced-collection? collection))
      (= (settings/remote-sync-type) :development)))
