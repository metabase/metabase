(ns metabase.presence.models.user-presence
  "Ephemeral presence rows for the 'currently viewing' indicator. Rows are
  upserted on every frontend ping and filtered by [[expires-at]] on read."
  (:require
   [methodical.core :as m]
   [toucan2.core :as t2]))

(m/defmethod t2/table-name :model/UserPresence [_model] :user_presence)

(derive :model/UserPresence :metabase/model)
