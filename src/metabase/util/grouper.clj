(ns metabase.util.grouper
  "Our wrapper for grouper -- the batch processing utility.

  Note:
  - These utilities should only be used for scenarios where data consistency is not a requirement,
    as the batched items are not persisted.
  - Suitable for use cases that can tolerate lag time in processing. For example, updating
    last_used_at of cards after a query execution. Things like recording view_log should not use
    grouper since it's important to have the data immediately available.
  "
  (:require
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [grouper.core :as grouper]
   [potemkin :as p])
  (:import
   (grouper.core Grouper)))

(comment
 p/keep-me
 Grouper/keep-me)

(p/import-vars
 [grouper
  start!
  shutdown!])

(defn submit!
  "A wrapper of [[grouper.core/submit!]] that returns nil instead of a promise.
  We use grouper for fire-and-forget scenarios, so we don't care about the result."
  [& args]
  (apply grouper/submit! args)
  nil)

(alter-meta! #'submit! merge (select-keys (meta #'grouper/submit!) [:ns :name :file :column :line]))
