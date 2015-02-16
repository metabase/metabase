(ns metabase.models.common-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.models.common :refer :all]))

;;; tests for PUBLIC-PERMISSIONS

(expect #{}
  (public-permissions {:public_perms 0}))

(expect #{:read}
  (public-permissions {:public_perms 1}))

(expect #{:read :write}
  (public-permissions {:public_perms 2}))


;;; tests for USER-PERMISSIONS

;; creator can read + write
(expect #{:read :write}
  (binding [*current-user-id* 100]
    (user-permissions {:creator_id 100})))

;; TODO - write tests for the rest of the `user-permissions`
