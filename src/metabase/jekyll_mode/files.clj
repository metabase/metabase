(ns metabase.jekyll-mode.files)

(set! *warn-on-reflection* true)

;;; TODO -- this should be configurable by the user (make it a Setting?)

(defn directory-prefix
  "The base directory for Jekyll mode's files."
  []
  "local/jekyll")
