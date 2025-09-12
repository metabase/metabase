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
 [source
  get-source])

(defn configure-source!
  "Sets the library source based on the configuration settings"
  []
  (u/prog1 (source/set-source! (when (settings/git-sync-url)
                                 (git/->GitSource (git/clone-repository! {:url   (settings/git-sync-url)
                                                                          :token (settings/git-sync-token)})
                                                  (settings/git-sync-url)
                                                  (settings/git-sync-token))

                                 ;(settings/git-sync-url)
                                 ;(settings/git-sync-import-branch)
                                 ;(settings/git-sync-token)
                                 ;(settings/git-sync-export-branch)
                                 ))
    (log/infof "Library source configured as %s" <>)))

(defenterprise library-editable?
  "Should the library be editable. Always false on OSS"
  :feature :none
  [collection]
  (or (not (collections/library-collection? collection))
      (settings/git-sync-allow-edit)))
