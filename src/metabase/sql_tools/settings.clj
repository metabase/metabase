(ns metabase.sql-tools.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru tru]]))

(def ^:private available-parser-backends
  #{:macaw :sqlglot})

(defsetting sql-tools-parser-backend
  (deferred-tru "Parser backend of `sql-tools` module.")
  :visibility :internal
  :export? false
  :type :keyword
  :default (if config/is-dev?
             :sqlglot
             :macaw)
  :setter (fn [new-value]
            (or (available-parser-backends (keyword new-value))
                (throw (ex-info (tru "Invalid sql-tools parser backend.")
                                {:value (keyword new-value)
                                 :available available-parser-backends})))
            (setting/set-value-of-type! :keyword :sql-tools-parser-backend new-value)))
