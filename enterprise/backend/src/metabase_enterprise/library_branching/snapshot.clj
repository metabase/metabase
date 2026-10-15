(ns metabase-enterprise.library-branching.snapshot
  "The snapshot: the synced content of an instance or of a commit, as a plain value.

  A snapshot maps the identity of each item to the item's content. Two items are equal iff their values are equal.")

(set! *warn-on-reflection* true)

(def kinds
  "The closed set of item kinds."
  #{:collection :metric :published-table :snippet})

(def may-contain
  "`{kind #{kind}}`: for each kind of [[kinds]], the kinds of the items that an item of that kind can contain."
  {:collection      #{:collection :metric :published-table :snippet}
   :metric          #{}
   :published-table #{}
   :snippet         #{}})
