(ns metabase.revisions.core
  (:require
   [metabase.revisions.models.revision.last-edit]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(comment metabase.revisions.models.revision.last-edit/keep-me)

(p/import-vars
 [metabase.revisions.models.revision.last-edit
  edit-information-for-user
  fetch-last-edited-info
  with-last-edit-info])

(mr/def ::MaybeAnnotated [:ref :metabase.revisions.models.revision.last-edit/MaybeAnnotated])
