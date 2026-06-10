(ns metabase.explorations.init
  (:require
   [metabase.documents.core :as documents]
   [metabase.explorations.ai-summary]
   [metabase.explorations.document-perms :as document-perms]
   [metabase.explorations.models.exploration]
   [metabase.explorations.models.exploration-query]
   [metabase.explorations.models.exploration-query-result]
   [metabase.explorations.models.exploration-thread]
   [metabase.explorations.models.exploration-thread-group]
   [metabase.explorations.models.exploration-thread-timeline]
   [metabase.explorations.settings]
   [metabase.explorations.task.runner]))

;; Install the content-visibility gate into the documents module's read/write path, so the AI
;; Summary doc's content is hidden from collaborators whose lens differs from the creator's.
(documents/register-doc-content-visibility-fn!
 document-perms/doc-content-visible-to-current-user?)
