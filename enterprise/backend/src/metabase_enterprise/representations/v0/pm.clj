(ns metabase-enterprise.representations.v0.pm
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.representations.v0.common :as v0-common]))

(defn replace-refs
  "Take a prose mirror document and convert dependency ids to refs for export."
  [prose-mirror ref-index]
  (walk/postwalk
   (fn [node]
     (if (v0-common/ref? node)
       (v0-common/ref->id node ref-index)
       node))
   prose-mirror))
