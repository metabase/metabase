(ns metabase-enterprise.library-branching.instance
  "The protocols of the instance side: `KindStore`, the app DB side of one kind, and `Instance`, one Metabase
  instance as library branching sees it. Items are values of `::snapshot/item`; identities are values of
  `::snapshot/identity`.")

(set! *warn-on-reflection* true)

(defprotocol KindStore
  "The app DB side of one kind on one instance. Every function runs inside the instance's current transaction."
  (read-all [ks ids]
    "`{identity item}`: the content of each item of `ids`, the identities of in-scope items of this kind. Content is
    portable: identities and natural keys, no database id, no instance-local attribute (public link, embedding,
    bookkeeping columns) and no derived value. A constant number of queries per batch of ids, not one per item.")
  (current [ks id]
    "Content of item `id`, after a lock on its row and its child rows, or nil when it does not exist or is in the
    trash.")
  (write! [ks content]
    "Makes the item's content equal to `content`: every content attribute is set, an absent one to its default; a
    trashed item with this identity is restored. Instance-local attributes do not change. Laws: a write of the
    current content changes nothing (GetPut); current after write returns `content` (PutGet).")
  (trash! [ks id]
    "Moves the item and the items under it to the trash. The identity and the content stay; content outside the
    Library that uses the item still resolves."))

(defprotocol Instance
  "One Metabase instance as library branching sees it."
  (read-snapshot [inst]
    "`{:snapshot s}`: `s` is the synced snapshot of the instance, the content of every in-scope item of the kinds of
    the instance, read in one read-only transaction: one read point for the whole snapshot. A save that commits
    after the read point is not in `s`. Throws when the calling thread holds an open transaction.")
  (base [inst]
    "The base commit id, or nil before the first sync.")
  (apply-plan! [inst plan new-base]
    "In one transaction: for each step, lock the item, check its precondition, write or trash it; then set the base
    to `new-base`. Returns {:ok {:trashed-in-use ids}}, or {:stale ids} and writes nothing.")
  (set-base! [inst expected new]
    "Moves the base from `expected` to `new`. Returns :ok or {:moved actual}."))

(defn not-yet!
  "Throws: the instance does not implement `method` yet."
  [method]
  (throw (ex-info (str "The instance does not implement " method " yet.") {:method method})))
