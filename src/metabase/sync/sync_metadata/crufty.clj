(ns metabase.sync.sync-metadata.crufty
  "This namespace contains functions for determining whether or not a table or column name is 'crufty' during syncs.

  In practice, this means that the table or column name is automatically hidden during a syncs.

  We do not _unhide_ tables or columns that are hidden during syncs, so that in the case where a table or column name
  happens to match our idea of crufty, but admins want to see it, they can manually unhide tables or columns, and
  continue to see them."
  (:require
   [metabase.util :as u]))

(defn- matches-any-patterns? [name patterns]
  (some #(re-find % name) patterns))

(defn- ->lower-cased-regex
  "Converts a pattern-string into a lower-cased regex."
  [pattern]
  (-> pattern u/lower-case-en re-pattern))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; PUBLIC API

(defn name?
  "Returns true if the table name re-find matches any of the (regex) patterns or pattern-strings (after getting passed
  through re-pattern).

  This is what does the work of deciding whether or not a table or column name is automatically hidden during syncs.
  These are set from database.setting.auto-cruft-tables and database.setting.auto-cruft-columns, and are both vectors
  of strings that are converted into regexes.

  If you want to match a table or column name exactly, use `^my-table$` or `^my-column$`."
  [nname regexes+pattern-strings]
  (matches-any-patterns? (u/lower-case-en nname)
                         (map ->lower-cased-regex regexes+pattern-strings)))
