(ns metabase.revisions.core
  (:require
   [metabase.revisions.models.revision.last-edit]
   [potemkin :as p]))

(comment metabase.revisions.models.revision.last-edit/keep-me)

(p/import-vars
 [metabase.revisions.models.revision.last-edit
  MaybeAnnotated
  edit-information-for-user
  fetch-last-edited-info
  with-last-edit-info])
