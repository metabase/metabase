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
    "Content of item `id`, after a lock on its row and its child rows until the current transaction ends, or nil when
    it is not in scope: it does not exist, is in the trash, or is outside the Library tree.")
  (write! [ks id content]
    "Makes the content of item `id` equal to `content`, an item of this kind: every content attribute is set, an
    absent one to its default; a trashed item with this identity is restored. Only a row inside the Library tree
    matches `id`. Instance-local attributes do not change. Laws: a write of the current content changes no row
    (GetPut); current after write returns `content` (PutGet). Throws ::refused, and writes nothing, when `content`
    is not an item of this kind, when `id` names a row outside the Library tree or of another kind, when the place
    or an environment reference of `content` does not resolve on this instance, or when another item of a kind whose
    names Metabase keeps unique (a glossary term) has the name of `content`.")
  (trash! [ks id]
    "Moves item `id` and the items under it to the trash. The identity and the content stay; content outside the
    Library that uses the item still resolves. An item of a kind that Metabase keeps no trash for (a glossary term) is
    deleted. Nothing happens when no row has the identity, or when it is already in the trash. Throws ::refused when
    `id` names a row outside the Library tree."))

(defprotocol Instance
  "One Metabase instance as library branching sees it."
  (read-snapshot [inst]
    "`{:snapshot s}`: `s` is the synced snapshot of the instance, the content of every in-scope item of the kinds of
    the instance, read in one read-only transaction: one read point for the whole snapshot. A save that commits
    after the read point is not in `s`. Throws when the calling thread holds an open transaction.")
  (base [inst]
    "The base commit id, or nil before the first sync.")
  (base-digests [inst commit]
    "The digests that [[set-base!]] stored with the base, `{identity digest}`, when the base is `commit`; else nil.")
  (apply-plan! [inst plan new-base]
    "In one transaction: for each step, lock the item, check its precondition, write or trash it; then set the base
    to `new-base`. Returns {:ok {:trashed-in-use ids}}, or {:stale ids} and writes nothing.")
  (set-base! [inst expected new digests]
    "Moves the base from `expected` to `new` (`expected` nil: there is no base), and stores `digests`, the
    `{identity digest}` of the content of `new`, with it, in one compare-and-swap. Returns :ok, or {:moved actual} and
    changes nothing; `actual` is the base, or nil when there is none. Runs in the current transaction, if any."))

(defn refuse!
  "Throws ::refused: the instance refuses a write of item `id` for `reason`, a keyword, with the message `message`
  and the data `data`."
  ([reason id message]
   (refuse! reason id message {}))
  ([reason id message data]
   (throw (ex-info message (merge data {:type ::refused :reason reason :id id})))))

(defn not-yet!
  "Throws: the instance does not implement `method` yet."
  [method]
  (throw (ex-info (str "The instance does not implement " method " yet.") {:method method})))
