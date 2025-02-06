(ns metabase.sync.sync-metadata.crufty
  (:require    [metabase.util :as u]))

(defn- matches-any-patterns? [name patterns]
  (some #(re-find % name) patterns))

;; PUBLIC API

(defn ->regex [pattern]
  "Converts a pattern-string into a lower-cased regex."
  (-> pattern u/lower-case-en re-pattern))

(defn name?
  "Returns true if the table name re-find matches any of the (regex) patterns or pattern-strings (after getting passed
  through re-pattern).

  This is what does the work of deciding whether or not a table or column name is automatically hidden during syncs.
  These are set from database.setting.auto-cruft-tables and database.setting.auto-cruft-columns, and are both vectors
  of strings that are converted into regexes.

  If you want to match a table or column name directly, use `^my-table$` or `^my-column$`."
  [nname {:keys [patterns pattern-strings]}]
  (matches-any-patterns? (u/lower-case-en nname)
                         (concat patterns (map ->regex pattern-strings))))
