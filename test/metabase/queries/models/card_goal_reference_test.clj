(ns metabase.queries.models.card-goal-reference-test
  "Public and embedded pages resolve dynamic goals with full permissions, so whoever saves a goal reference, or
  places a card carrying one on a public page, must be able to read what it references."
  {:clj-kondo/config '{:linters {:deprecated-var
                                 {:exclude {metabase.test.data/mbql-query
                                            {:namespaces [metabase.queries.models.card-goal-reference-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.queries.core :as queries]
   [metabase.queries.models.card :as card]
   [metabase.revisions.core :as revisions]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(defn- card-goal
  ([card-id]
   (card-goal card-id "count"))
  ([card-id column]
   {:id card-id :type "card" :column column}))

(defn- gauge-viz
  "Viz settings whose gauge segment reads `goal`."
  [goal]
  {:gauge.segments [{:min goal :max 100 :color "red"}]})

(defn- count-query []
  (mt/mbql-query venues {:aggregation [[:count]]}))

(defn- venues-count-measure []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- do-with-unreadable-card!
  "Call `f` with the id of a card in a collection the All Users group can't read."
  [f]
  (mt/with-temp [:model/Collection {secret-id :id} {}
                 :model/Card       {goal-id :id} {:collection_id secret-id
                                                  :dataset_query (count-query)}]
    (perms/revoke-collection-permissions! (perms/all-users-group) secret-id)
    (f goal-id)))

(defn- status-of
  "The `:status-code` of what `thunk` throws, or `:no-error`."
  [thunk]
  (try
    (thunk)
    :no-error
    (catch clojure.lang.ExceptionInfo e
      (:status-code (ex-data e)))))

(defn- save-card-status
  "The status of inserting a Card with `card-props`."
  [card-props]
  (status-of #(mt/with-temp [:model/Card _ card-props])))

(def ^:private layout {:row 0 :col 0 :size_x 4 :size_y 4})

(deftest new-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card {readable-id :id} {:dataset_query (count-query)}]
       (mt/with-test-user :rasta
         (testing "a goal reading a card the user can't read is refused"
           (is (= 403 (save-card-status {:visualization_settings (gauge-viz (card-goal goal-id))}))))
         (testing "a hidden goal is checked too, since flipping the toggle later checks nothing"
           (is (= 403 (save-card-status {:visualization_settings {:graph.show_goal  false
                                                                  :graph.goal_value (card-goal goal-id)}}))))
         (testing "a goal reading a missing card is refused rather than left to point at whatever gets that id"
           (is (= 404 (save-card-status {:visualization_settings (gauge-viz (card-goal Integer/MAX_VALUE))}))))
         (testing "a goal id that isn't a positive integer is refused, not skipped"
           (is (= 400 (save-card-status {:visualization_settings (gauge-viz (card-goal (str goal-id)))}))))
         (testing "a keyword type is checked like the string it is saved as"
           (is (= 403 (save-card-status {:visualization_settings
                                         (gauge-viz (assoc (card-goal goal-id) :type :card))}))))
         (testing "a goal reading a readable card saves"
           (is (= :no-error (save-card-status {:visualization_settings (gauge-viz (card-goal readable-id))}))))
         (testing "a goal of a type nothing resolves is left alone"
           (is (= :no-error (save-card-status {:visualization_settings
                                               (gauge-viz {:id goal-id :type "table" :column "x"})})))))))))

(deftest updated-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (testing "adding a goal the user can't read is refused and nothing is saved"
       (mt/with-temp [:model/Card {card-id :id} {:dataset_query (count-query)}]
         (mt/with-test-user :rasta
           (is (= 403 (status-of #(t2/update! :model/Card card-id
                                              {:visualization_settings (gauge-viz (card-goal goal-id))})))))
         (is (= {} (t2/select-one-fn :visualization_settings :model/Card :id card-id)))))
     (testing "a goal already saved doesn't block unrelated edits by a user who can't read it"
       (mt/with-temp [:model/Card {card-id :id} {:dataset_query          (count-query)
                                                 :visualization_settings (gauge-viz (card-goal goal-id))}]
         (mt/with-test-user :rasta
           (is (= :no-error (status-of #(t2/update! :model/Card card-id
                                                    {:visualization_settings (assoc (gauge-viz (card-goal goal-id))
                                                                                    :card.title "renamed")})))))))
     (testing "switching a saved goal to another column of the same card is refused"
       (mt/with-temp [:model/Card {card-id :id} {:dataset_query          (count-query)
                                                 :visualization_settings (gauge-viz (card-goal goal-id))}]
         (mt/with-test-user :rasta
           (is (= 403 (status-of #(t2/update! :model/Card card-id
                                              {:visualization_settings (gauge-viz (card-goal goal-id "sum"))}))))))))))

(deftest measure-goal-reference-permissions-test
  (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                  :table_id   (mt/id :venues)
                                                  :definition (venues-count-measure)}]
    (let [card-props {:visualization_settings (gauge-viz {:id measure-id :type "measure" :column "count"})}]
      (testing "a measure on a table the user can query saves"
        (mt/with-test-user :rasta
          (is (= :no-error (save-card-status card-props)))))
      (testing "metadata access to the measure's table isn't enough: its value is the table's data"
        (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no
          (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues)
            :perms/manage-table-metadata :yes
            (mt/with-test-user :rasta
              (is (= 403 (save-card-status card-props))))))))))

(deftest copied-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card source {:dataset_query          (count-query)
                                        :visualization_settings (gauge-viz (card-goal goal-id))}]
       (let [copy-props (select-keys source [:dataset_query :visualization_settings])
             prose      documents.test-util/text->prose-mirror-ast]
         (testing "a copy keeps the goals of a source the user could read without a fresh check"
           (mt/with-test-user :rasta
             (card/with-copy-source-card source
               (is (= :no-error (save-card-status copy-props))))))
         (testing "a copy into a public document is checked, since the document shows its goals to anyone"
           (mt/with-temp [:model/Document {document-id :id} {:name              "Public"
                                                             :document          (prose "x")
                                                             :public_uuid       (str (random-uuid))
                                                             :made_public_by_id (mt/user->id :crowberto)}]
             (mt/with-test-user :rasta
               (card/with-copy-source-card source
                 (is (= 403 (save-card-status (assoc copy-props :document_id document-id)))))))))))))

(deftest internal-write-goal-reference-test
  (testing "writes with no user bound (serdes, migrations, tasks) aren't checked"
    (do-with-unreadable-card!
     (fn [goal-id]
       (is (= :no-error (save-card-status {:visualization_settings (gauge-viz (card-goal goal-id))})))))))

(deftest dashcard-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (count-query)}
                    :model/Dashboard {dash-id :id} {}]
       (let [dashcard       (fn [viz]
                              (merge layout {:dashboard_id dash-id :card_id card-id :visualization_settings viz}))
             goal-viz       (gauge-viz (card-goal goal-id))
             visualizer-viz {:visualization {:display "gauge" :settings goal-viz}}
             renamed-viz    (assoc goal-viz :card.title "renamed")
             sum-viz        (gauge-viz (card-goal goal-id "sum"))]
         (mt/with-test-user :rasta
           (testing "a dashcard goal the user can't read is refused"
             (is (= 403 (status-of #(t2/insert! :model/DashboardCard (dashcard goal-viz))))))
           (testing "so is one nested in a visualizer dashcard's settings"
             (is (= 403 (status-of #(t2/insert! :model/DashboardCard (dashcard visualizer-viz)))))))
         (testing "a dashcard goal already saved doesn't block unrelated edits"
           (mt/with-temp [:model/DashboardCard {dashcard-id :id} (dashcard goal-viz)]
             (mt/with-test-user :rasta
               (is (= :no-error (status-of #(t2/update! :model/DashboardCard dashcard-id
                                                        {:visualization_settings renamed-viz}))))
               (testing "but switching it to another column of the same card is refused"
                 (is (= 403 (status-of #(t2/update! :model/DashboardCard dashcard-id
                                                    {:visualization_settings sum-viz})))))))))))))

(deftest copied-dashboard-goal-reference-test
  (testing "copying a dashboard keeps dashcard goals the user can't read: the copy isn't public"
    (do-with-unreadable-card!
     (fn [goal-id]
       (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (count-query)}
                      :model/Dashboard     {dash-id :id} {}
                      :model/DashboardCard _             (merge layout {:dashboard_id           dash-id
                                                                        :card_id                card-id
                                                                        :visualization_settings (gauge-viz
                                                                                                 (card-goal goal-id))})]
         (mt/with-model-cleanup [:model/Dashboard]
           (mt/user-http-request :rasta :post 200 (format "dashboard/%d/copy" dash-id))))))))

(deftest duplicated-dashcard-goal-reference-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (do-with-unreadable-card!
      (fn [other-goal-id]
        (let [goal-viz (gauge-viz (card-goal goal-id))]
          (mt/with-temp [:model/Card          {card-id :id}     {:dataset_query (count-query)}
                         :model/Dashboard     {dash-id :id}     {}
                         :model/DashboardCard {dashcard-id :id} (merge layout {:dashboard_id           dash-id
                                                                               :card_id                card-id
                                                                               :visualization_settings goal-viz})]
            (let [existing     (merge layout {:id dashcard-id :card_id card-id :visualization_settings goal-viz})
                  new-dashcard (fn [viz] (merge layout {:id -1 :card_id card-id :visualization_settings viz}))]
              (testing "a new dashcard carrying a goal already on the dashboard saves, as an editor duplicate does"
                (mt/user-http-request :rasta :put 200 (format "dashboard/%d" dash-id)
                                      {:dashcards [existing (new-dashcard goal-viz)]
                                       :tabs      []}))
              (testing "a new dashcard reading another column of a card already on the dashboard is refused"
                (mt/user-http-request :rasta :put 403 (format "dashboard/%d" dash-id)
                                      {:dashcards [existing (new-dashcard (gauge-viz (card-goal goal-id "sum")))]
                                       :tabs      []}))
              (testing "a new dashcard carrying a goal not on the dashboard yet is refused"
                (mt/user-http-request :rasta :put 403 (format "dashboard/%d" dash-id)
                                      {:dashcards [existing (new-dashcard (gauge-viz (card-goal other-goal-id)))]
                                       :tabs      []}))))))))))

(deftest reverted-dashcard-goal-reference-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (count-query)}
                    :model/Dashboard {dash-id :id} {}]
       (let [goal-dashcard #(merge layout {:dashboard_id           dash-id
                                           :card_id                card-id
                                           :visualization_settings (gauge-viz (card-goal goal-id))})
             snapshot      #(revisions/serialize-instance :model/Dashboard dash-id
                                                          (t2/select-one :model/Dashboard :id dash-id))
             revert-status (fn [serialized]
                             (mt/with-test-user :rasta
                               (status-of #(revisions/revert-to-revision! :model/Dashboard dash-id
                                                                          (mt/user->id :rasta) serialized))))]
         (testing "restoring a dashcard whose goal another dashcard still carries succeeds"
           (let [restored-id (t2/insert-returning-pk! :model/DashboardCard (goal-dashcard))
                 _           (t2/insert! :model/DashboardCard (goal-dashcard))
                 serialized  (snapshot)]
             (t2/delete! :model/DashboardCard :id restored-id)
             (is (= :no-error (revert-status serialized)))))
         (testing "restoring a goal no longer on the dashboard is refused"
           (t2/delete! :model/DashboardCard :dashboard_id dash-id)
           (t2/insert! :model/DashboardCard (goal-dashcard))
           (let [serialized (snapshot)]
             (t2/delete! :model/DashboardCard :dashboard_id dash-id)
             (is (= 403 (revert-status serialized))))))))))

(deftest public-card-goal-reference-save-test
  (testing "an editor can't make a public card return a card they can't read"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (do-with-unreadable-card!
       (fn [goal-id]
         (mt/with-temp [:model/Card {card-id :id uuid :public_uuid} {:dataset_query (count-query)
                                                                     :public_uuid   (str (random-uuid))}]
           (mt/user-http-request :rasta :put 403 (format "card/%d" card-id)
                                 {:visualization_settings (gauge-viz (card-goal goal-id))})
           (let [response (client/client :get 202 (str "public/card/" uuid "/query"))]
             (is (= "completed" (:status response)))
             (is (nil? (get-in response [:data :referenced_entities]))))))))))

(deftest shared-dashboard-goal-reference-placement-test
  (do-with-unreadable-card!
   (fn [goal-id]
     ;; an admin pointed this card's goal at X; rasta can read the card but not X
     (mt/with-temp [:model/Card {carrier-id :id} {:dataset_query          (count-query)
                                                  :visualization_settings (gauge-viz (card-goal goal-id))}
                    :model/Card {plain-id :id}   {:dataset_query (count-query)}]
       (doseq [[sharing dashboard-props expected] [["public"   {:public_uuid (str (random-uuid))} 403]
                                                   ["embedded" {:enable_embedding true}          403]
                                                   ["private"  {}                                200]]]
         (mt/with-temp [:model/Dashboard     {dash-id :id}     dashboard-props
                        :model/DashboardCard {dashcard-id :id} (merge layout {:dashboard_id dash-id :card_id plain-id})]
           (let [plain (merge layout {:id dashcard-id :card_id plain-id})]
             (testing (str sharing ": placing the card")
               (mt/user-http-request :rasta :put expected (format "dashboard/%d" dash-id)
                                     {:dashcards [plain (merge layout {:id -1 :card_id carrier-id})]
                                      :tabs      []}))
             (testing (str sharing ": adding it as a series")
               (mt/user-http-request :rasta :put expected (format "dashboard/%d" dash-id)
                                     {:dashcards [(assoc plain :series [{:id carrier-id}])]
                                      :tabs      []})))))))))

(deftest newly-exposed-series-as-ids-test
  (testing "series given as bare ids, as a revision revert passes them, are checked like series maps"
    (do-with-unreadable-card!
     (fn [goal-id]
       (mt/with-temp [:model/Card {carrier-id :id} {:dataset_query          (count-query)
                                                    :visualization_settings (gauge-viz (card-goal goal-id))}
                      :model/Card {plain-id :id}   {:dataset_query (count-query)}]
         (mt/with-test-user :rasta
           (is (= 403 (status-of #(queries/check-newly-exposed-dashcards-goal-permissions!
                                   {:public_uuid (str (random-uuid))}
                                   [{:card_id plain-id :series []}]
                                   [{:card_id plain-id :series [carrier-id]}]))))
           (testing "and a card already exposed as a series is grandfathered"
             (is (= :no-error (status-of #(queries/check-newly-exposed-dashcards-goal-permissions!
                                           {:public_uuid (str (random-uuid))}
                                           [{:card_id plain-id :series [carrier-id]}]
                                           [{:card_id plain-id :series [carrier-id]}])))))))))))
