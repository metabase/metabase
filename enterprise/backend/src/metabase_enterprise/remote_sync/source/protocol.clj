(ns metabase-enterprise.remote-sync.source.protocol
  (:require
   [methodical.core :as methodical]))

(defprotocol Source
  (branches [source]
    "Gets all available branch names from the remote source.

    Takes a source instance implementing this protocol.

    Returns a collection of branch name strings available in the source.")

  (create-branch [source branch-name base-commit-ish]
    "Creates a new branch from an existing branch.

    Takes a source instance implementing this protocol, a branch-name (the name for the new branch to create), and
    a base-commit-ish (the name of the existing branch or commit hash to use as the base).

    Returns the name of the newly created branch.")

  (default-branch [source]
    "Gets the default branch name from the remote source.

    Takes a source instance implementing this protocol.

    Returns the default branch name as a string, or nil if no default branch is found.")

  (snapshot [source]
    "Creates a snapshot from the source for consistent reads and writes.

     Takes a source instance implementing this protocol.

     Returns a SourceSnapshot instance representing a point-in-time view of the source.")

  (snapshot-at [source version]
    "Creates a snapshot of the source at a specific historical version.

     Takes a source instance implementing this protocol and a version identifier (e.g. a git SHA).

     Returns a SourceSnapshot for that version, or nil if the version cannot be resolved (e.g. it was
     orphaned by a force-push or rebase). Unlike `snapshot`, this does not fetch from the remote; it
     resolves against already-fetched local state."))

(defprotocol SourceSnapshot
  (list-files [snapshot]
    "Lists all files available in the snapshot.

    Takes a SourceSnapshot instance implementing this protocol.

    Returns a collection of file path strings.")

  (read-file [snapshot path]
    "Reads the contents of a file from the snapshot.

    Takes a SourceSnapshot instance implementing this protocol and a path (the relative path to the file to read).

    Returns the file contents as a string, or nil if the file doesn't exist.")

  (write-files! [snapshot message files]
    "Writes multiple files to the source with a commit message.

    Takes a SourceSnapshot instance implementing this protocol, a message (the commit message to use when writing files),
    and files (a sequence of file specs). Each file spec is a map with :path and :content keys.

    All existing files within managed directories that are not in the write set are removed.
    Files outside managed directories are always preserved.

    Returns the version of the written files.")

  (apply-changes! [snapshot message upserts delete-paths]
    "Incrementally updates the source: writes/overwrites `upserts`, removes `delete-paths`,
    and PRESERVES every other existing file (unlike `write-files!`, which deletes managed-dir
    files absent from the write set).

    Takes a SourceSnapshot instance, a commit message, `upserts` (a sequence of file specs, each
    a map with :path and :content), and `delete-paths` (a sequence of path strings to remove).

    Returns the version of the written files.")

  (version [snapshot]
    "Gets a version identifier for the current state of the snapshot.

    Takes a SourceSnapshot instance implementing this protocol.

    Returns a version identifier string (e.g., a git SHA)."))

(defprotocol Diffable
  "Optional capability for snapshots that can cheaply report which files changed since a prior version.
  Implemented by sources backed by real history (git, in-memory versioned test sources); snapshots that
  can't diff simply don't implement it and `changed-files` returns nil for them."
  (changed-files* [snapshot from-version]
    "Returns `{:added #{} :modified #{} :deleted #{}}` path sets between `from-version` and this
    snapshot's version, or nil when `from-version` can't be resolved. Prefer calling [[changed-files]]."))

(defn changed-files
  "Paths that changed between `from-version` and `snapshot`'s version, as
  `{:added #{} :modified #{} :deleted #{}}`, or nil when an incremental diff isn't available — the base
  can't be resolved (force-push/rebase), or the snapshot's source type doesn't support diffing. A nil
  result means diffing is not possible."
  [snapshot from-version]
  (when (satisfies? Diffable snapshot)
    (changed-files* snapshot from-version)))

(methodical/defmulti ->ingestable
  "Creates an ingestable snapshot for remote sync operations.

  Takes a source snapshot and an options map containing:
  - :root-dependencies - a sequence of serdes dependencies in the format [{:model MODEL_NAME :id ENTITY_ID}] that
    filters the items returned to only ones with these dependencies
  - :path-filters - a sequence of regexes that filter allowed paths to read
  - :task-id - a RemoteSyncTask identifier used to update progress

  Returns an IngestableSnapshot instance with the provided source and empty atom state."
  {:arglists '([snapshot opts])}
  (fn [snapshot _opts] (type snapshot)))
