(ns metabase-enterprise.remote-sync.source.protocol
  (:require
   [methodical.core :as methodical]))

(defprotocol Source
  (branches [source]
    "Returns a map of branch names available in the source")

  (create-branch [source branch-name base-branch]
    "Creates a new branch from an existing branch")

  (list-files [source]
    "Lists all files in the source")

  (read-file [source path]
    "Reads the contents of the file at `path` in `branch`")

  (write-files! [source message files]
    "Writes `content` to `path` in `branch` with commit `message` for all files in `files`"))

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
