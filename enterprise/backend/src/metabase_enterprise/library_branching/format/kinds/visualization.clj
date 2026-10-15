(ns metabase-enterprise.library-branching.format.kinds.visualization
  "Visualization settings in their portable document form: the references that they hold."
  (:require
   [metabase-enterprise.library-branching.format.kinds.portable :as portable]))

(set! *warn-on-reflection* true)

(defn refs
  "The set of references `[role target]` in the visualization settings `settings`. Not written yet: only
  [[portable/refs]] of the settings."
  [settings]
  (if (map? settings)
    (portable/refs settings)
    #{}))
