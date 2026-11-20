(ns metabase.revisions.core
  (:require
   [metabase.revisions.models.revision]
   [metabase.revisions.models.revision.last-edit]
   [metabase.revisions.spec]
   [potemkin :as p]))

(comment
  metabase.revisions.models.revision/keep-me
  metabase.revisions.models.revision.last-edit/keep-me
  metabase.revisions.spec/keep-me)

(p/import-vars
 [metabase.revisions.models.revision
  describe-columns
  revert-columns!
  revisions
  same-definition?
  snapshot]
 [metabase.revisions.models.revision.last-edit
  edit-information-for-user
  fetch-last-edited-info
  with-last-edit-info]
 [metabase.revisions.spec
  spec])
