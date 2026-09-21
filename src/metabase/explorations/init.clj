(ns metabase.explorations.init
  (:require
   [metabase.comments.core :as comments]
   [metabase.documents.core :as documents]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.explorations.models.exploration]
   [metabase.explorations.models.exploration-block]
   [metabase.explorations.models.exploration-page]
   [metabase.explorations.models.exploration-query]
   [metabase.explorations.models.exploration-query-result]
   [metabase.explorations.models.exploration-thread]
   [metabase.explorations.models.exploration-thread-timeline]
   [metabase.explorations.queues]
   [metabase.explorations.settings]
   [metabase.explorations.task.collect-orphaned-results]))

;; Install the content-visibility gate into the documents module's read/write path, so the
;; Summary doc's content is hidden from collaborators whose lens differs from the creator's.
(documents/register-doc-content-visibility-fn!
 derived-perms/doc-content-visible-to-current-user?)

;; Withhold the warehouse values a comment's context carries from viewers the exploration's
;; data-access gate excludes. Registered here for the same reason as the gate above: `comments`
;; cannot depend on `explorations`.
(comments/register-context-gate!
 (fn [target-type target-id comments]
   (if (= target-type "exploration")
     (derived-perms/gate-comment-contexts target-id comments)
     comments)))
