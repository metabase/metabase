(ns metabase.models.view-log
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.db :refer :all]
            [metabase.events :as events]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))


(defrecord ViewLogItemInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite ViewLogItemInstance :read :public-perms, :write :public-perms)


(defentity ViewLog
           [(table :view_log)]

           (pre-insert [_ log-entry]
                       (let [defaults {:timestamp (u/new-sql-timestamp)}]
                         (merge defaults log-entry))))

(extend-ICanReadWrite ViewLogEntity :read :public-perms, :write :public-perms)
