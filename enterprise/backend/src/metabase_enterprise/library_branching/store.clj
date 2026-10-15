(ns metabase-enterprise.library-branching.store
  "The `Store` protocol: a git repository as library branching uses it. A commit id is the 40-character hex name
  of a commit. A ref is a branch name, with or without `refs/heads/`. A tree is `{path bytes}`: paths relative
  to the repository root, separated by `/`, regular files only.")

(defprotocol Store
  "A git repository: commits, trees and refs. The local object store holds the commits that `head` fetched and
  the commits that `write-commit` wrote; the other methods read only the local object store.

  Laws:
  - `(cas-ref! s r e n)` is :ok iff the remote `r` was `e`; then `r` is `n`. Else it returns {:moved actual},
    and `r` stays `actual`.
  - `write-commit` changes no ref, local or remote.
  - `(read-tree s (write-commit s ps t m))` = `t`.
  - `changed-paths` agrees with the difference of the two `read-tree` results.
  - `ancestor?` is the reflexive, transitive closure of the parent relation.
  - `(merge-base s a b)` is an ancestor of `a` and of `b`, and no other common ancestor has it as an ancestor."
  (head [store ref]
    "The commit id that `ref` names on the remote now (after a fetch), or nil.")
  (read-tree [store commit]
    "The tree of `commit` as {path bytes}. Lazy per file is allowed.")
  (changed-paths [store from to]
    "{:added #{} :modified #{} :deleted #{}} between two commits; `from` nil is the empty tree. A cheap hint for
    diff; never the truth of a change.")
  (write-commit [store parents tree message]
    "Writes the tree and a commit with `parents` into the local object store. Returns the commit id. Changes no
    ref. Throws when a path of `tree` is not a valid git path, or names a directory of another path.")
  (cas-ref! [store ref expected new]
    "Moves remote `ref` from `expected` to `new` (`expected` nil: the ref must not exist). Returns :ok, or
    {:moved actual} and moves nothing; `actual` is the commit id of the remote ref, or nil when it does not
    exist. `new` must be in the local object store.")
  (ancestor? [store a b]
    "True iff commit `a` is `b` or an ancestor of `b`.")
  (merge-base [store a b]
    "A lowest common ancestor of `a` and `b`, or nil when they have none.")
  (close [store]
    "Releases the store's resources and removes its local files. The store is unusable after it."))
