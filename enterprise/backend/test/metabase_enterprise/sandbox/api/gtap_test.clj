(ns metabase-enterprise.sandbox.api.gtap-test
  (:require [expectations :refer :all]
            [metabase.http-client :as http]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [card :refer [Card]]
             [permissions-group :refer [PermissionsGroup]]
             [table :refer [Table]]]
            [metabase-enterprise.sandbox.models.group-table-access-policy :refer [GroupTableAccessPolicy]]
            [metabase.public-settings.metastore :as metastore]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]))

(defmacro ^:private with-sandboxes-enabled [& body]
  `(with-redefs [metastore/enable-sandboxes? (constantly true)]
     ~@body))

;; Must be authenticated to query for gtaps
(expect (get middleware.u/response-unauthentic :body)
        (with-sandboxes-enabled
          (http/client :get 401 "mt/gtap")))

(expect
  "You don't have permissions to do that."
  (with-sandboxes-enabled
    ((user->client :rasta) :get 403 (str "mt/gtap"))))

(def ^:private default-gtap-results
  {:id                   true
   :card_id              true
   :table_id             true
   :group_id             true
   :attribute_remappings {:foo 1}})

(defmacro ^:private with-gtap-cleanup
  "Invokes `body` ensuring any `GroupTableAccessPolicy` created will be removed afterward. Leaving behind a GTAP can
  case referential integrity failures for any related `Card` that would be cleaned up as part of a `with-temp*` call"
  [& body]
  `(with-sandboxes-enabled
     (tu/with-model-cleanup [GroupTableAccessPolicy]
       ~@body)))

(defn- gtap-post
  "`gtap-data` is a map to be POSTed to the GTAP endpoint"
  [gtap-data]
  ((user->client :crowberto) :post 200 "mt/gtap" gtap-data))

;; ## POST /api/mt/gtap
;; Must have a valid token to use GTAPs
(expect
  #"sandboxing is not enabled"
  (tt/with-temp* [Table            [{table-id :id}]
                  PermissionsGroup [{group-id :id}]
                  Card             [{card-id :id}]]
    ((user->client :crowberto) :post 403 "mt/gtap"
     {:table_id             table-id
      :group_id             group-id
      :card_id              card-id
      :attribute_remappings {"foo" 1}})))

;; Test that we can create a new GTAP
(expect
  [default-gtap-results true]
  (tt/with-temp* [Table            [{table-id :id}]
                  PermissionsGroup [{group-id :id}]
                  Card             [{card-id :id}]]
    (with-gtap-cleanup
      (let [post-results (gtap-post {:table_id             table-id
                                     :group_id             group-id
                                     :card_id              card-id
                                     :attribute_remappings {"foo" 1}})]
        [(tu/boolean-ids-and-timestamps post-results)
         (= post-results ((user->client :crowberto) :get 200 (format "mt/gtap/%s" (:id post-results))))]))))

;; Test that we can create a new GTAP without a card
(expect
  [(assoc default-gtap-results :card_id false)
   true]
  (tt/with-temp* [Table            [{table-id :id}]
                  PermissionsGroup [{group-id :id}]]
    (with-gtap-cleanup
      (let [post-results (gtap-post {:table_id             table-id
                                     :group_id             group-id
                                     :card_id              nil
                                     :attribute_remappings {"foo" 1}})]
        [(tu/boolean-ids-and-timestamps post-results)
         (= post-results ((user->client :crowberto) :get 200 (format "mt/gtap/%s" (:id post-results))))]))))

;; Test that we can delete a GTAP
(expect
  [default-gtap-results
   "Not found."]
  (tt/with-temp* [Table            [{table-id :id}]
                  PermissionsGroup [{group-id :id}]
                  Card             [{card-id :id}]]
    (with-gtap-cleanup
      (let [{:keys [id]} (gtap-post {:table_id             table-id
                                     :group_id             group-id
                                     :card_id              card-id
                                     :attribute_remappings {"foo" 1}})]
        [(tu/boolean-ids-and-timestamps ((user->client :crowberto) :get 200 (format "mt/gtap/%s" id)))
         (do
           ((user->client :crowberto) :delete 204 (format "mt/gtap/%s" id))
           ((user->client :crowberto) :get 404 (format "mt/gtap/%s" id)))]))))

;; ## PUT /api/mt/gtap
;; Test that we can update only the attribute remappings for a GTAP
(expect
  (assoc default-gtap-results :attribute_remappings {:bar 2})
  (tt/with-temp* [Table                  [{table-id :id}]
                  PermissionsGroup       [{group-id :id}]
                  Card                   [{card-id :id}]
                  GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                         :group_id             group-id
                                                         :card_id              card-id
                                                         :attribute_remappings {"foo" 1}}]]
    (with-sandboxes-enabled
      (tu/boolean-ids-and-timestamps
       ((user->client :crowberto) :put 200 (format "mt/gtap/%s" gtap-id)
        {:attribute_remappings {:bar 2}})))))

;; Test that we can add a card_id via PUT
(expect
  default-gtap-results
  (tt/with-temp* [Table                  [{table-id :id}]
                  PermissionsGroup       [{group-id :id}]
                  Card                   [{card-id :id}]
                  GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                         :group_id             group-id
                                                         :card_id              nil
                                                         :attribute_remappings {"foo" 1}}]]
    (with-sandboxes-enabled
      (tu/boolean-ids-and-timestamps
       ((user->client :crowberto) :put 200 (format "mt/gtap/%s" gtap-id)
        {:card_id card-id})))))

;; Test that we can remove a card_id via PUT
(expect
  (assoc default-gtap-results :card_id false)
  (tt/with-temp* [Table                  [{table-id :id}]
                  PermissionsGroup       [{group-id :id}]
                  Card                   [{card-id :id}]
                  GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                         :group_id             group-id
                                                         :card_id              card-id
                                                         :attribute_remappings {"foo" 1}}]]
    (with-sandboxes-enabled
      (tu/boolean-ids-and-timestamps
       ((user->client :crowberto) :put 200 (format "mt/gtap/%s" gtap-id)
        {:card_id nil})))))

;; Test that we can remove a card_id and change attribute remappings via PUT
(expect
  (assoc default-gtap-results :card_id false, :attribute_remappings {:bar 2})
  (tt/with-temp* [Table                  [{table-id :id}]
                  PermissionsGroup       [{group-id :id}]
                  Card                   [{card-id :id}]
                  GroupTableAccessPolicy [{gtap-id :id} {:table_id             table-id
                                                         :group_id             group-id
                                                         :card_id              card-id
                                                         :attribute_remappings {"foo" 1}}]]
    (with-sandboxes-enabled
      (tu/boolean-ids-and-timestamps
       ((user->client :crowberto) :put 200 (format "mt/gtap/%s" gtap-id)
        {:card_id              nil
         :attribute_remappings {:bar 2}})))))
