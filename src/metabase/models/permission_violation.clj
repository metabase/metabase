(ns metabase.models.annotation
  (:require [korma.core :refer :all]
            [metabase.util :as util]))


(defentity PermissionViolation
  (table :core_permissionviolation))


(defmethod pre-insert PermissionViolation [_ permission-violation]
  (let [defaults {:timestamp (util/new-sql-date)}]
    (merge defaults permission-violation)))

