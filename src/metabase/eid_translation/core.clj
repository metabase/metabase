(ns metabase.eid-translation.core
  (:require
   [metabase.eid-translation.count]
   [metabase.eid-translation.stuff]
   [potemkin :as p]))

(comment
  metabase.eid-translation.stuff/keep-me
  metabase.eid-translation.count/keep-me)

(p/import-vars
 [metabase.eid-translation.count
  clear-translation-count!
  get-translation-count
  update-translation-count!]
 [metabase.eid-translation.stuff
  Status
  default-counter])
