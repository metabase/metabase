(ns metabase-enterprise.library.source.protocol)

(defprotocol LibrarySource
  (branches [source]
    "Returns a map of branch names available in the source")

  (list-files [source branch]
    "Lists all files in the source")

  (read-file [source branch path]
    "Reads the contents of the file at `path` in `branch`")

  (write-files! [source branch message files]
    "Writes `content` to `path` in `branch` with commit `message` for all files in `files`"))
