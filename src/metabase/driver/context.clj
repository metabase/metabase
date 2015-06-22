(ns metabase.driver.context)

;;; DEPRECATED !
;; The functionality in this namespace is part of some old QP stuff and no longer serves any important purpose.
;; TODO - Remove this namespace

(def ^:dynamic *database*
  "Current DB."
  nil)

(def ^:dynamic *table*
  "Current table."
  nil)
