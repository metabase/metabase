(ns metabase-enterprise.library.core
  (:require
   [metabase-enterprise.library.settings :as settings]
   [metabase-enterprise.library.source :as source]
   [metabase-enterprise.library.source.git :as git]
   [metabase.collections.core :as collections]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [potemkin :as p]))

(comment
  source/keep-me)

(p/import-vars
 [source])

(defenterprise library-editable?
  "Should the library be editable. Always true on OSS"
  :feature :none
  [collection]
  (or (not (collections/library-collection? collection))
      (settings/git-sync-allow-edit)))
