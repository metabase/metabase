(ns metabase.models.user-parameter-value
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/UserParameterValue [_model] :user_parameter_value)

(doto :model/UserParameterValue
  (derive :metabase/model))

#_
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
  (u/prog1 (t2/changes puv)
    (when (:value <>)
      (validate <>))))

(defn- upsert!
  [user-id parameter-id value]
  (or (pos? (t2/update! :model/UserParameterValue {:value value} {:user_id      user-id
                                                                  :parameter_id parameter-id}))
      (t2/insert! :model/UserParameterValue {:user_id      user-id
                                             :parameter_id parameter-id
                                             :value        value})))

(mu/defn upsert-or-delete!
  "Upsert or delete parameter value set by the user."
  [user-id      :- ms/PositiveInt
   parameter-id :- ms/NonBlankString
   value        :- [:maybe ms/NonBlankString]]
  ;;WIP
  (upsert! user-id parameter-id value))
