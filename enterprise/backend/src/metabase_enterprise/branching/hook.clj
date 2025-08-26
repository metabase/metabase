(ns metabase-enterprise.branching.hook
  "Defines a toucan pipeline step hook that substitutes out tables that can be branched
  with CTEs that reflect their current state when branched."
  (:require
   [metabase-enterprise.branching.impl :as b.impl]
   [metabase.branching.core :as branching]
   [methodical.core :as methodical]
   [toucan2.pipeline :as pipeline]))

(methodical/defmethod pipeline/build [#_query-type     :default
                                      #_model          :default
                                      #_resolved-query :default]
  [query-type model parsed-args resolved-query]
  (let [built (next-method query-type model parsed-args resolved-query)]
    (if (and branching/*enable-branch-hook*
             (not= query-type :toucan2.tools.before-update/select-for-before-update)
             (map? built)
             (not= model :model/Branch)
             (or (contains? built :select) (contains? built :union) (contains? built :union-all))
             (not= (:from built) [[:information_schema.columns]]))
      (b.impl/replace built (keys @b.impl/branchables))
      built)))
