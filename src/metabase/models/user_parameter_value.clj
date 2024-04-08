(ns metabase.models.user-parameter-value
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/UserParameterValue [_model] :user_parameter_value)

(doto :model/UserParameterValue
  (derive :metabase/model))


(t2/deftransforms :model/UserParameterValue
  {:value mi/transform-json})

#_
(t2/define-before-insert :model/UserParameterValue
  [upv]
  (u/prog1 upv
    (validate upv)))

#_
(t2/define-before-update :model/UserParameterValue
  [upv]
  (u/prog1 (t2/changes upv)
    (when (:value <>)
      (validate <>))))

(defn- upsert!
  [user-id parameter-id value]
  (or (pos? (t2/update! :model/UserParameterValue {:user_id      user-id
                                                   :parameter_id parameter-id}
                        {:value value}))
      (t2/insert! :model/UserParameterValue {:user_id      user-id
                                             :parameter_id parameter-id
                                             :value        value})))

(mu/defn upsert-or-delete!
  "Upsert or delete parameter value set by the user."
  [user-id      :- ms/PositiveInt
   parameter-id :- ms/NonBlankString
   value        #_#_:- [:maybe :Any]]
  ;;WIP
  (upsert! user-id parameter-id value))


;; hydration

(methodical/defmethod t2/batched-hydrate [:model/Dashboard :last-used-param-values]
  "Return a map of parameter-id->last used value for the dashboards."
  [_model _k dashboards]
  dashboards)
