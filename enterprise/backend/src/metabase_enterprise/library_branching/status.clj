(ns metabase-enterprise.library-branching.status
  "Status, change lists and the push preview of an instance and a branch. Read only: nothing here writes to the
  instance or to the repository.

  A change set is `{:created :deleted :updated}`, sets of identities, by content equality. The local changes are the
  difference of the content of the base and the synced snapshot of the instance; the remote changes are the difference
  of the content of the base and of the head of the branch."
  (:require
   [metabase-enterprise.library-branching.instance :as instance]))

(set! *warn-on-reflection* true)

(def no-changes
  "The change set with no change."
  {:created #{} :deleted #{} :updated #{}})

(defn changed?
  "True iff change set `changes` has a change."
  [changes]
  (instance/not-yet! `changed?)
  changes)

;;; -------------------------------------------------- Local changes --------------------------------------------------

(defn change-list
  "The entries of change set `changes`, in the order of `snapshot/compare-identities`: `{:id :kind :name :change}`,
  where `:change` is `:created`, `:updated` or `:deleted`. The kind and the name come from the local snapshot `local`,
  and for a deleted item from the base snapshot `base`; they are nil for a deleted item that `base` (nil: unknown) does
  not hold."
  [_changes _local _base]
  (instance/not-yet! `change-list))

(defn local-changes
  "The local changes of instance `inst`: `{:base b :local l :changes c}`, where `b` is the base, `l` the synced snapshot,
  and `c` the change set from the content of `b` to `l`, by digest; with no base, every item of `l` is created.
  `(with-store f)` calls `f` with a store of the repository, on branch `branch`; it is called only when the instance
  stored no digests with its base. Throws ex-info with `:status-code` 400 when the content of the base is not known.
  `opts`: `:codecs` (default `kinds/codecs`)."
  [_inst _with-store _branch _opts]
  (instance/not-yet! `local-changes))

(defn base-snapshot
  "The snapshot of base commit `b`, read through `store` after a fetch of branch `branch`, or nil when the repository no
  longer holds `b` or its tree does not decode. `opts`: `:codecs`."
  [_store _branch _b _opts]
  (instance/not-yet! `base-snapshot))

;;; -------------------------------------------------- Remote changes -------------------------------------------------

(defn full-remote-changes
  "The remote changes from base commit `b` to head `h` of `store`, from a decode of every item file of `h`: `{:changes
  c}`, `{:findings f}` when the tree of `h` does not decode, or `{:unknown :base}` when the content of `b` is not known.
  The content of `b` is `(:base-digests opts)` when given, else the decode of the tree of `b`; `b` nil has no items.
  `opts`: `:codecs`, `:base-digests`."
  [_store _b _h _opts]
  (instance/not-yet! `full-remote-changes))

(defn remote-changes
  "The remote changes from base commit `b` to head `h` of `store`, as [[full-remote-changes]], which gives the same
  result. When `h` is `b`, no change, with no read of the store. Else it decodes only the files that
  `store/changed-paths` names, at both commits, when that is exact: every changed file is a foreign file or an item file
  that decodes, no changed file holds a system item or the Library, and no new file holds an item of the base
  (`(:base-digests opts)`, required for this path). `opts`: `:codecs`, `:base-digests`."
  [_store _b _h _opts]
  (instance/not-yet! `remote-changes))

(defn base-held?
  "True iff a branch of the remote of `store` holds commit `b`: `b` is the head, or an ancestor of the head, of a branch.
  `h` is the head of branch `branch` (nil: none), which is checked first; every other branch costs a fresh remote call."
  [_store _b _branch _h]
  (instance/not-yet! `base-held?))

;;; ------------------------------------------------------ Status -----------------------------------------------------

(defn status
  "The status of instance `inst` and branch `branch` of `store`:

    {:base b :head h :branch-missing m :base-lost l :head-findings f :local lc :remote rc}

  `h` is nil and `m` true when the branch does not exist. `l` is true iff there is a base and no branch holds it
  ([[base-held?]]); then nothing shows as synced. `f` is nil, or the findings of the head (it does not decode, or breaks
  a structural rule). `lc` is the change set of [[local-changes]]; `rc` the remote changes, nil when the head has
  findings, does not exist, or the content of the base is not known. `opts`: `:codecs`."
  [_inst _store _branch _opts]
  (instance/not-yet! `status))

(defn push-preview
  "What a push of instance `inst` to branch `branch` of `store` meets: the status, plus a merge of the base, the synced
  snapshot and the head, with no keep-mine decision. Pure apart from the reads.

    {:diverged d :clean c :conflicts [...] :violations [...] :summary s :branch-missing m :base-lost l
     :head-findings f}

  `d` is true iff the head is not the base. With `d` false, no conflict, and no read of the instance. A conflict is
  `{:id :kind :name}`; a violation is `{:rule :ours :theirs}`. `s` is `{:added :updated :removed}`: the numbers of
  items that the merge takes from the head over an unchanged local item. A base that no branch holds is lost: every
  difference of the two sides is a conflict. A head with findings is not clean, and has no merge. `opts`: `:codecs`."
  [_inst _store _branch _opts]
  (instance/not-yet! `push-preview))

;;; ------------------------------------------------- Has remote changes ----------------------------------------------

(defn check-remote-changes
  "Whether branch `branch` of `store` has remote changes for instance `inst`, with no cache:

    {:has-changes c :remote-version h :local-version b :branch-missing m}

  `c` is true iff the [[remote-changes]] from the base `b` to the head `h` are not empty, or are not known (the head does
  not decode, or the content of the base is not known). A branch that does not exist gives `c` false and `m` true.
  `opts`: `:codecs`."
  [_inst _store _branch _opts]
  (instance/not-yet! `check-remote-changes))

(defn cached-answer
  "The answer of cache entry `entry` (`{:key k :at t :answer a}`, or nil) for key `key` at time `now-ms`, or nil when the
  entry is for another key or older than `ttl-ms`. Pure."
  [_entry _key _now-ms _ttl-ms]
  (instance/not-yet! `cached-answer))

(defn has-remote-changes!
  "[[check-remote-changes]] of instance `inst` and the store of `(with-store f)`, with `:cached` false, or the answer
  that it gave less than `:ttl-seconds` ago with `:cached` true. The cache holds one answer, for the key of the
  repository URL `:url`, the branch `:branch` and the base of `inst`: a change of the URL or the branch, and a push or
  a pull that moves the base, miss it. `:force-refresh?` misses it. An answer for a branch that does not exist is not
  cached. A failure of the store throws, and is not cached. `opts`: `:url`, `:branch`, `:ttl-seconds`,
  `:force-refresh?`, `:now-ms` (default the clock), `:codecs`."
  [_inst _with-store _opts]
  (instance/not-yet! `has-remote-changes!))
