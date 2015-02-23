(ns metabase.api.annotation
  (:require [korma.core :refer [where subselect fields]]
            [compojure.core :refer [defroutes POST]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer :all]
            (metabase.models [permission_violation :refer [PermissionViolation]]
              [database :refer [Database databases-for-org]]
              [org :refer [Org]]
              [common :as common])
            [metabase.util :as util]))

(defendpoint POST "/" [:as {body :body}]
  (require-params user url)
  (check-500 (ins PermissionViolation :user_id user :url url)))
