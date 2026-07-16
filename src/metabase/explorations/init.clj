(ns metabase.explorations.init
  (:require
   [metabase.documents.core :as documents]
   [metabase.explorations.ai-summary]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.explorations.models.exploration]
   [metabase.explorations.models.exploration-block]
   [metabase.explorations.models.exploration-page]
   [metabase.explorations.models.exploration-query]
   [metabase.explorations.models.exploration-query-result]
   [metabase.explorations.models.exploration-thread]
   [metabase.explorations.models.exploration-thread-timeline]
   [metabase.explorations.queues]
   [metabase.explorations.settings]))

;; Install the content-visibility gate into the documents module's read/write path, so the AI
;; Summary doc's content is hidden from collaborators whose lens differs from the creator's.
(documents/register-doc-content-visibility-fn!
 derived-perms/doc-content-visible-to-current-user?)
