(ns metabase.search.models
  (:require
   [metabase.search.core :as search]
   [toucan2.core :as t2]))

;; Models must derive from :hook/search-index if their state can influence the contents of the Search Index.
;; Note that it might not be the model itself that depends on it, for example, Dashcards are used in Card entries.
;; Don't worry about whether you've added it in the right place, we have tests to ensure that it is derived if, and only
;; if, it is required.

(t2/define-after-insert :hook/search-index
  [instance]
  (search/update! instance true)
  instance)

(t2/define-after-update :hook/search-index
  [instance]
  (search/update! instance)
  nil)

;; Too much of a performance risk.
#_(t2/define-before-delete :metabase/model
    [instance]
    (when (search/supports-index?)
      (search.ingestion/update-index! instance))
    instance)
