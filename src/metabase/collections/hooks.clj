(ns metabase.collections.hooks
  "Hooks that keep collections in step with the writes of other models."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]))

(defn after-user-created
  "Hook for `user`, a User row after it was inserted and put in its permissions groups, which creates its Personal
  Collection."
  [user]
  (collection/user->personal-collection (u/the-id user)))
