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

  (delete-branch [source branch-name]
    "Deletes a branch from the remote source. A no-op when the branch does not exist.

    Takes a source instance implementing this protocol and the branch-name to delete.

    Returns nil.")

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

  (open-commit [snapshot]
    "Begin building one commit incrementally; returns a CommitBuilder.")

  (version [snapshot]
    "Gets a version identifier for the current state of the snapshot.

    Takes a SourceSnapshot instance implementing this protocol.

    Returns a version identifier string (e.g., a git SHA)."))

(defprotocol CommitBuilder
  "A single commit being built incrementally — stage files one at a time, then finish (or abort). Lets the
  caller stream files into a commit without holding them all at once.

  Lifecycle / resources: a builder holds native resources open (for git, a JGit `ObjectInserter`,
  `ObjectReader`, and `RevWalk`) from `open-commit` until they're released. The caller MUST eventually call
  `finish-commit!` (on success) or `abort-commit!` (on failure) to release them — including when staging
  throws, so callers should wrap staging in `try` and `abort-commit!` in the `catch`/`finally`. A builder
  left open leaks those resources; the lifecycle is the caller's responsibility, not the builder's."
  (stage-upsert! [commit file-spec]
    "Stage one file (a `{:path :content}` map) into the commit. Returns nil.")
  (stage-delete! [commit path]
    "Stage removal of `path` from the commit. Returns nil.")
  (replace-all! [commit]
    "Clear the snapshot's managed dirs, so the staged files replace them wholesale. Returns nil.")
  (empty-commit? [commit]
    "True if the staged tree is identical to the parent's, i.e. finishing would introduce no changes. Always
    false for a root commit (no parent).")
  (finish-commit!
    [commit message]
    [commit message report-progress]
    "Write the staged tree, commit with `message`, push, and release resources. Returns the new version.

    `report-progress`, when given, is an optional reporter fn accepting `(fraction)` or `(fraction opts)`;
    nil to skip. It is called once, forced, at the commit checkpoint just after the local commit is durable
    and before the network push begins, and then repeatedly (throttled) by the push's ProgressMonitor as
    the push proceeds.")
  (abort-commit! [commit]
    "Release the commit's resources without committing or pushing. Returns nil."))

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
