(ns metabase.settings.app-db-copy
  "How copying the application database to another database copies settings.")

(set! *warn-on-reflection* true)

(defn transform-setting
  "The setting row to write, or nil for `read-only-mode`, since a copy restored with it on is confusing and prevents
  key rotation."
  [row _opts]
  (when-not (= (:key row) "read-only-mode")
    row))
