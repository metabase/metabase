(ns metabase-enterprise.library.source)

(set! *warn-on-reflection* true)

(defprotocol LibrarySource

  (branches [source]
    "Returns a map of branch names available in the source")

  (list-files [source branch]
    "Lists all files in the source")

  (read-file [source branch path]
    "Reads the contents of the file at `path` in `branch`")

  (write-file! [source branch message path content]
    "Writes `content` to the file at `path` in `branch` with commit `message`"))

(def ^:dynamic *source*
  "The library source"
  (atom nil))

(defn get-source
  "The library source"
  []
  @*source*)

(defn set-source!
  "Sets the library source based on the configuration settings"
  [source]
  (reset! *source* source))
