(ns metabase.lib.date-time
  (:require
   [metabase.lib.metadata :as lib.metadata]))

(defn config
  "Return the time config for a query or metadata provider."
  [metadata-providerable]
  {:start-of-week (or (some-> (lib.metadata/setting metadata-providerable :start-of-week) keyword)
                      :sunday)})
