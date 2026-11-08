(ns metabase-enterprise.remote-sync.protocol
  "The git repository remote sync reads and writes trees of files through, each tree named by its version.")

(defprotocol Repository
  "A git repository with a remote it fetches from and pushes to."
  (fetch! [repo]
    "Fetches the branches of the remote, dropping those it no longer has.")
  (branches [repo]
    "The sorted names of the branches of the remote.")
  (default-branch [repo]
    "The name of the default branch of the remote.")
  (version [repo branch]
    "The version at the tip of `branch` as last fetched, or nil when there is no such branch.")
  (has-version? [repo version]
    "Whether the tree of `version` is known, which it no longer is once a force push dropped it.")
  (list-files [repo version]
    "The paths of the files of the tree of `version`.")
  (read-file [repo version path]
    "The content of the file at `path` in the tree of `version`, or nil when it has none.")
  (commit! [repo branch parent changes message]
    "Commits `changes`, a map from path to content, nil to delete the file, on top of `parent`, the version at the tip
    of `branch`, and pushes it, returning the new version; throws when the remote branch moved on.")
  (create-branch! [repo branch version]
    "Creates `branch` at `version` and pushes it."))
