(ns metabase.api.foreignkey-test
  "tests for /api/foreignkey api endpoints"
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [metabase.db :as db]
            (metabase [http-client :as http]
                      [middleware :as middleware])
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [foreign-key :refer :all]
                             [table :refer [Table]])
            [metabase.test.util :as tu]
            [metabase.test.data.users :refer :all]))


;; ## /api/segment/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-unauthentic :body) (http/client :delete 401 "foreignkey/123"))


;; ## DELETE /api/foreignkey/:id

;; test security.  requires superuser perms
(expect "You don't have permissions to do that."
  ((user->client :rasta) :delete 403 "foreignkey/1"))


(expect
  [{:success true}
   nil]
  (tu/with-temp* [Database   [{database-id :id}]
                  Table      [{table-id :id} {:db_id database-id}]
                  Field      [{field-id :id} {:table_id table-id}]
                  ForeignKey [{:keys [id]}   {:destination_id field-id
                                              :origin_id      field-id
                                              :relationship   "whoot"}]]
    [((user->client :crowberto) :delete 200 (format "foreignkey/%d" id))
     (db/sel :one ForeignKey :id id)]))
