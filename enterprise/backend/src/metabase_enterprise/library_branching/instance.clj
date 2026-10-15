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
    "The state of item `id`, after a lock on its row and its child rows until the current transaction ends:
    `{:state :live :content c}` when it is in scope; `{:state :trashed :content c}` when its row is in the Library
    tree and in the trash; else `{:state :absent}` (no row of this kind has the identity, or the row is outside the
    Library tree).")
  (write! [ks id content]
    "Makes the content of item `id` equal to `content`, an item of this kind: every content attribute is set, an
    absent one to its default; a trashed item with this identity is restored. Only a row inside the Library tree
    matches `id`. Instance-local attributes do not change. Laws: a write of the current content changes no row
    (GetPut); current after write returns `{:state :live :content content}` (PutGet). Throws ::refused, and writes
    nothing, when `content` is not an item of this kind, when `id` names a row outside the Library tree or of another
    kind, or when the place or an environment reference of `content` does not resolve on this instance.")
  (trash! [ks id]
    "Moves item `id` and the items under it to the trash. The identity and the content stay; content outside the
    Library that uses the item still resolves. Nothing happens when no row has the identity, or when it is already in
    the trash. Throws ::refused when `id` names a row outside the Library tree, or a system item
    (`snapshot/system-ids`)."))

(defprotocol UniqueKey
  "A kind whose key the app DB keeps unique over all its rows (`snapshot/unique-keys`)."
  (key-holders [ks k]
    "The set of identities of the rows of this kind whose key equals `k` by the comparison of the app DB: rows in the
    trash and rows outside the Library tree included."))

(defprotocol Stub
  "A kind whose items can be on a reference cycle: an apply writes a new item of the cycle first as a stub."
  (stub [ks id content refs]
    "The content of a new item `id` of this kind: `content` without the references `refs`, for a write before the
    targets of `refs` exist."))

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
  (apply-plan! [inst plan opts]
    "Carries out `plan`, the steps of `engine.plan/plan`, in one transaction: lock each item and check its
    precondition, check the unique keys of the written items, then write, link or trash each item, then move the base
    from `(:base opts)` to `(:new-base opts)` with `(:digests opts)` (as [[set-base!]]), then call `(:head-ok? opts)`,
    which is false when the planned head left the branch history. Returns the result of `apply/apply-plan`: `{:ok
    {:trashed-in-use m}}`, or one of `{:fenced reason}`, `{:stale ids}`, `{:key-clash findings}`, `{:refused [...]}`,
    `{:base-moved actual}` and `{:rewritten new-base}`, and then writes nothing.")
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
