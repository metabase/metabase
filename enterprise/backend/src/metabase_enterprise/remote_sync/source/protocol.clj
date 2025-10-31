(ns metabase-enterprise.remote-sync.source.protocol
  (:require
   [methodical.core :as methodical]))

(defprotocol Source
  (branches [source]
    "Gets all available branch names from the remote source.

    Takes a source instance implementing this protocol.

    Returns a collection of branch name strings available in the source.")

  (create-branch [source branch-name base-branch]
    "Creates a new branch from an existing branch.

    Takes a source instance implementing this protocol, a branch-name (the name for the new branch to create), and
    a base-branch (the name of the existing branch to use as the base).

    Returns the name of the newly created branch.")

  (default-branch [source]
    "Gets the default branch name from the remote source.

    Takes a source instance implementing this protocol.

    Returns the default branch name as a string, or nil if no default branch is found.")

  (list-files [source]
    "Lists all files available in the source.

    Takes a source instance implementing this protocol.

    Returns a collection of file path strings.")

  (read-file [source path]
    "Reads the contents of a file from the source.

    Takes a source instance implementing this protocol and a path (the relative path to the file to read).

    Returns the file contents as a string, or nil if the file doesn't exist.")

  (write-files! [source message files]
    "Writes multiple files to the source with a commit message.

    Takes a source instance implementing this protocol, a message (the commit message to use when writing files),
    and files (a sequence of file specs, which are maps with :path and :content keys).

    Returns the result of the write operation.")

  (version [source]
    "Gets a version identifier for the current state of the source.

    Takes a source instance implementing this protocol.

    Returns a version identifier string (e.g., a git SHA)."))

(methodical/defmulti ->ingestable
  "Creates an ingestable source for remote sync operations.

  Takes a source (the source configuration for remote sync) and an options map containing:
  - :root-dependencies - a sequence of serdes dependencies in the format [{:model MODEL_NAME :id ENTITY_ID}] that
    filters the items returned to only ones with these dependencies
  - :path-filters - a sequence of regexes that filter allowed paths to read
  - :task-id - a RemoteSyncTask identifier used to update progress

  Returns an IngestableSource instance with the provided source and empty atom state."
  {:arglists '([source opts])}
  (fn [source _opts] (type source)))
