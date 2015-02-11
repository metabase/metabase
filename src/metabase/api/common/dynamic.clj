(ns metabase.api.common.dynamic
  "Dynamic variables that get bound by middleware for each HTTP request.")

(def ^:dynamic *current-user-id*
  "Int ID or nil of user associated with current API call."
  nil)

;; TODO - This would probably be slightly nicer if we rewrote it as a delay
(def ^:dynamic *current-user*
  "Delay that returns `User` (or nil) associated with the current API call."
  (atom nil)) ; default binding just returns nil when you dereference it

(def TEST 100)
