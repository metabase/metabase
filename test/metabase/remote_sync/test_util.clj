(ns metabase.remote-sync.test-util
  "Test utilities for remote sync."
  (:require
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]))

(defn allow-remote-synced-collections
  "Test fixture that lets every collection be remote-synced, as with custom collections on."
  [thunk]
  (mt/with-dynamic-fn-redefs [remote-sync/collection-syncable? (constantly true)]
    (thunk)))
