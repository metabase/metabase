(ns metabase.core.initialization-status
  "Code related to tracking the progress of metabase initialization.
   This is kept in a separate, tiny namespace so it can be loaded right away when the application launches
   (and so we don't need to wait for `metabase.core` to load to check the status).")

(defonce ^:private progress-atom
  (atom 0))

(defn complete?
  "Is Metabase initialized and ready to be served?"
  []
  (= @progress-atom 1.0))

(defn progress
  "Get the current progress of Metabase initialization."
  []
  @progress-atom)

(defn set-progress!
  "Update the Metabase initialization progress to a new value, a floating-point value between `0` and `1`."
  [^Float new-progress]
  {:pre [(float? new-progress) (<= 0.0 new-progress 1.0)]}
  (reset! progress-atom new-progress))

(defn set-complete!
  "Complete the Metabase initialization by setting its progress to 100%."
  []
  (set-progress! 1.0))
