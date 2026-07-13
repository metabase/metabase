(ns metabase.sql-parsing.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

(defsetting sql-parsing-mode
  (deferred-tru "How SQL parsing (sqlglot) runs: `graalvm` runs it in-process on pooled GraalPy contexts (default), or `python` runs it in a pool of external native CPython child processes (requires a `python3` binary on the host PATH).")
  :type       :keyword
  :visibility :internal
  :default    :graalvm
  :export?    false
  :setter     (fn [new-value]
                (when (some? new-value)
                  (assert (#{:graalvm :python} (keyword new-value))
                          (tru "Invalid sql-parsing-mode! Only values of graalvm and python are allowed.")))
                (setting/set-value-of-type! :keyword :sql-parsing-mode new-value)))
