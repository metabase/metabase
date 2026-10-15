(ns metabase-enterprise.library-branching.core
  "Library branching: the Library of an instance is synced with a git branch, as an encoded snapshot of its content.
  The instance stores one commit id, its base; every change is a difference of content between two snapshots.")

(set! *warn-on-reflection* true)
