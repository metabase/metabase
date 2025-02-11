(ns metabase.events.table-mutation
  (:require
   [clojure.core.async :as a]
   [clojure.tools.logging :as log]
   [metabase.events.common :as events.common]))

(derive ::event :metabase/event)
(derive :table.mutation/cell-update ::event)
