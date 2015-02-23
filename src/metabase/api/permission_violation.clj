(ns metabase.api.annotation
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes POST]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [annotation :refer [PermissionViolation]]
              [database :refer [Database databases-for-org]]
              [org :refer [Org]]
              [common :as common])
            [metabase.util :as util]))

(defendpoint POST "/" [:as {body :body}]
  (check-400 (util/contains-many? body :user :url))
  (check-500 (->> (-> body
                    (select-keys [:user :url])
                    (clojure.set/rename-keys {:user :user_id} ))
               (mapply ins PermissionViolation))))