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
             [test :as mt]
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
            [metabase.models.params.chain-filter-test :as chain-filter-test]
            [ring.util.codec :as codec]
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
  (mt/with-non-admin-groups-no-root-collection-perms
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

(deftest auth-test
  (is (= (get middleware.u/response-unauthentic :body)
         (http/client :get 401 "dashboard")
         (http/client :put 401 "dashboard/13"))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/dashboard                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-dashboard-validation-test
  (testing "POST /api/dashboard"
    (is (= {:errors {:name "value must be a non-blank string."}}
           ((mt/user->client :rasta) :post 400 "dashboard" {})))

    (is (= {:errors {:parameters "value must be an array. Each value must be a map."}}
           ((mt/user->client :crowberto) :post 400 "dashboard" {:name       "Test"
                                                                :parameters "abc"})))))

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

(deftest create-dashboard-test
  (testing "POST /api/dashboard"
    (mt/with-non-admin-groups-no-root-collection-perms
      (tt/with-temp Collection [collection]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
        (let [test-dashboard-name "Test Create Dashboard"]
          (try
            (is (= (merge
                    dashboard-defaults
                    {:name          test-dashboard-name
                     :creator_id    (mt/user->id :rasta)
                     :parameters    [{:id "abc123", :name "test", :type "date"}]
                     :updated_at    true
                     :created_at    true
                     :collection_id true})
                   (-> ((mt/user->client :rasta) :post 200 "dashboard" {:name          test-dashboard-name
                                                                        :parameters    [{:id "abc123", :name "test", :type "date"}]
                                                                        :collection_id (u/get-id collection)})
                       dashboard-response)))
            (finally
              (db/delete! Dashboard :name test-dashboard-name))))))))

(deftest create-dashboard-with-collection-position-test
  (testing "POST /api/dashboard"
    (testing "Make sure we can create a Dashboard with a Collection position"
      (mt/with-non-admin-groups-no-root-collection-perms
        (tt/with-temp Collection [collection]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          (let [dashboard-name (mt/random-name)]
            (try
              ((mt/user->client :rasta) :post 200 "dashboard" {:name                dashboard-name
                                                               :collection_id       (u/get-id collection)
                                                               :collection_position 1000})
              (is (= #metabase.models.dashboard.DashboardInstance{:collection_id true, :collection_position 1000}
                     (some-> (db/select-one [Dashboard :collection_id :collection_position] :name dashboard-name)
                             (update :collection_id (partial = (u/get-id collection))))))
              (finally
                (db/delete! Dashboard :name dashboard-name)))))

        (testing "..but not if we don't have permissions for the Collection"
          (tt/with-temp Collection [collection]
            (let [dashboard-name (mt/random-name)]
              ((mt/user->client :rasta) :post 403 "dashboard" {:name                dashboard-name
                                                               :collection_id       (u/get-id collection)
                                                               :collection_position 1000})
              (is (= nil
                     (some-> (db/select-one [Dashboard :collection_id :collection_position] :name dashboard-name)
                             (update :collection_id (partial = (u/get-id collection)))))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             GET /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-dashboard-test
  (testing "GET /api/dashboard/:id"
    (testing "fetch a dashboard WITH a dashboard card on it"
      (tt/with-temp* [Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                      DashboardCard [_                  {:dashboard_id dashboard-id, :card_id card-id}]]
        (with-dashboards-in-readable-collection [dashboard-id]
          (card-api-test/with-cards-in-readable-collection [card-id]
            (is (= (merge
                    dashboard-defaults
                    {:name          "Test Dashboard"
                     :creator_id    (mt/user->id :rasta)
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
                                                                      :creator_id             (mt/user->id :rasta)
                                                                      :collection_id          true
                                                                      :display                "table"
                                                                      :visualization_settings {}
                                                                      :result_metadata        nil})
                                      :series                 []}]})
                   (dashboard-response ((mt/user->client :rasta) :get 200 (format "dashboard/%d" dashboard-id)))))))))

    (testing "fetch a dashboard with a param in it"
      (mt/with-temp* [Table         [{table-id :id} {}]
                      Field         [{field-id :id display-name :display_name} {:table_id table-id}]

                      Dashboard     [{dashboard-id :id} {:name "Test Dashboard"}]
                      Card          [{card-id :id}      {:name "Dashboard Test Card"}]
                      DashboardCard [{dc-id :id}        {:dashboard_id       dashboard-id
                                                         :card_id            card-id
                                                         :parameter_mappings [{:card_id      1
                                                                               :parameter_id "foo"
                                                                               :target       [:dimension [:field_id field-id]]}]}]]
        (with-dashboards-in-readable-collection [dashboard-id]
          (card-api-test/with-cards-in-readable-collection [card-id]
            (is (= (merge dashboard-defaults
                          {:name          "Test Dashboard"
                           :creator_id    (mt/user->id :rasta)
                           :collection_id true
                           :can_write     false
                           :param_values  nil
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
                                                                            :creator_id             (mt/user->id :rasta)
                                                                            :collection_id          true
                                                                            :display                "table"
                                                                            :query_type             nil
                                                                            :visualization_settings {}
                                                                            :result_metadata        nil})
                                            :series                 []}]})
                   (dashboard-response ((mt/user->client :rasta) :get 200 (format "dashboard/%d" dashboard-id)))))))))))

(deftest fetch-dashboard-permissions-test
  (testing "GET /api/dashboard/:id"
    (testing "Fetch Dashboard with a series, should fail if the User doesn't have access to the Collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (tt/with-temp* [Collection          [{coll-id :id}      {:name "Collection 1"}]
                        Dashboard           [{dashboard-id :id} {:name       "Test Dashboard"
                                                                 :creator_id (mt/user->id :crowberto)}]
                        Card                [{card-id :id}      {:name          "Dashboard Test Card"
                                                                 :collection_id coll-id}]
                        Card                [{card-id2 :id}     {:name          "Dashboard Test Card 2"
                                                                 :collection_id coll-id}]
                        DashboardCard       [{dbc_id :id}       {:dashboard_id dashboard-id, :card_id card-id}]
                        DashboardCardSeries [_                  {:dashboardcard_id dbc_id, :card_id card-id2
                                                                 :position         0}]]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :get 403 (format "dashboard/%d" dashboard-id)))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             PUT /api/dashboard/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-test
  (testing "PUT /api/dashboard/:id"
    (tt/with-temp Dashboard [{dashboard-id :id} {:name "Test Dashboard"}]
      (with-dashboards-in-writeable-collection [dashboard-id]
        (testing "GET before update"
          (is (= (merge dashboard-defaults {:name          "Test Dashboard"
                                            :creator_id    (mt/user->id :rasta)
                                            :collection_id true})
                 (dashboard-response (Dashboard dashboard-id)))))

        (testing "PUT response"
          (is (= (merge dashboard-defaults {:name          "My Cool Dashboard"
                                            :description   "Some awesome description"
                                            :creator_id    (mt/user->id :rasta)
                                            :collection_id true})
                 (dashboard-response
                  ((mt/user->client :rasta) :put 200 (str "dashboard/" dashboard-id)
                   {:name        "My Cool Dashboard"
                    :description "Some awesome description"
                    ;; these things should fail to update
                    :creator_id  (mt/user->id :trashbird)})))))

        (testing "GET after update"
          (is (= (merge dashboard-defaults {:name          "My Cool Dashboard"
                                            :description   "Some awesome description"
                                            :creator_id    (mt/user->id :rasta)
                                            :collection_id true})
                 (dashboard-response (Dashboard dashboard-id)))))))))

(deftest update-dashboard-guide-columns-test
  (testing "PUT /api/dashboard/:id"
    (testing "allow `:caveats` and `:points_of_interest` to be empty strings, and `:show_in_getting_started` should be a boolean"
      (tt/with-temp Dashboard [{dashboard-id :id} {:name "Test Dashboard"}]
        (with-dashboards-in-writeable-collection [dashboard-id]
          (is (= (merge dashboard-defaults {:name                    "Test Dashboard"
                                            :creator_id              (mt/user->id :rasta)
                                            :collection_id           true
                                            :caveats                 ""
                                            :points_of_interest      ""
                                            :show_in_getting_started true})
                 (dashboard-response ((mt/user->client :rasta) :put 200 (str "dashboard/" dashboard-id)
                                      {:caveats                 ""
                                       :points_of_interest      ""
                                       :show_in_getting_started true})))))))))

(deftest update-dashboard-clear-description-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we clear the description of a Dashboard? (#4738)"
      (tt/with-temp Dashboard [dashboard {:description "What a nice Dashboard"}]
        (with-dashboards-in-writeable-collection [dashboard]
          ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard)) {:description nil})
          (is (= nil
                 (db/select-one-field :description Dashboard :id (u/get-id dashboard))))

          (testing "Set to a blank description"
            ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard)) {:description ""})
            (is (= ""
                   (db/select-one-field :description Dashboard :id (u/get-id dashboard))))))))))

(deftest update-dashboard-change-collection-id-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we change the Collection a Dashboard is in (assuming we have the permissions to do so)?"
      (dashboard-test/with-dash-in-collection [db collection dash]
        (tt/with-temp Collection [new-collection]
          ;; grant Permissions for both new and old collections
          (doseq [coll [collection new-collection]]
            (perms/grant-collection-readwrite-permissions! (group/all-users) coll))
          ;; now make an API call to move collections
          ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id dash)) {:collection_id (u/get-id new-collection)})
          ;; Check to make sure the ID has changed in the DB
          (= (db/select-one-field :collection_id Dashboard :id (u/get-id dash))
             (u/get-id new-collection)))))

    (testing "if we don't have the Permissions for the old collection, we should get an Exception"
      (mt/with-non-admin-groups-no-root-collection-perms
        (dashboard-test/with-dash-in-collection [db collection dash]
          (tt/with-temp Collection [new-collection]
            ;; grant Permissions for only the *new* collection
            (perms/grant-collection-readwrite-permissions! (group/all-users) new-collection)
            ;; now make an API call to move collections. Should fail
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :put 403 (str "dashboard/" (u/get-id dash))
                    {:collection_id (u/get-id new-collection)})))))))

    (testing "if we don't have the Permissions for the new collection, we should get an Exception"
      (mt/with-non-admin-groups-no-root-collection-perms
        (dashboard-test/with-dash-in-collection [db collection dash]
          (tt/with-temp Collection [new-collection]
            ;; grant Permissions for only the *old* collection
            (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
            ;; now make an API call to move collections. Should fail
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :put 403 (str "dashboard/" (u/get-id dash))
                    {:collection_id (u/get-id new-collection)})))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    UPDATING DASHBOARD COLLECTION POSITIONS                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-dashboard-change-collection-position-test
  (testing "PUT /api/dashboard/:id"
    (testing "Can we change the Collection position of a Dashboard?"
      (mt/with-non-admin-groups-no-root-collection-perms
        (tt/with-temp* [Collection [collection]
                        Dashboard  [dashboard {:collection_id (u/get-id collection)}]]
          (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
          ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard))
           {:collection_position 1})
          (is (= 1
                 (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard))))

          (testing "...and unset (unpin) it as well?"
            ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id dashboard))
             {:collection_position nil})
            (is (= nil
                   (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard))))))

        (testing "we shouldn't be able to if we don't have permissions for the Collection"
          (tt/with-temp* [Collection [collection]
                          Dashboard  [dashboard {:collection_id (u/get-id collection)}]]
            ((mt/user->client :rasta) :put 403 (str "dashboard/" (u/get-id dashboard))
             {:collection_position 1})
            (is (= nil
                   (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard)))))

          (tt/with-temp* [Collection [collection]
                          Dashboard  [dashboard {:collection_id (u/get-id collection), :collection_position 1}]]
            ((mt/user->client :rasta) :put 403 (str "dashboard/" (u/get-id dashboard))
             {:collection_position nil})
            (is (= 1
                   (db/select-one-field :collection_position Dashboard :id (u/get-id dashboard))))))))))

;; Check that we can update a dashboard's position in a collection of only dashboards
(expect
 {"a" 1
  "c" 2
  "d" 3
  "b" 4}
 (mt/with-non-admin-groups-no-root-collection-perms
   (tt/with-temp Collection [collection]
     (card-api-test/with-ordered-items collection [Dashboard a
                                                   Dashboard b
                                                   Dashboard c
                                                   Dashboard d]
       (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
       ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id b))
        {:collection_position 4})
       (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating a dashboard at position 3 to position 1 will increment the positions before 3, not after
(expect
 {"c" 1
  "a" 2
  "b" 3
  "d" 4}
 (mt/with-non-admin-groups-no-root-collection-perms
   (tt/with-temp Collection [collection]
     (card-api-test/with-ordered-items collection [Card      a
                                                   Pulse     b
                                                   Dashboard c
                                                   Dashboard d]
       (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
       ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id c))
        {:collection_position 1})
       (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating position 1 to 3 will cause b and c to be decremented
(expect
 {"b" 1
  "c" 2
  "a" 3
  "d" 4}
 (mt/with-non-admin-groups-no-root-collection-perms
   (tt/with-temp Collection [collection]
     (card-api-test/with-ordered-items collection [Dashboard a
                                                   Card      b
                                                   Pulse     c
                                                   Dashboard d]
       (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
       ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id a))
        {:collection_position 3})
       (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating position 1 to 4 will cause a through c to be decremented
(expect
 {"b" 1
  "c" 2
  "d" 3
  "a" 4}
 (mt/with-non-admin-groups-no-root-collection-perms
   (tt/with-temp Collection [collection]
     (card-api-test/with-ordered-items collection [Dashboard a
                                                   Card      b
                                                   Pulse     c
                                                   Pulse     d]
       (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
       ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id a))
        {:collection_position 4})
       (card-api-test/get-name->collection-position :rasta collection)))))

;; Check that updating position 4 to 1 will cause a through c to be incremented
(expect
 {"d" 1
  "a" 2
  "b" 3
  "c" 4}
 (mt/with-non-admin-groups-no-root-collection-perms
   (tt/with-temp Collection [collection]
     (card-api-test/with-ordered-items collection [Card      a
                                                   Pulse     b
                                                   Card      c
                                                   Dashboard d]
       (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
       ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id d))
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
 (mt/with-non-admin-groups-no-root-collection-perms
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
         ((mt/user->client :rasta) :put 200 (str "dashboard/" (u/get-id a))
          {:collection_position 1, :collection_id (u/get-id collection-2)})
         ;; "a" should now be gone from collection-1 and all the existing dashboards bumped down in position
         [(card-api-test/get-name->collection-position :rasta collection-1)
          ;; "a" is now first, all other dashboards in collection-2 bumped down 1
          (card-api-test/get-name->collection-position :rasta collection-2)])))))

(deftest insert-dashboard-increment-existing-collection-position-test
  (testing "POST /api/dashboard"
    (testing "Check that adding a new Dashboard at Collection position 3 will increment position of the existing item at position 3"
      (mt/with-non-admin-groups-no-root-collection-perms
        (tt/with-temp Collection [collection]
          (card-api-test/with-ordered-items collection [Card  a
                                                        Pulse b
                                                        Card  d]
            (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
            (is (= {"a" 1
                    "b" 2
                    "d" 3}
                   (card-api-test/get-name->collection-position :rasta collection)))
            (try
              ((mt/user->client :rasta) :post 200 "dashboard" {:name                "c"
                                                               :collection_id       (u/get-id collection)
                                                               :collection_position 3})
              (is (= {"a" 1
                      "b" 2
                      "c" 3
                      "d" 4}
                     (card-api-test/get-name->collection-position :rasta collection)))
              (finally
                (db/delete! Dashboard :collection_id (u/get-id collection))))))))))

(deftest insert-dashboard-no-position-test
  (testing "POST /api/dashboard"
    (testing "Check that adding a new Dashboard without a position, leaves the existing positions unchanged"
      (mt/with-non-admin-groups-no-root-collection-perms
        (tt/with-temp Collection [collection]
          (card-api-test/with-ordered-items collection [Dashboard a
                                                        Card      b
                                                        Pulse     d]
            (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
            (is (= {"a" 1
                    "b" 2
                    "d" 3}
                   (card-api-test/get-name->collection-position :rasta collection)))
            (try
              ((mt/user->client :rasta) :post 200 "dashboard" {:name          "c"
                                                               :collection_id (u/get-id collection)})
              (is (= {"a" 1
                      "b" 2
                      "c" nil
                      "d" 3}
                     (card-api-test/get-name->collection-position :rasta collection)))
              (finally
                (db/delete! Dashboard :collection_id (u/get-id collection))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           DELETE /api/dashboard/:id                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest delete-test
  (tt/with-temp Dashboard [{dashboard-id :id}]
    (with-dashboards-in-writeable-collection [dashboard-id]
      (is (= nil
             ((mt/user->client :rasta) :delete 204 (format "dashboard/%d" dashboard-id))))
      (is (= nil
             (Dashboard dashboard-id))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/copy                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest copy-dashboard-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "A plain copy with nothing special"
      (tt/with-temp Dashboard [{dashboard-id :id} {:name        "Test Dashboard"
                                                   :description "A description"
                                                   :creator_id  (mt/user->id :rasta)}]
        (let [response ((mt/user->client :rasta) :post 200 (format "dashboard/%d/copy" dashboard-id))]
          (try
            (is (= (merge
                    dashboard-defaults
                    {:name          "Test Dashboard"
                     :description   "A description"
                     :creator_id    (mt/user->id :rasta)
                     :collection_id false})
                   (dashboard-response response)))
            (finally
              (db/delete! Dashboard :id (u/get-id response)))))))

    (testing "Ensure name / description / user set when copying"
      (tt/with-temp Dashboard [{dashboard-id :id}  {:name        "Test Dashboard"
                                                    :description "An old description"}]
        (let [response ((mt/user->client :crowberto) :post 200 (format "dashboard/%d/copy" dashboard-id)
                        {:name        "Test Dashboard - Duplicate"
                         :description "A new description"})]
          (try
            (is (= (merge
                    dashboard-defaults
                    {:name          "Test Dashboard - Duplicate"
                     :description   "A new description"
                     :creator_id    (mt/user->id :crowberto)
                     :collection_id false})
                   (dashboard-response response)))
            (finally
              (db/delete! Dashboard :id (u/get-id response)))))))))

(deftest copy-dashboard-cards-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "Ensure dashboard cards are copied"
      (tt/with-temp* [Dashboard     [{dashboard-id :id}  {:name "Test Dashboard"}]
                      Card          [{card-id :id}]
                      Card          [{card-id2 :id}]
                      DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id}]
                      DashboardCard [{dashcard-id :id} {:dashboard_id dashboard-id, :card_id card-id2}]]
        (let [copy-id (u/get-id ((mt/user->client :rasta) :post 200 (format "dashboard/%d/copy" dashboard-id)))]
          (try
            (is (= 2
                   (count (db/select-ids DashboardCard, :dashboard_id copy-id))))
            (finally
              (db/delete! Dashboard :id copy-id))))))))

(deftest copy-dashboard-into-correct-collection-test
  (testing "POST /api/dashboard/:id/copy"
    (testing "Ensure the correct collection is set when copying"
      (dashboard-test/with-dash-in-collection [db collection dash]
        (tt/with-temp Collection [new-collection]
          ;; grant Permissions for both new and old collections
          (doseq [coll [collection new-collection]]
            (perms/grant-collection-readwrite-permissions! (group/all-users) coll))
          (let [response ((mt/user->client :rasta) :post 200 (format "dashboard/%d/copy" (u/get-id dash)) {:collection_id (u/get-id new-collection)})]
            (try
              ;; Check to make sure the ID of the collection is correct
              (is (= (db/select-one-field :collection_id Dashboard :id
                                          (u/get-id response))
                     (u/get-id new-collection)))
              (finally
                (db/delete! Dashboard :id (u/get-id response))))))))))


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
               (-> ((mt/user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id)
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
        (let [dashboard-card ((mt/user->client :rasta) :post 200 (format "dashboard/%d/cards" dashboard-id)
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
               ((mt/user->client :rasta) :delete 200 (format "dashboard/%d/cards" dashboard-id) :dashcardId dashcard-id)))
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
               ((mt/user->client :rasta) :put 200 (format "dashboard/%d/cards" dashboard-id)
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
   :user         (-> (user-details (mt/fetch-user :crowberto))
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
   :user         (-> (user-details (mt/fetch-user :rasta))
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
                               :user_id  (mt/user->id :crowberto)
                               :object   {:name         "c"
                                          :description  "something"
                                          :cards        [{:sizeX   4
                                                          :sizeY   3
                                                          :row     0
                                                          :col     0
                                                          :card_id 123
                                                          :series  [8 9]}]}
                               :message  "updated"}]]
   (doall (for [revision ((mt/user->client :crowberto) :get 200 (format "dashboard/%d/revisions" dashboard-id))]
            (dissoc revision :timestamp :id)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/dashboard/:id/revert                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest revert-dashboard-test
  (testing "POST /api/dashboard/:id/revert"
    (testing "parameter validation"
      (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
             ((mt/user->client :crowberto) :post 400 "dashboard/1/revert" {})))
      (is (= {:errors {:revision_id "value must be an integer greater than zero."}}
             ((mt/user->client :crowberto) :post 400 "dashboard/1/revert" {:revision_id "foobar"})))      )
    (tt/with-temp* [Dashboard [{dashboard-id :id}]
                    Revision  [{revision-id :id} {:model       "Dashboard"
                                                  :model_id    dashboard-id
                                                  :object      {:name        "a"
                                                                :description nil
                                                                :cards       []}
                                                  :is_creation true}]
                    Revision  [_                 {:model    "Dashboard"
                                                  :model_id dashboard-id
                                                  :user_id  (mt/user->id :crowberto)
                                                  :object   {:name        "b"
                                                             :description nil
                                                             :cards       []}
                                                  :message  "updated"}]]
      (is (= {:is_reversion true
              :is_creation  false
              :message      nil
              :user         (-> (user-details (mt/fetch-user :crowberto))
                                (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
              :diff         {:before {:name "b"}
                             :after  {:name "a"}}
              :description  "renamed it from \"b\" to \"a\"."}
             (dissoc ((mt/user->client :crowberto) :post 200 (format "dashboard/%d/revert" dashboard-id)
                      {:revision_id revision-id})
                     :id :timestamp)))

      (is (= [{:is_reversion true
               :is_creation  false
               :message      nil
               :user         (-> (user-details (mt/fetch-user :crowberto))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:before {:name "b"}
                              :after  {:name "a"}}
               :description  "renamed it from \"b\" to \"a\"."}
              {:is_reversion false
               :is_creation  false
               :message      "updated"
               :user         (-> (user-details (mt/fetch-user :crowberto))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         {:before {:name "a"}
                              :after  {:name "b"}}
               :description  "renamed it from \"a\" to \"b\"."}
              {:is_reversion false
               :is_creation  true
               :message      nil
               :user         (-> (user-details (mt/fetch-user :rasta))
                                 (dissoc :email :date_joined :last_login :is_superuser :is_qbnewb))
               :diff         nil
               :description  nil}]
             (doall (for [revision ((mt/user->client :crowberto) :get 200 (format "dashboard/%d/revisions" dashboard-id))]
                      (dissoc revision :timestamp :id))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- shared-dashboard []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

;;; -------------------------------------- POST /api/dashboard/:id/public_link ---------------------------------------

;; Test that we can share a Dashboard
(expect
 (mt/with-temporary-setting-values [enable-public-sharing true]
   (tt/with-temp Dashboard [dashboard]
     (let [{uuid :uuid} ((mt/user->client :crowberto) :post 200 (format "dashboard/%d/public_link" (u/get-id dashboard)))]
       (db/exists? Dashboard :id (u/get-id dashboard), :public_uuid uuid)))))

;; Test that we *cannot* share a Dashboard if we aren't admins
(expect
 "You don't have permissions to do that."
 (mt/with-temporary-setting-values [enable-public-sharing true]
   (tt/with-temp Dashboard [dashboard]
     ((mt/user->client :rasta) :post 403 (format "dashboard/%d/public_link" (u/get-id dashboard))))))

;; Test that we *cannot* share a Dashboard if the setting is disabled
(expect
 "Public sharing is not enabled."
 (mt/with-temporary-setting-values [enable-public-sharing false]
   (tt/with-temp Dashboard [dashboard]
     ((mt/user->client :crowberto) :post 400 (format "dashboard/%d/public_link" (u/get-id dashboard))))))

;; Test that we get a 404 if the Dashboard doesn't exist
(expect
 "Not found."
 (mt/with-temporary-setting-values [enable-public-sharing true]
   ((mt/user->client :crowberto) :post 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE))))

;; Test that if a Dashboard has already been shared we reüse the existing UUID
(expect
 (mt/with-temporary-setting-values [enable-public-sharing true]
   (tt/with-temp Dashboard [dashboard (shared-dashboard)]
     (= (:public_uuid dashboard)
        (:uuid ((mt/user->client :crowberto) :post 200 (format "dashboard/%d/public_link" (u/get-id dashboard))))))))

(deftest delete-public-link-test
  (testing "DELETE /api/dashboard/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (testing "Test that we can unshare a Dashboard"
        (tt/with-temp Dashboard [dashboard (shared-dashboard)]
          ((mt/user->client :crowberto) :delete 204 (format "dashboard/%d/public_link" (u/get-id dashboard)))
          (is (= false
                 (db/exists? Dashboard :id (u/get-id dashboard), :public_uuid (:public_uuid dashboard))))))

      (testing "Test that we *cannot* unshare a Dashboard if we are not admins"
        (tt/with-temp Dashboard [dashboard (shared-dashboard)]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :delete 403 (format "dashboard/%d/public_link" (u/get-id dashboard)))))))

      (testing "Test that we get a 404 if Dashboard isn't shared"
        (tt/with-temp Dashboard [dashboard]
          (is (= "Not found."
                 ((mt/user->client :crowberto) :delete 404 (format "dashboard/%d/public_link" (u/get-id dashboard)))))))

      (testing "Test that we get a 404 if Dashboard doesn't exist"
        (is (= "Not found."
               ((mt/user->client :crowberto) :delete 404 (format "dashboard/%d/public_link" Integer/MAX_VALUE))))))))

;;
(deftest fetch-public-dashboards-test
  (testing "GET /api/dashboard/public"
    (testing "Test that we can fetch a list of publicly-accessible dashboards"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (tt/with-temp Dashboard [dashboard (shared-dashboard)]
          (is (= [{:name true, :id true, :public_uuid true}]
                 (for [dash ((mt/user->client :crowberto) :get 200 "dashboard/public")]
                   (m/map-vals boolean (select-keys dash [:name :id :public_uuid]))))))))))

(deftest fetch-embeddable-dashboards-test
  (testing "GET /api/dashboard/embeddable"
    (testing "Test that we can fetch a list of embeddable-accessible dashboards"
      (mt/with-temporary-setting-values [enable-embedding true]
        (tt/with-temp Dashboard [dashboard {:enable_embedding true}]
          (is (= [{:name true, :id true}]
                 (for [dash ((mt/user->client :crowberto) :get 200 "dashboard/embeddable")]
                   (m/map-vals boolean (select-keys dash [:name :id]))))))))))


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

(deftest related-and-recommended-entities-test
  (tt/with-temp Dashboard [{dashboard-id :id}]
    (is (= #{:cards}
           (-> ((mt/user->client :crowberto) :get 200 (format "dashboard/%s/related" dashboard-id)) keys set)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Chain Filter Endpoints                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest mappings->field-ids-test
  (testing "mappings->field-ids"
    (testing "Should extra Field IDs from parameter mappings"
      (is (= #{1 2}
             (#'dashboard-api/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension [:field-id 1]]}
               {:parameter_id "637169c8"
                :card_id      1
                :target       [:dimension [:field-id 2]]}]))))
    (testing "Should normalize MBQL clauses"
      (is (= #{1 2}
             (#'dashboard-api/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension ["field-id" 1]]}
               {:parameter_id "637169c8"
                :card_id      1
                :target       ["dimension" ["field-id" 2]]}]))))
    (testing "Should ignore field-literal clauses"
      (is (= #{1}
             (#'dashboard-api/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension ["field-id" 1]]}
               {:parameter_id "637169c8"
                :card_id      1
                :target       ["dimension" ["field-literal" "wow" "type/Text"]]}]))))
    (testing "Should ignore invalid mappings"
      (is (= #{1}
             (#'dashboard-api/mappings->field-ids
              [{:parameter_id "8e8eafa7"
                :card_id      1
                :target       [:dimension ["field-id" 1]]}
               {:parameter_id "637169c8"
                :card_id      1}]))))))

(defn do-with-chain-filter-fixtures
  ([f]
   (do-with-chain-filter-fixtures nil f))

  ([dashboard-values f]
   (mt/with-temp* [Dashboard     [dashboard (merge {:parameters [{:name "Category Name"
                                                                  :slug "category_name"
                                                                  :id   "_CATEGORY_NAME_"
                                                                  :type "category"}
                                                                 {:name "Category ID"
                                                                  :slug "category_id"
                                                                  :id   "_CATEGORY_ID_"
                                                                  :type "category"}
                                                                 {:name "Price"
                                                                  :slug "price"
                                                                  :id   "_PRICE_"
                                                                  :type "category"}
                                                                 {:name "ID"
                                                                  :slug "id"
                                                                  :id   "_ID_"
                                                                  :type "category"}]}
                                                   dashboard-values)]
                   Card          [card {:database_id   (mt/id)
                                        :table_id      (mt/id :venues)
                                        :dataset_query (mt/mbql-query venues)}]
                   DashboardCard [dashcard {:card_id            (:id card)
                                            :dashboard_id       (:id dashboard)
                                            :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                                                                 {:parameter_id "_CATEGORY_ID_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $category_id)]}
                                                                 {:parameter_id "_PRICE_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $price)]}
                                                                 {:parameter_id "_ID_"
                                                                  :card_id      (:id card)
                                                                  :target       [:dimension (mt/$ids venues $id)]}]}]]
     (f {:dashboard  dashboard
         :card       card
         :dashcard   dashcard
         :param-keys {:category-name "_CATEGORY_NAME_"
                      :category-id   "_CATEGORY_ID_"
                      :price         "_PRICE_"
                      :id            "_ID_"}}))))

(defmacro with-chain-filter-fixtures [[binding dashboard-values] & body]
  `(do-with-chain-filter-fixtures ~dashboard-values (fn [~binding] ~@body)))

(defn- add-query-params [url query-params]
  (let [query-params-str (str/join "&" (for [[k v] (partition 2 query-params)]
                                     (codec/form-encode {k v})))]
    (cond-> url
      (seq query-params-str) (str "?" query-params-str))))

(defn- chain-filter-values-url [dashboard-or-id param-key & query-params]
  (add-query-params (format "dashboard/%d/params/%s/values" (u/get-id dashboard-or-id) (name param-key))
                    query-params))

(defmacro ^:private let-url [[url-binding url] & body]
  `(let [url# ~url
         ~url-binding url#]
     (testing (str "\nGET /api/" url# "\n")
       ~@body)))

(defn- chain-filter-search-url [dashboard-or-id param-key prefix & query-params]
  {:pre [(some? param-key)]}
  (add-query-params (str (format "dashboard/%d/params/%s/search/" (u/get-id dashboard-or-id) (name param-key))
                         prefix)
                    query-params))

(deftest chain-filter-test
  (testing "GET /api/dashboard/:id/params/:param-key/values"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (testing "Show me names of categories"
        (is (= ["African" "American" "Artisan"]
               (take 3 ((mt/user->client :rasta) :get 200 (chain-filter-values-url
                                                           (:id dashboard)
                                                           (:category-name param-keys)))))))
      (let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                             (:price param-keys) 4)]
        (testing "\nShow me names of categories that have expensive venues (price = 4)"
          (is (= ["Japanese" "Steakhouse"]
                 (take 3 ((mt/user->client :rasta) :get 200 url))))))
      ;; this is the format the frontend passes multiple values in (pass the parameter multiple times), and our
      ;; middleware does the right thing and converts the values to a vector
      (let-url [url (chain-filter-values-url dashboard (:category-name param-keys)
                                             (:price param-keys) 3
                                             (:price param-keys) 4)]
        (testing "\nmultiple values"
          (testing "Show me names of categories that have (somewhat) expensive venues (price = 3 *or* 4)"
            (is (= ["American" "Asian" "BBQ"]
                   (take 3 ((mt/user->client :rasta) :get 200 url))))))))
    (testing "Should require perms for the Dashboard"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]} {:collection_id (:id collection)}]
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :get 403 (chain-filter-values-url
                                                       (:id dashboard)
                                                       (:category-name param-keys)))))))))

    (testing "Should work if Dashboard has multiple mappings for a single param"
      (with-chain-filter-fixtures [{:keys [dashboard card dashcard param-keys]}]
        (tt/with-temp* [Card          [card-2 (dissoc card :id)]
                        DashboardCard [dashcard-2 (-> dashcard
                                                      (dissoc :id :card_id)
                                                      (assoc  :card_id (:id card-2)))]]
          (is (= ["African" "American" "Artisan"]
                 (take 3 ((mt/user->client :rasta) :get 200 (chain-filter-values-url
                                                             (:id dashboard)
                                                             (:category-name param-keys)))))))))
    (testing "should check perms for the Fields in question"
      (mt/with-temp-copy-of-db
        (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
          (perms/revoke-permissions! (group/all-users) (mt/id))
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :get 403 (chain-filter-values-url (:id dashboard) (:category-name param-keys))))))))))

(deftest chain-filter-search-test
  (testing "GET /api/dashboard/:id/params/:param-key/search/:prefix"
    (with-chain-filter-fixtures [{:keys [dashboard param-keys]}]
      (let [url (chain-filter-search-url dashboard (:category-name param-keys) "s")]
        (testing (str "\n" url)
          (testing "\nShow me names of categories that start with 's' (case-insensitive)"
            (is (= ["Scandinavian" "Seafood" "South Pacific"]
                   (take 3 ((mt/user->client :rasta) :get 200 url)))))))

      (let-url [url (chain-filter-search-url dashboard (:category-name param-keys) "s" (:price param-keys) 4)]
        (testing "\nShow me names of categories that start with 's' that have expensive venues (price = 4)"
          (is (= ["Steakhouse"]
                 (take 3 ((mt/user->client :rasta) :get 200 url))))))

      (testing "Should require a non-empty prefix"
        (doseq [prefix [nil
                        ""
                        "   "
                        "\n"]]
          (let-url [url (chain-filter-search-url dashboard (:category-name param-keys) prefix)]
            (is (= "API endpoint does not exist."
                   ((mt/user->client :rasta) :get 404 url)))))))

    (testing "Should require perms for the Dashboard"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (with-chain-filter-fixtures [{:keys [dashboard param-keys]} {:collection_id (:id collection)}]
            (let [url (chain-filter-search-url dashboard (:category-name param-keys) "s")]
              (testing (str "\n url")
                (is (= "You don't have permissions to do that."
                       ((mt/user->client :rasta) :get 403 url)))))))))))

(deftest chain-filter-invalid-parameters-test
  (testing "GET /api/dashboard/:id/params/:param-key/values"
    (testing "If some Dashboard parameters do not have valid Field IDs, we should ignore them"
      (with-chain-filter-fixtures [{:keys [dashcard card dashboard]}]
        (db/update! DashboardCard (:id dashcard)
          :parameter_mappings [{:parameter_id "_CATEGORY_NAME_"
                                :card_id      (:id card)
                                :target       [:dimension (mt/$ids venues $category_id->categories.name)]}
                               {:parameter_id "_PRICE_"
                                :card_id      (:id card)}])
        (testing "Since the _PRICE_ param is not mapped to a valid Field, it should get ignored"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_NAME_" "_PRICE_" 4)]
            (is (= ["African" "American" "Artisan"]
                   (take 3 ((mt/user->client :rasta) :get 200 url))))))))))

(deftest chain-filter-human-readable-values-remapping-test
  (testing "Chain filtering for Fields that have Human-Readable values\n"
    (chain-filter-test/with-human-readable-values-remapping
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_ID_" "_PRICE_" 4)]
            (is (= [[40 "Japanese"]
                    [67 "Steakhouse"]]
                   ((mt/user->client :rasta) :get 200 url)))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:prefix"
          (let-url [url (chain-filter-search-url dashboard "_CATEGORY_ID_" "s" "_PRICE_" 4)]
            (is (= [[67 "Steakhouse"]]
                   ((mt/user->client :rasta) :get 200 url)))))))))

(deftest chain-filter-field-to-field-remapping-test
  (testing "Chain filtering for Fields that have a Field -> Field remapping\n"
    (with-chain-filter-fixtures [{:keys [dashboard]}]
      (testing "GET /api/dashboard/:id/params/:param-key/values"
        (let-url [url (chain-filter-values-url dashboard "_ID_")]
          (is (= [[29 "20th Century Cafe"]
                  [ 8 "25°"              ]
                  [93 "33 Taps"          ]]
                 (take 3 ((mt/user->client :rasta) :get 200 url)))))
        (let-url [url (chain-filter-values-url dashboard "_ID_" "_PRICE_" 4)]
          (is (= [[55 "Dal Rae Restaurant"]
                  [61 "Lawry's The Prime Rib"]
                  [16 "Pacific Dining Car - Santa Monica"]]
                 (take 3 ((mt/user->client :rasta) :get 200 url))))))

      (testing "GET /api/dashboard/:id/params/:param-key/search/:prefix"
        (let-url [url (chain-filter-search-url dashboard "_ID_" "s")]
          (is (= [[90 "Señor Fish"]
                  [46 "Shanghai Dumpling King"]
                  [65 "Slate"]]
                 (take 3 ((mt/user->client :rasta) :get 200 url)))))
        (let-url [url (chain-filter-search-url dashboard "_ID_" "s" "_PRICE_" 4)]
          (is (= [[77 "Sushi Nakazawa"]
                  [79 "Sushi Yasuda"]]
                 (take 3 ((mt/user->client :rasta) :get 200 url)))))))))

(deftest chain-filter-fk-field-to-field-remapping-test
  (testing "Chain filtering for Fields that have a FK Field -> Field remapping\n"
    (chain-filter-test/with-fk-field-to-field-remapping
      (with-chain-filter-fixtures [{:keys [dashboard]}]
        (testing "GET /api/dashboard/:id/params/:param-key/values"
          (let-url [url (chain-filter-values-url dashboard "_CATEGORY_ID_" "_PRICE_" 4)]
            (is (= [[40 "Japanese"]
                    [67 "Steakhouse"]]
                   ((mt/user->client :rasta) :get 200 url)))))
        (testing "GET /api/dashboard/:id/params/:param-key/search/:prefix"
          (let-url [url (chain-filter-search-url dashboard "_CATEGORY_ID_" "s" "_PRICE_" 4)]
            (is (= [[67 "Steakhouse"]]
                   ((mt/user->client :rasta) :get 200 url)))))))))

(deftest valid-filter-fields-test
  (testing "GET /api/dashboard/params/valid-filter-fields"
    (letfn [(url [filtered filtering]
              (let [url    "dashboard/params/valid-filter-fields"
                    params (str/join "&" (concat (for [id filtered]
                                                   (format "filtered=%d" id))
                                                 (for [id filtering]
                                                   (format "filtering=%d" id))))]
                (if (seq params)
                  (str url "?" params)
                  url)))
            (result= [expected {:keys [filtered filtering]}]
              (let [url (url filtered filtering)]
                (testing (format "\nGET %s" (pr-str url))
                  (is (= expected
                         ((mt/user->client :rasta) :get 200 url))))))]
      (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard}]
        (mt/$ids
          (testing (format "\nvenues.price = %d categories.name = %d\n" %venues.price %categories.name)
            (result= {(keyword (str %venues.price)) [%categories.name]}
                     {:filtered [%venues.price], :filtering [%categories.name]})
            (testing "Multiple Field IDs for each param"
              (result= {(keyword (str %venues.price))    (sort [%venues.price %categories.name])
                        (keyword (str %categories.name)) (sort [%venues.price %categories.name])}
                       {:filtered [%venues.price %categories.name], :filtering [%categories.name %venues.price]}))
            (testing "filtered-ids cannot be nil"
              (is (= {:errors {:filtered (str "value must satisfy one of the following requirements:"
                                              " 1) value must be a valid integer greater than zero."
                                              " 2) value must be an array. Each value must be a valid integer greater than zero."
                                              " The array cannot be empty.")}}
                     ((mt/user->client :rasta) :get 400 (url [] [%categories.name]))))))))
      (testing "should check perms for the Fields in question"
        (with-chain-filter-fixtures [{{dashboard-id :id} :dashboard}]
          (mt/with-temp-copy-of-db
            (perms/revoke-permissions! (group/all-users) (mt/id))
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :get 403 (mt/$ids (url [%venues.price] [%categories.name])))))))))))
