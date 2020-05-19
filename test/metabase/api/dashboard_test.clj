(ns metabase.api.dashboard-test
  "Tests for /api/dashboard endpoints."
  (:require [clojure
             [string :as str]
             [test :refer :all]
             [walk :as walk]]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase
             [http-client :as http]
             [util :as u]]
            [metabase.api
             [card-test :as card-api-test]
             [dashboard :as dashboard-api]]
            [metabase.middleware.util :as middleware.u]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard retrieve-dashboard-card]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [dashboard-test :as dashboard-test]
             [field :refer [Field]]
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :refer [Pulse]]
             [revision :refer [Revision]]
             [table :refer [Table]]]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.util.UUID))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- remove-ids-and-booleanize-timestamps [x]
  (cond
    (map? x)
    (into {} (for [[k v] x]
               (when-not (or (= :id k)
                             (str/ends-with? k "_id"))
                 (if (#{:created_at :updated_at} k)
                   [k (boolean v)]
                   [k (remove-ids-and-booleanize-timestamps v)]))))

    (coll? x)
    (mapv remove-ids-and-booleanize-timestamps x)

    :else
    x))

(defn- user-details [user]
  (select-keys user [:common_name :date_joined :email :first_name :id :is_qbnewb :is_superuser :last_login :last_name]))

(defn- dashcard-response [{:keys [card created_at updated_at] :as dashcard}]
  (-> (into {} dashcard)
      (dissoc :id :dashboard_id :card_id)
      (assoc :created_at (boolean created_at)
             :updated_at (boolean updated_at)
             :card       (-> (into {} card)
                             (dissoc :id :database_id :table_id :created_at :updated_at :query_average_duration)
                             (update :collection_id boolean)))))

(defn- dashboard-response [{:keys [creator ordered_cards created_at updated_at] :as dashboard}]
  (let [dash (-> (into {} dashboard)
                 (dissoc :id)
                 (assoc :created_at (boolean created_at)
                        :updated_at (boolean updated_at))
                 (update :collection_id boolean))]
    (cond-> dash
      creator       (update :creator #(into {} %))
      ordered_cards (update :ordered_cards #(mapv dashcard-response %)))))

(defn- do-with-dashboards-in-a-collection [grant-collection-perms-fn! dashboards-or-ids f]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (grant-collection-perms-fn! (group/all-users) collection)
      (doseq [dashboard-or-id dashboards-or-ids]
        (db/update! Dashboard (u/get-id dashboard-or-id) :collection_id (u/get-id collection)))
      (f))))

(defmacro ^:private with-dashboards-in-readable-collection [dashboards-or-ids & body]
  `(do-with-dashboards-in-a-collection perms/grant-collection-read-permissions! ~dashboards-or-ids (fn [] ~@body)))

(defmacro ^:private with-dashboards-in-writeable-collection [dashboards-or-ids & body]
  `(do-with-dashboards-in-a-collection perms/grant-collection-readwrite-permissions! ~dashboards-or-ids (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     /api/dashboard/* AUTHENTICATION Tests                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware.u/response-unauthentic :body) (http/client :get 401 "dashboard"))
(expect (get middleware.u/response-unauthentic :body) (http/client :put 401 "dashboard/13"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/dashboard                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test validations
(expect {:errors {:name "value must be a non-blank string."}}
  ((user->client :rasta) :post 400 "dashboard" {}))

(expect
  {:errors {:parameters "value must be an array. Each value must be a map."}}
  ((user->client :crowberto) :post 400 "dashboard" {:name       "Test"
                                                    :parameters "abc"}))

(def ^:private dashboard-defaults
  {:archived                false
   :caveats                 nil
   :collection_id           nil
   :collection_position     nil
   :created_at              true ; assuming you call dashboard-response on the results
   :description             nil
   :embedding_params        nil
   :enable_embedding        false
   :made_public_by_id       nil
   :parameters              []
   :points_of_interest      nil
   :position                nil
   :public_uuid             nil
   :show_in_getting_started false
   :updated_at              true})

(expect
  (merge dashboard-defaults
         {:name          "Test Create Dashboard"
          :creator_id    (user->id :rasta)
          :parameters    [{:hash "abc123", :name "test", :type "date"}]
          :updated_at    true
          :created_at    true
          :collection_id true})
  (tu/with-non-admin-groups-no-root-collection-perms
    (tu/with-model-cleanup [Dashboard]
      (tt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        (-> ((user->client :rasta) :post 200 "dashboard" {:name          "Test Create Dashboard"
                                                          :parameters    [{:hash "abc123", :name "test", :type "date"}]
                                                          :collection_id (u/get-id collection)})
            dashboard-response)))))

;; Make sure we can create a Dashboard with a Collection position
(expect
  #metabase.models.dashboard.DashboardInstance{:collection_id true, :collection_position 1000}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tu/with-model-cleanup [Dashboard]
      (let [dashboard-name (tu/random-name)]
        (tt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          ((user->client :rasta) :post 200 "dashboard" {:name                dashboard-name
                                                        :collection_id       (u/get-id collection)
                                                        :collection_position 1000})
          (some-> (db/select-one [Dashboard :collection_id :collection_position] :name dashboard-name)
                  (update :collection_id (partial = (u/get-id collection)))))))))

;; ...but not if we don't have permissions for the Collection
(expect
  nil
  (tu/with-non-admin-groups-no-root-collection-perms
    (tu/with-model-cleanup [Dashboard]
      (let [dashboard-name (tu/random-name)]
        (tt/with-temp Collection [collection]
          ((user->client :rasta) :post 403 "dashboard" {:name                dashboard-name
                                                        :collection_id       (u/get-id collection)
                                                        :collection_position 1000})
          (some-> (db/select-one [Dashboard :collection_id :collection_position] :name dashboard-name)
                  (update :collection_id (partial = (u/get-id collection)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             GET /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  (merge dashboard-defaults
         {:name          "Test Dashboard"
          :creator_id    (user->id :rasta)
          :collection_id true
          :can_write     false
          :param_values  nil
          :param_fields  nil
          :ordered_cards [{:sizeX                  2
                           :sizeY                  2
                           :col                    0
                           :row                    0
                           :updated_at             true
                           :created_at             true
                           :parameter_mappings     []
                           :visualization_settings {}
                           :card                   (merge card-api-test/card-defaults
                                                          {:name                   "Dashboard Test Card"
                                                           :creator_id             (user->id :rasta)
                                                           :collection_id          true
                                                           :display                "table"
                                                           :visualization_settings {}
                                                           :result_metadata        nil})
                           :series                 []}]})
  ;; fetch a dashboard WITH a dashboard card on it
  (tt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                  Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                  DashboardCard [_                  {:dashboard_id dashboard-id, :card_id card-id}]]
    (with-dashboards-in-readable-collection [dashboard-id]
      (card-api-test/with-cards-in-readable-collection [card-id]
        (dashboard-response ((user->client :rasta) :get 200 (format "dashboard/%d" dashboard-id)))))))

;; As above, but with a param
(tt/expect-with-temp [Table         [{table-id :id} {}]
                      Field         [{field-id :id display-name :display_name} {:table_id table-id}]

                      Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                      DashboardCard [{dc-id :id}        {:dashboard_id       dashboard-id
                                                         :card_id            card-id
                                                         :parameter_mappings [{:card_id      1
                                                                               :parameter_id "foo"
                                                                               :target       [:dimension [:field_id field-id]]}]}]]
  (merge dashboard-defaults
         {:name          "Test Dashboard"
          :creator_id    (user->id :rasta)
          :collection_id true
          :can_write     false
          :param_values  {}
          :param_fields  {(keyword (str field-id)) {:id               field-id
                                                    :table_id         table-id
                                                    :display_name     display-name
                                                    :base_type        "type/Text"
                                                    :special_type     nil
                                                    :has_field_values "search"
                                                    :name_field       nil
                                                    :dimensions       []}}
          :ordered_cards [{:sizeX                  2
                           :sizeY                  2
                           :col                    0
                           :row                    0
                           :updated_at             true
                           :created_at             true
                           :parameter_mappings     [{:card_id      1
                                                     :parameter_id "foo"
                                                     :target       ["dimension" ["field-id" field-id]]}]
                           :visualization_settings {}
                           :card                   (merge card-api-test/card-defaults
                                                          {:name                   "Dashboard Test Card"
                                                           :creator_id             (user->id :rasta)
                                                           :collection_id          true
                                                           :display                "table"
                                                           :query_type             nil
                                                           :visualization_settings {}
                                                           :result_metadata        nil})
                           :series                 []}]})
  ;; fetch a dashboard WITH a dashboard card on it
  (with-dashboards-in-readable-collection [dashboard-id]
    (card-api-test/with-cards-in-readable-collection [card-id]
      (dashboard-response ((user->client :rasta) :get 200 (format "dashboard/%d" dashboard-id))))))

;; ## GET /api/dashboard/:id with a series, should fail if the user doesn't have access to the collection
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection          [{coll-id :id}      {:name "Collection 1"}]
                    Dashboard           [{dashboard-id :id} {:name       "Test Dashboard"
                                                             :creator_id (user->id :crowberto)}]
                    Card                [{card-id :id}      {:name          "Dashboard Test Card"
                                                             :collection_id coll-id}]
                    Card                [{card-id2 :id}     {:name          "Dashboard Test Card 2"
                                                             :collection_id coll-id}]
                    DashboardCard       [{dbc_id :id}       {:dashboard_id dashboard-id, :card_id card-id}]
                    DashboardCardSeries [_                  {:dashboardcard_id dbc_id, :card_id card-id2, :position 0}]]
      ((user->client :rasta) :get 403 (format "dashboard/%d" dashboard-id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             PUT /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-test
  (testing "PUT /api/dashboard/:id"
    (tt/with-temp Dashboard [{dashboard-id :id} {:name "Test Dashboard"}]
      (with-dashboards-in-writeable-collection [dashboard-id]
        (testing "GET before update"
          (is (= (merge dashboard-defaults {:name          "Test Dashboard"
                                            :creator_id    (user->id :rasta)
                                            :collection_id true})
                 (dashboard-response (Dashboard dashboard-id)))))

        (testing "PUT response"
          (is (= (merge dashboard-defaults {:name          "My Cool Dashboard"
                                            :description   "Some awesome description"
                                            :creator_id    (user->id :rasta)
                                            :collection_id true})
                 (dashboard-response
                  ((user->client :rasta) :put 200 (str "dashboard/" dashboard-id)
                   {:name        "My Cool Dashboard"
                    :description "Some awesome description"
                    ;; these things should fail to update
                    :creator_id  (user->id :trashbird)})))))

        (testing "GET after update"
          (is (= (merge dashboard-defaults {:name          "My Cool Dashboard"
                                            :description   "Some awesome description"
                                            :creator_id    (user->id :rasta)
                                            :collection_id true})
                 (dashboard-response (Dashboard dashboard-id)))))))))

;; allow "caveats" and "points_of_interest" to be empty strings, and "show_in_getting_started" should be a boolean
(expect
  (merge dashboard-defaults {:name                    "Test Dashboard"
                             :creator_id              (user->id :rasta)
                             :collection_id           true
                             :caveats                 ""
                             :points_of_interest      ""
                             :show_in_getting_started true})
  (tt/with-temp Dashboard [{dashboard-id :id} {:name "Test Dashboard"}]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (dashboard-response ((user->client :rasta) :put 200 (str "dashboard/" dashboard-id)
                           {:caveats                 ""
                            :points_of_interest      ""
                            :show_in_getting_started true})))))

;; Can we clear the description of a Dashboard? (#4738)
(expect
  nil
  (tt/with-temp Dashboard [dashboard {:description "What a nice Dashboard"}]
    (with-dashboards-in-writeable-collection [dashboard]
      ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard)) {:description nil})
      (db/select-one-field :description Dashboard :id (u/get-id dashboard)))))

(expect
  ""
  (tt/with-temp Dashboard [dashboard {:description "What a nice Dashboard"}]
    (with-dashboards-in-writeable-collection [dashboard]
      ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard)) {:description ""})
      (db/select-one-field :description Dashboard :id (u/get-id dashboard)))))

;; Can we change the Collection a Dashboard is in (assuming we have the permissions to do so)?
(expect
  (dashboard-test/with-dash-in-collection [db collection dash]
    (tt/with-temp Collection [new-collection]
      ;; grant Permissions for both new and old collections
      (doseq [coll [collection new-collection]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) coll))
      ;; now make an API call to move collections
      ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id dash)) {:collection_id (u/get-id new-collection)})
      ;; Check to make sure the ID has changed in the DB
      (= (db/select-one-field :collection_id Dashboard :id (u/get-id dash))
         (u/get-id new-collection)))))

;; ...but if we don't have the Permissions for the old collection, we should get an Exception
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (dashboard-test/with-dash-in-collection [db collection dash]
      (tt/with-temp Collection [new-collection]
        ;; grant Permissions for only the *new* collection
        (perms/grant-collection-readwrite-permissions! (group/all-users) new-collection)
        ;; now make an API call to move collections. Should fail
        ((user->client :rasta) :put 403 (str "dashboard/" (u/get-id dash)) {:collection_id (u/get-id new-collection)})))))

;; ...and if we don't have the Permissions for the new collection, we should get an Exception
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (dashboard-test/with-dash-in-collection [db collection dash]
      (tt/with-temp Collection [new-collection]
        ;; grant Permissions for only the *old* collection
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        ;; now make an API call to move collections. Should fail
        ((user->client :rasta) :put 403 (str "dashboard/" (u/get-id dash)) {:collection_id (u/get-id new-collection)})))))

;; Can we change the Collection position of a Dashboard?
(expect
  1
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Dashboard  [dashboard {:collection_id (u/get-id collection)}]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
      ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard))
       {:collection_position 1})
      (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard)))))

;; ...and unset (unpin) it as well?
(expect
  nil
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Dashboard  [dashboard {:collection_id (u/get-id collection), :collection_position 1}]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
      ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard))
       {:collection_position nil})
      (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard)))))

;; ...we shouldn't be able to if we don't have permissions for the Collection
(expect
  nil
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Dashboard  [dashboard {:collection_id (u/get-id collection)}]]
      ((user->client :rasta) :put 403 (str "dashboard/" (u/get-id dashboard))
       {:collection_position 1})
      (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard)))))

(expect
  1
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection]
                    Dashboard  [dashboard {:collection_id (u/get-id collection), :collection_position 1}]]
      ((user->client :rasta) :put 403 (str "dashboard/" (u/get-id dashboard))
       {:collection_position nil})
      (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              UPDATING DASHBOARD COLLECTION POSITIONS                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that we can update a dashboard's position in a collection of only dashboards
(expect
  {"a" 1
   "c" 2
   "d" 3
   "b" 4}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (card-api-test/with-ordered-items collection [Dashboard a
                                                    Dashboard b
                                                    Dashboard c
                                                    Dashboard d]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id b))
         {:collection_position 4})
        (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating a dashboard at position 3 to position 1 will increment the positions before 3, not after
(expect
  {"c" 1
   "a" 2
   "b" 3
   "d" 4}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (card-api-test/with-ordered-items collection [Card      a
                                                    Pulse     b
                                                    Dashboard c
                                                    Dashboard d]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id c))
         {:collection_position 1})
        (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating position 1 to 3 will cause b and c to be decremented
(expect
  {"b" 1
   "c" 2
   "a" 3
   "d" 4}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (card-api-test/with-ordered-items collection [Dashboard a
                                                    Card      b
                                                    Pulse     c
                                                    Dashboard d]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id a))
         {:collection_position 3})
        (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating position 1 to 4 will cause a through c to be decremented
(expect
  {"b" 1
   "c" 2
   "d" 3
   "a" 4}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (card-api-test/with-ordered-items collection [Dashboard a
                                                    Card      b
                                                    Pulse     c
                                                    Pulse     d]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id a))
         {:collection_position 4})
        (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating position 4 to 1 will cause a through c to be incremented
(expect
  {"d" 1
   "a" 2
   "b" 3
   "c" 4}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (card-api-test/with-ordered-items collection [Card      a
                                                    Pulse     b
                                                    Card      c
                                                    Dashboard d]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id d))
         {:collection_position 1})
        (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that moving a dashboard to another collection will fixup both collections
(expect
  [{"b" 1
    "c" 2
    "d" 3}
   {"a" 1
    "e" 2
    "f" 3
    "g" 4
    "h" 5}]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-1]
                    Collection [collection-2]]
      (card-api-test/with-ordered-items collection-1 [Dashboard a
                                                      Card      b
                                                      Card      c
                                                      Pulse     d]
        (card-api-test/with-ordered-items collection-2 [Pulse     e
                                                        Pulse     f
                                                        Dashboard g
                                                        Card      h]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection-1)
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection-2)
          ;; Move the first dashboard in collection-1 to collection-1
          ((user->client :rasta) :put 200 (str "dashboard/" (u/get-id a))
           {:collection_position 1, :collection_id (u/get-id collection-2)})
          ;; "a" should now be gone from collection-1 and all the existing dashboards bumped down in position
          [(card-api-test/get-name->collection-position :rasta collection-1)
           ;; "a" is now first, all other dashboards in collection-2 bumped down 1
           (card-api-test/get-name->collection-position :rasta collection-2)])))))

;; Check that adding a new card at position 3 will cause the existing card at 3 to be incremented
(expect
  [{"a" 1
    "b" 2
    "d" 3}
   {"a" 1
    "b" 2
    "c" 3
    "d" 4}]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (tu/with-model-cleanup [Dashboard]
        (card-api-test/with-ordered-items collection [Card  a
                                                      Pulse b
                                                      Card  d]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          [(card-api-test/get-name->collection-position :rasta collection)
           (do
             ((user->client :rasta) :post 200 "dashboard" {:name                "c"
                                                           :parameters          [{}]
                                                           :collection_id       (u/get-id collection)
                                                           :collection_position 3})
             (card-api-test/get-name->collection-position :rasta collection))])))))

;; Check that adding a new card without a position, leaves the existing positions unchanged
(expect
  [{"a" 1
    "b" 2
    "d" 3}
   {"a" 1
    "b" 2
    "c" nil
    "d" 3}]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (tu/with-model-cleanup [Dashboard]
        (card-api-test/with-ordered-items collection [Dashboard a
                                                      Card      b
                                                      Pulse     d]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          [(card-api-test/get-name->collection-position :rasta collection)
           (do
             ((user->client :rasta) :post 200 "dashboard" {:name          "c"
                                                           :parameters    [{}]
                                                           :collection_id (u/get-id collection)})
             (card-api-test/get-name->collection-position :rasta collection))])))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           DELETE /api/dashboard/:id                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-test
  (tt/with-temp Dashboard [{dashboard-id :id}]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (is (= nil
             ((user->client :rasta) :delete 204 (format "dashboard/%d" dashboard-id))))
      (is (= nil
             (Dashboard dashboard-id))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         COPY /api/dashboard/:id/copy                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

;; A plain copy with nothing special
(expect (merge dashboard-defaults
               {:name               "Test Dashboard"
                :description        "A description"
                :creator_id         (user->id :rasta)
                :collection_id      false})
        (tt/with-temp Dashboard  [{dashboard-id :id} {:name         "Test Dashboard"
                                                      :description  "A description"
                                                      :creator_id   (user->id :rasta)}]
          (tu/with-model-cleanup [Dashboard]
            (dashboard-response ((user->client :rasta) :post 200 (format "dashboard/%d/copy" dashboard-id))))))

;; Ensure name / description / user set when copying
(expect (merge dashboard-defaults
               {:name           "Test Dashboard - Duplicate"
                :description    "A new description"
                :creator_id     (user->id :crowberto)
                :collection_id  false})
        (tt/with-temp Dashboard [{dashboard-id :id}  {:name           "Test Dashboard"
                                                      :description    "An old description"}]
          (tu/with-model-cleanup [Dashboard]
            (dashboard-response ((user->client :crowberto) :post 200 (format "dashboard/%d/copy" dashboard-id)
              {:name             "Test Dashboard - Duplicate"
               :description      "A new description"})))))

;; Ensure dashboard cards are copied
(expect
  2
  (tt/with-temp* [Dashboard     [{dashboard-id :id}  {:name "Test Dashboard"}]
                  Card          [{card-id :id}]
                  Card          [{card-id2 :id}]
                  DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                  DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id2}]]
    (tu/with-model-cleanup [Dashboard]
      (count (db/select-ids DashboardCard, :dashboard_id
        (u/get-id ((user->client :rasta) :post 200 (format "dashboard/%d/copy" dashboard-id))))))))

;; Ensure the correct collection is set when copying
(expect
  (tu/with-model-cleanup [Dashboard]
    (dashboard-test/with-dash-in-collection [db collection dash]
      (tt/with-temp Collection [new-collection]
        ;; grant Permissions for both new and old collections
        (doseq [coll [collection new-collection]]
          (perms/grant-collection-readwrite-permissions! (group/all-users) coll))
        ;; Check to make sure the ID of the collection is correct
        (= (db/select-one-field :collection_id Dashboard :id
              (u/get-id ((user->client :rasta) :post 200 (format "dashboard/%d/copy" (u/get-id dash)) {:collection_id (u/get-id new-collection)})))
          (u/get-id new-collection))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/cards                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest simple-creation-with-no-additional-series-test
  (tt/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (card-api-test/with-cards-in-readable-collection [card-id]
        (is (= {:sizeX                  2
                :sizeY                  2
                :col                    4
                :row                    4
                :series                 []
                :parameter_mappings     [{:card-id 123, :hash "abc", :target "foo"}]
                :visualization_settings {}
                :created_at             true
                :updated_at             true}
               (-> ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id)
                    {:cardId                 card-id
                     :row                    4
                     :col                    4
                     :parameter_mappings     [{:card-id 123, :hash "abc", :target "foo"}]
                     :visualization_settings {}})
                   (dissoc :id :dashboard_id :card_id)
                   (update :created_at boolean)
                   (update :updated_at boolean))))
        (is (= [{:sizeX                  2
                 :sizeY                  2
                 :col                    4
                 :row                    4
                 :parameter_mappings     [{:card-id 123, :hash "abc", :target "foo"}]
                 :visualization_settings {}}]
               (map (partial into {})
                    (db/select [DashboardCard :sizeX :sizeY :col :row :parameter_mappings :visualization_settings]
                      :dashboard_id dashboard-id))))))))

(deftest new-dashboard-card-with-additional-series-test
  (tt/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]
                  Card      [{series-id-1 :id} {:name "Series Card"}]]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (card-api-test/with-cards-in-readable-collection [card-id series-id-1]
        (let [dashboard-card ((user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id)
                              {:cardId card-id
                               :row    4
                               :col    4
                               :series [{:id series-id-1}]})]
          (is (= {:sizeX                  2
                  :sizeY                  2
                  :col                    4
                  :row                    4
                  :parameter_mappings     []
                  :visualization_settings {}
                  :series                 [{:name                   "Series Card"
                                            :description            nil
                                            :dataset_query          (:dataset_query card-api-test/card-defaults)
                                            :display                "table"
                                            :visualization_settings {}}]
                  :created_at             true
                  :updated_at             true}
                 (remove-ids-and-booleanize-timestamps dashboard-card)))
          (is (= [{:sizeX 2
                   :sizeY 2
                   :col   4
                   :row   4}]
                 (map (partial into {})
                      (db/select [DashboardCard :sizeX :sizeY :col :row], :dashboard_id dashboard-id))))
          (is (= #{0}
                 (db/select-field :position DashboardCardSeries, :dashboardcard_id (:id dashboard-card)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        DELETE /api/dashboard/:id/cards                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-cards-test
  (testing "DELETE /api/dashboard/id/:cards"
    ;; fetch a dashboard WITH a dashboard card on it
    (tt/with-temp* [Dashboard           [{dashboard-id :id}]
                    Card                [{card-id :id}]
                    Card                [{series-id-1 :id}]
                    Card                [{series-id-2 :id}]
                    DashboardCard       [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                    DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-1, :position 0}]
                    DashboardCardSeries [_                 {:dashboardcard_id dashcard-id, :card_id series-id-2, :position 1}]]
      (with-dashboards-in-writeable-collection [dashboard-id]
        (is (= 1
               (count (db/select-ids DashboardCard, :dashboard_id dashboard-id))))
        (is (= {:success true}
               ((user->client :rasta) :delete 200 (format "dashboard/%d/cards" dashboard-id) :dashcardId dashcard-id)))
        (is (= 0
               (count (db/select-ids DashboardCard, :dashboard_id dashboard-id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          PUT /api/dashboard/:id/cards                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-cards-test
  (testing "PUT /api/dashboard/:id/cards"
    ;; fetch a dashboard WITH a dashboard card on it
    (tt/with-temp* [Dashboard     [{dashboard-id :id}]
                    Card          [{card-id :id}]
                    DashboardCard [{dashcard-id-1 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                    DashboardCard [{dashcard-id-2 :id} {:dashboard_id dashboard-id, :card_id card-id}]
                    Card          [{series-id-1 :id}   {:name "Series Card"}]]
      (with-dashboards-in-writeable-collection [dashboard-id]
        (is (= {:sizeX                  2
                :sizeY                  2
                :col                    0
                :row                    0
                :series                 []
                :parameter_mappings     []
                :visualization_settings {}
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (retrieve-dashboard-card dashcard-id-1))))
        (is (= {:sizeX                  2
                :sizeY                  2
                :col                    0
                :row                    0
                :parameter_mappings     []
                :visualization_settings {}
                :series                 []
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (retrieve-dashboard-card dashcard-id-2))))
        (is (= {:status "ok"}
               ((user->client :rasta) :put 200 (format "dashboard/%d/cards" dashboard-id)
                {:cards [{:id     dashcard-id-1
                          :sizeX  4
                          :sizeY  2
                          :col    0
                          :row    0
                          :series [{:id series-id-1}]}
                         {:id    dashcard-id-2
                          :sizeX 1
                          :sizeY 1
                          :col   1
                          :row   3}]})))
        (is (= {:sizeX                  4
                :sizeY                  2
                :col                    0
                :row                    0
                :parameter_mappings     []
                :visualization_settings {}
                :series                 [{:name                   "Series Card"
                                          :description            nil
                                          :display                :table
                                          :dataset_query          {}
                                          :visualization_settings {}}]
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (retrieve-dashboard-card dashcard-id-1))))
        (is (= {:sizeX                  1
                :sizeY                  1
                :col                    1
                :row                    3
                :parameter_mappings     []
                :visualization_settings {}
                :series                 []
                :created_at             true
                :updated_at             true}
               (remove-ids-and-booleanize-timestamps (retrieve-dashboard-card dashcard-id-2))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        GET /api/dashboard/:id/revisions                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  [{:is_reversion false
    :is_creation  false
    :message      "updated"
    :user         (-> (user-details (fetch-user :crowberto))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         {:before {:name        "b"
                            :description nil
                            :cards       [{:series nil, :sizeY 2, :sizeX 2}]}
                   :after  {:name        "c"
                            :description "something"
                            :cards       [{:series [8 9], :sizeY 3, :sizeX 4}]}}
    :description  "renamed it from \"b\" to \"c\", added a description, rearranged the cards and added some series to card 123."}
   {:is_reversion false
    :is_creation  true
    :message      nil
    :user         (-> (user-details (fetch-user :rasta))
                      (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
    :diff         nil
    :description  nil}]
  (tt/with-temp* [Dashboard [{dashboard-id :id}]
                  Revision  [_ {:model        "Dashboard"
                                :model_id     dashboard-id
                                :object       {:name         "b"
                                               :description  nil
                                               :cards        [{:sizeX   2
                                                               :sizeY   2
                                                               :row     0
                                                               :col     0
                                                               :card_id 123
                                                               :series  []}]}
                                :is_creation  true}]
                  Revision  [_ {:model    "Dashboard"
                                :model_id dashboard-id
                                :user_id  (user->id :crowberto)
                                :object   {:name         "c"
                                           :description  "something"
                                           :cards        [{:sizeX   4
                                                           :sizeY   3
                                                           :row     0
                                                           :col     0
                                                           :card_id 123
                                                           :series  [8 9]}]}
                                :message  "updated"}]]
    (doall (for [revision ((user->client :crowberto) :get 200 (format "dashboard/%d/revisions" dashboard-id))]
             (dissoc revision :timestamp :id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/revert                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revert-dashboard-test
  (testing "POST /api/dashboard/:id/revert"
    (testing "parameter validation"
      (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
             ((user->client :crowberto) :post 400 "dashboard/1/revert" {})))
      (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
             ((user->client :crowberto) :post 400 "dashboard/1/revert" {:revision_id "foobar"})))      )
    (tt/with-temp* [Dashboard [{dashboard-id :id}]
                    Revision  [{revision-id :id} {:model       "Dashboard"
                                                  :model_id    dashboard-id
                                                  :object      {:name        "a"
                                                                :description nil
                                                                :cards       []}
                                                  :is_creation true}]
                    Revision  [_                 {:model    "Dashboard"
                                                  :model_id dashboard-id
                                                  :user_id  (user->id :crowberto)
                                                  :object   {:name        "b"
                                                             :description nil
                                                             :cards       []}
                                                  :message  "updated"}]]
      (is (= {:is_reversion true
              :is_creation  false
              :message      nil
              :user         (-> (user-details (fetch-user :crowberto))
                                (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
              :diff         {:before {:name "b"}
                             :after  {:name "a"}}
              :description  "renamed it from \"b\" to \"a\"."}
             (dissoc ((user->client :crowberto) :post 200 (format "dashboard/%d/revert" dashboard-id)
                      {:revision_id revision-id})
                     :id :timestamp)))

      (is (= [{:is_reversion true
               :is_creation  false
               :message      nil
               :user         (-> (user-details (fetch-user :crowberto))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:before {:name "b"}
                              :after  {:name "a"}}
               :description  "renamed it from \"b\" to \"a\"."}
              {:is_reversion false
               :is_creation  false
               :message      "updated"
               :user         (-> (user-details (fetch-user :crowberto))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:before {:name "a"}
                              :after  {:name "b"}}
               :description  "renamed it from \"a\" to \"b\"."}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         (-> (user-details (fetch-user :rasta))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         nil
               :description  nil}]
             (doall (for [revision ((user->client :crowberto) :get 200 (format "dashboard/%d/revisions" dashboard-id))]
                      (dissoc revision :timestamp :id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-dashboard []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (user->id :crowberto)})

;;; -------------------------------------- POST /api/dashboard/:id/public_link ---------------------------------------

;; Test that we can share a Dashboard
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard]
      (let [{uuid :uuid} ((user->client :crowberto) :post 200 (format "dashboard/%d/public_link" (u/get-id dashboard)))]
        (db/exists? Dashboard :id (u/get-id dashboard), :public_uuid uuid)))))

;; Test that we *cannot* share a Dashboard if we aren't admins
(expect
  "You don't have permissions to do that."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard]
      ((user->client :rasta) :post 403 (format "dashboard/%d/public_link" (u/get-id dashboard))))))

;; Test that we *cannot* share a Dashboard if the setting is disabled
(expect
  "Public sharing is not enabled."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (tt/with-temp Dashboard [dashboard]
      ((user->client :crowberto) :post 400 (format "dashboard/%d/public_link" (u/get-id dashboard))))))

;; Test that we get a 404 if the Dashboard doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    ((user->client :crowberto) :post 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE))))

;; Test that if a Dashboard has already been shared we reüse the existing UUID
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard (shared-dashboard)]
      (= (:public_uuid dashboard)
         (:uuid ((user->client :crowberto) :post 200 (format "dashboard/%d/public_link" (u/get-id dashboard))))))))



;;; ------------------------------------- DELETE /api/dashboard/:id/public_link --------------------------------------

;; Test that we can unshare a Dashboard
(expect
  false
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard (shared-dashboard)]
      ((user->client :crowberto) :delete 204 (format "dashboard/%d/public_link" (u/get-id dashboard)))
      (db/exists? Dashboard :id (u/get-id dashboard), :public_uuid (:public_uuid dashboard)))))

;; Test that we *cannot* unshare a Dashboard if we are not admins
(expect
  "You don't have permissions to do that."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard (shared-dashboard)]
      ((user->client :rasta) :delete 403 (format "dashboard/%d/public_link" (u/get-id dashboard))))))

;; Test that we get a 404 if Dashboard isn't shared
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard]
      ((user->client :crowberto) :delete 404 (format "dashboard/%d/public_link" (u/get-id dashboard))))))

;; Test that we get a 404 if Dashboard doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    ((user->client :crowberto) :delete 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE))))

;; Test that we can fetch a list of publicly-accessible dashboards
(expect
  [{:name true, :id true, :public_uuid true}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Dashboard [dashboard (shared-dashboard)]
      (for [dash ((user->client :crowberto) :get 200 "dashboard/public")]
        (m/map-vals boolean (select-keys dash [:name :id :public_uuid]))))))

;; Test that we can fetch a list of embeddable-accessible dashboards
(expect
  [{:name true, :id true}]
  (tu/with-temporary-setting-values [enable-embedding true]
    (tt/with-temp Dashboard [dashboard {:enable_embedding true}]
      (for [dash ((user->client :crowberto) :get 200 "dashboard/embeddable")]
        (m/map-vals boolean (select-keys dash [:name :id]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Tests for including query average duration info                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- vectorize-byte-arrays
  "Walk form X and convert any byte arrays in the results to standard Clojure vectors. This is useful when writing
  tests that return byte arrays (such as things that work with query hashes),since identical arrays are not considered
  equal."
  {:style/indent 0}
  [x]
  (walk/postwalk (fn [form]
                   (if (instance? (Class/forName "[B") form)
                     (vec form)
                     form))
                 x))

(expect
  [[-109 -42 53 92 -31 19 -111 13 -11 -111 127 -110 -12 53 -42 -3 -58 -61 60 97 123 -65 -117 -110 -27 -2 -99 102 -59 -29 49 27]
   [43 -96 52 23 -69 81 -59 15 -74 -59 -83 -9 -110 40 1 -64 -117 -44 -67 79 -123 -9 -107 20 113 -59 -93 25 60 124 -110 -30]]
  (vectorize-byte-arrays
   (#'dashboard-api/dashcard->query-hashes {:card {:dataset_query {:database 1}}})))

(expect
  [[89 -75 -86 117 -35 -13 -69 -36 -17 84 37 86 -121 -59 -3 1 37 -117 -86 -42 -127 -42 -74 101 83 72 10 44 75 -126 43 66]
   [55 56 16 11 -121 -29 71 -99 -89 -92 41 25 87 -78 34 100 54 -3 53 -9 38 41 -75 -121 63 -119 43 23 57 11 63 32]
   [-90 55 65 61 72 22 -99 -75 111 49 -3 21 -80 68 -14 120 30 -84 -103 16 -68 73 -121 -93 -55 54 72 84 -8 118 -101 114]
   [116 69 -44 77 100 8 -40 -67 25 -4 27 -21 111 98 -45 85 83 -27 -39 8 63 -25 -88 74 32 -10 -2 35 102 -72 -104 111]
   [-84 -2 87 22 -4 105 68 48 -113 93 -29 52 3 102 123 -70 -123 36 31 76 -16 87 70 116 -93 109 -88 108 125 -36 -43 73]
   [90 127 103 -71 -76 -36 41 -107 -7 -13 -83 -87 28 86 -94 110 74 -86 110 -54 -128 124 102 -73 -127 88 77 -36 62 5 -84 -100]]
  (vectorize-byte-arrays
    (#'dashboard-api/dashcard->query-hashes {:card   {:dataset_query {:database 2}}
                                             :series [{:dataset_query {:database 3}}
                                                      {:dataset_query {:database 4}}]})))

(expect
  [[-109 -42 53 92 -31 19 -111 13 -11 -111 127 -110 -12 53 -42 -3 -58 -61 60 97 123 -65 -117 -110 -27 -2 -99 102 -59 -29 49 27]
   [43 -96 52 23 -69 81 -59 15 -74 -59 -83 -9 -110 40 1 -64 -117 -44 -67 79 -123 -9 -107 20 113 -59 -93 25 60 124 -110 -30]
   [89 -75 -86 117 -35 -13 -69 -36 -17 84 37 86 -121 -59 -3 1 37 -117 -86 -42 -127 -42 -74 101 83 72 10 44 75 -126 43 66]
   [55 56 16 11 -121 -29 71 -99 -89 -92 41 25 87 -78 34 100 54 -3 53 -9 38 41 -75 -121 63 -119 43 23 57 11 63 32]
   [-90 55 65 61 72 22 -99 -75 111 49 -3 21 -80 68 -14 120 30 -84 -103 16 -68 73 -121 -93 -55 54 72 84 -8 118 -101 114]
   [116 69 -44 77 100 8 -40 -67 25 -4 27 -21 111 98 -45 85 83 -27 -39 8 63 -25 -88 74 32 -10 -2 35 102 -72 -104 111]
   [-84 -2 87 22 -4 105 68 48 -113 93 -29 52 3 102 123 -70 -123 36 31 76 -16 87 70 116 -93 109 -88 108 125 -36 -43 73]
   [90 127 103 -71 -76 -36 41 -107 -7 -13 -83 -87 28 86 -94 110 74 -86 110 -54 -128 124 102 -73 -127 88 77 -36 62 5 -84 -100]]
  (vectorize-byte-arrays (#'dashboard-api/dashcards->query-hashes [{:card   {:dataset_query {:database 1}}}
                                                                      {:card   {:dataset_query {:database 2}}
                                                                       :series [{:dataset_query {:database 3}}
                                                                                {:dataset_query {:database 4}}]}])))

(expect
  [{:card   {:dataset_query {:database 1}, :query_average_duration 111}
    :series []}
   {:card   {:dataset_query {:database 2}, :query_average_duration 333}
    :series [{:dataset_query {:database 3}, :query_average_duration 555}
             {:dataset_query {:database 4}, :query_average_duration 777}]}]
  (#'dashboard-api/add-query-average-duration-to-dashcards
   [{:card   {:dataset_query {:database 1}}}
    {:card   {:dataset_query {:database 2}}
     :series [{:dataset_query {:database 3}}
              {:dataset_query {:database 4}}]}]
   {[-109 -42 53 92 -31 19 -111 13 -11 -111 127 -110 -12 53 -42 -3 -58 -61 60 97 123 -65 -117 -110 -27 -2 -99 102 -59 -29 49 27] 111
    [43 -96 52 23 -69 81 -59 15 -74 -59 -83 -9 -110 40 1 -64 -117 -44 -67 79 -123 -9 -107 20 113 -59 -93 25 60 124 -110 -30]     222
    [89 -75 -86 117 -35 -13 -69 -36 -17 84 37 86 -121 -59 -3 1 37 -117 -86 -42 -127 -42 -74 101 83 72 10 44 75 -126 43 66]       333
    [55 56 16 11 -121 -29 71 -99 -89 -92 41 25 87 -78 34 100 54 -3 53 -9 38 41 -75 -121 63 -119 43 23 57 11 63 32]               444
    [-90 55 65 61 72 22 -99 -75 111 49 -3 21 -80 68 -14 120 30 -84 -103 16 -68 73 -121 -93 -55 54 72 84 -8 118 -101 114]         555
    [116 69 -44 77 100 8 -40 -67 25 -4 27 -21 111 98 -45 85 83 -27 -39 8 63 -25 -88 74 32 -10 -2 35 102 -72 -104 111]            666
    [-84 -2 87 22 -4 105 68 48 -113 93 -29 52 3 102 123 -70 -123 36 31 76 -16 87 70 116 -93 109 -88 108 125 -36 -43 73]          777
    [90 127 103 -71 -76 -36 41 -107 -7 -13 -83 -87 28 86 -94 110 74 -86 110 -54 -128 124 102 -73 -127 88 77 -36 62 5 -84 -100]   888}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Test related/recommended entities                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(expect
  #{:cards}
  (tt/with-temp* [Dashboard [{dashboard-id :id}]]
    (-> ((user->client :crowberto) :get 200 (format "dashboard/%s/related" dashboard-id)) keys set)))
