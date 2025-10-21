(ns metabase-enterprise.remote-sync.source.protocol
  (:require
   [methodical.core :as methodical]))

(defprotocol Source
  (branches [source]
    "Get all available branch names from the remote source.

    Args:
      source: The source instance implementing this protocol.

    Returns:
      A collection of branch name strings available in the source.")

  (create-branch [source branch-name base-branch]
    "Create a new branch from an existing branch.

    Args:
      source: The source instance implementing this protocol.
      branch-name: The name for the new branch to create.
      base-branch: The name of the existing branch to use as the base.

    Returns:
      The name of the newly created branch.")

  (list-files [source]
    "List all files available in the source.

    Args:
      source: The source instance implementing this protocol.

    Returns:
      A collection of file path strings.")

  (read-file [source path]
    "Read the contents of a file from the source.

    Args:
      source: The source instance implementing this protocol.
      path: The relative path to the file to read.

    Returns:
      The file contents as a string, or nil if the file doesn't exist.")

  (write-files! [source message files]
    "Write multiple files to the source with a commit message.

    Args:
      source: The source instance implementing this protocol.
      message: The commit message to use when writing files.
      files: A sequence of file specs (maps with :path and :content keys).

    Returns:
      The result of the write operation.")

  (version [source]
    "Get a version identifier for the current state of the source.

    Args:
      source: The source instance implementing this protocol.

    Returns:
      A version identifier string (e.g., a git SHA)."))

(methodical/defmulti ->ingestable
  "Creates an ingestable source for remote sync operations.

  Args:
    source: The source configuration for remote sync.
    options: map of options for the ingestable
      root-dependencies: sequence of serdes dependencies in the format [{:model MODEL_NAME :id ENTITY_ID}]
        filters the items returned by the ingestable to only ones with ones of these dependencies
      path-filters: sequence of regexes that filter allowed paths to read
      task-id: RemoteSyncTask identifier used to updated progress

  Returns:
    An IngestableSource instance with the provided source and empty atom state."
  {:arglists '([source opts])}
  (fn [source _opts] (type source)))
