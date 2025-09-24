(ns metabase-enterprise.remote-sync.source.protocol)

(defprotocol LibrarySource
  (branches [source]
    "Returns a map of branch names available in the source")

  (list-files [source]
    "Lists all files in the source")

  (read-file [source path]
    "Reads the contents of the file at `path` in `branch`")

  (write-files! [source message files]
    "Writes `content` to `path` in `branch` with commit `message` for all files in `files`"))

(defmulti ->ingestable
  "Creates an ingestable source for remote sync operations.

  Args:
    source: The source configuration for remote sync.

  Returns:
    An IngestableSource instance with the provided source and empty atom state."
  {:arglists '([source])}
  type)
