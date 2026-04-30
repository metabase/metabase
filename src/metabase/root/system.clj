(ns metabase.root.system)

(defonce ^{:doc     "The system"
           :dynamic true}
  *system*
  (atom nil))
