(ns metabase.queries.models.card-goal-reference-test
  "Public and embedded pages resolve dynamic goals with full permissions, so whoever saves a goal reference, or
  places a card carrying one on a public page, must be able to read what it references."
  {:clj-kondo/config '{:linters {:deprecated-var
                                 {:exclude {metabase.test.data/mbql-query
                                            {:namespaces [metabase.queries.models.card-goal-reference-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.dashboards.write :as dashboards.write]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.queries.core :as queries]
   [metabase.queries.db :as queries.db]
   [metabase.queries.models.card :as card]
   [metabase.revisions.core :as revisions]
   [metabase.revisions.models.revision :as revision]
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

(defn- save-card-status!
  "The status of the create checks of a new question with `card-props`, as the current user."
  [card-props]
  (status-of #(queries/check-allowed-to-create-card!
               (merge {:dataset_query (venues-count-measure) :display :table} card-props)
               :question)))

(defn- copy-card-status
  "The status of the create check that a copy of `source` with `card-props` runs, as the current user."
  [source card-props]
  (status-of #(card/with-copy-source-card source
                (api/create-check :model/Card card-props))))

(defn- update-card-status!
  "The status of the update checks of the Card with `card-id` for `changes`, as the current user."
  [card-id changes]
  (status-of #(queries/check-allowed-to-update-card! (t2/select-one :model/Card :id card-id) changes)))

(defn- dashcard-status
  "The status of the goal check of writing `new-dashcards` to a Dashboard holding `existing-dashcards`."
  [existing-dashcards new-dashcards]
  (status-of #(dashboard-card/check-new-goal-references existing-dashcards new-dashcards)))

(def ^:private layout {:row 0 :col 0 :size_x 4 :size_y 4})

(deftest new-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card {readable-id :id} {:dataset_query (count-query)}]
       (mt/with-test-user :rasta
         (testing "a goal reading a card the user can't read is refused"
           (is (= 403 (save-card-status! {:visualization_settings (gauge-viz (card-goal goal-id))}))))
         (testing "a hidden goal is checked too, since flipping the toggle later checks nothing"
           (is (= 403 (save-card-status! {:visualization_settings {:graph.show_goal  false
                                                                   :graph.goal_value (card-goal goal-id)}}))))
         (testing "a goal reading a missing card is refused rather than left to point at whatever gets that id"
           (is (= 404 (save-card-status! {:visualization_settings (gauge-viz (card-goal Integer/MAX_VALUE))}))))
         (testing "a goal id that isn't a positive integer is refused, not skipped"
           (is (= 400 (save-card-status! {:visualization_settings (gauge-viz (card-goal (str goal-id)))}))))
         (testing "a keyword type is checked like the string it is saved as"
           (is (= 403 (save-card-status! {:visualization_settings
                                          (gauge-viz (assoc (card-goal goal-id) :type :card))}))))
         (testing "a goal reading a readable card passes"
           (is (= :no-error (save-card-status! {:visualization_settings (gauge-viz (card-goal readable-id))}))))
         (testing "a goal of a type nothing resolves is left alone"
           (is (= :no-error (save-card-status! {:visualization_settings
                                                (gauge-viz {:id goal-id :type "table" :column "x"})})))))))))

(deftest updated-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (testing "adding a goal the user can't read is refused"
       (mt/with-temp [:model/Card {card-id :id} {:dataset_query (count-query)}]
         (mt/with-test-user :rasta
           (is (= 403 (update-card-status! card-id {:visualization_settings (gauge-viz (card-goal goal-id))}))))))
     (testing "a goal already saved doesn't block unrelated edits by a user who can't read it"
       (mt/with-temp [:model/Card {card-id :id} {:dataset_query          (count-query)
                                                 :visualization_settings (gauge-viz (card-goal goal-id))}]
         (mt/with-test-user :rasta
           (is (= :no-error (update-card-status! card-id {:visualization_settings (assoc (gauge-viz (card-goal goal-id))
                                                                                         :card.title "renamed")}))))))
     (testing "switching a saved goal to another column of the same card is refused"
       (mt/with-temp [:model/Card {card-id :id} {:dataset_query          (count-query)
                                                 :visualization_settings (gauge-viz (card-goal goal-id))}]
         (mt/with-test-user :rasta
           (is (= 403 (update-card-status! card-id
                                           {:visualization_settings (gauge-viz (card-goal goal-id "sum"))})))))))))

(deftest measure-goal-reference-permissions-test
  (mt/with-temp [:model/Measure {measure-id :id} {:name       "Venue count"
                                                  :table_id   (mt/id :venues)
                                                  :definition (venues-count-measure)}]
    (let [card-props {:visualization_settings (gauge-viz {:id measure-id :type "measure" :column "count"})}]
      (testing "a measure on a table the user can query passes"
        (mt/with-test-user :rasta
          (is (= :no-error (save-card-status! card-props)))))
      (testing "metadata access to the measure's table isn't enough: its value is the table's data"
        (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues) :perms/create-queries :no
          (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :venues)
            :perms/manage-table-metadata :yes
            (mt/with-test-user :rasta
              (is (= 403 (save-card-status! card-props))))))))))

(deftest copied-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card source {:dataset_query          (count-query)
                                        :visualization_settings (gauge-viz (card-goal goal-id))}]
       (let [copy-props (select-keys source [:dataset_query :visualization_settings])
             prose      documents.test-util/text->prose-mirror-ast]
         (testing "a copy keeps the goals of a source the user could read without a fresh check"
           (mt/with-test-user :rasta
             (is (= :no-error (copy-card-status source copy-props)))))
         (testing "a copy into a public document is checked, since the document shows its goals to anyone"
           (mt/with-temp [:model/Document {document-id :id} {:name              "Public"
                                                             :document          (prose "x")
                                                             :public_uuid       (str (random-uuid))
                                                             :made_public_by_id (mt/user->id :crowberto)}]
             (mt/with-test-user :rasta
               (is (= 403 (copy-card-status source (assoc copy-props :document_id document-id))))))))))))

(deftest goal-less-copy-skips-document-lookup-test
  (testing "a copy with no goals doesn't look up whether its document is public"
    (mt/with-temp [:model/Card     source            {:dataset_query (count-query)}
                   :model/Document {document-id :id} {:name     "Doc"
                                                      :document (documents.test-util/text->prose-mirror-ast "x")}]
      (let [lookups (atom 0)]
        (mt/with-dynamic-fn-redefs [queries.db/public-document-ids (fn [_] (swap! lookups inc) #{})]
          (mt/with-test-user :rasta
            (is (= :no-error (copy-card-status source (assoc (select-keys source [:dataset_query])
                                                             :document_id document-id))))))
        (is (zero? @lookups))))))

(deftest public-document-card-copy-goal-reference-test
  (testing "PUT /api/document/:id re-checks the goals of a card it copies into a public document"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (do-with-unreadable-card!
       (fn [goal-id]
         (mt/with-temp [:model/Card {source-id :id :as source} {:dataset_query          (count-query)
                                                                :display                :gauge
                                                                :visualization_settings (gauge-viz (card-goal goal-id))}]
           (letfn [(copied-card-count [document-props expected]
                     (mt/with-temp [:model/Document {document-id :id} (merge {:name     "Document with a dynamic goal"
                                                                              :document (documents.test-util/text->prose-mirror-ast "x")}
                                                                             document-props)]
                       (mt/with-model-cleanup [:model/Card]
                         (testing "embedding a card the document doesn't own clones it"
                           (mt/user-http-request :rasta :put expected (format "document/%d" document-id)
                                                 {:document (documents.test-util/cards->prose-mirror-ast [source-id])}))
                         (testing "a new card saved from source_card_id"
                           (mt/user-http-request :rasta :put expected (format "document/%d" document-id)
                                                 {:document (documents.test-util/cards->prose-mirror-ast [-1])
                                                  :cards    {-1 {:name                   "Gauge"
                                                                 :dataset_query          (count-query)
                                                                 :display                "gauge"
                                                                 :visualization_settings (:visualization_settings source)
                                                                 :source_card_id         source-id}}}))
                         (t2/count :model/Card :document_id document-id))))]
             (testing "a public document refuses both copies"
               (is (= 0 (copied-card-count {:public_uuid       (str (random-uuid))
                                            :made_public_by_id (mt/user->id :crowberto)}
                                           403))))
             (testing "a private document keeps both copies"
               (is (= 2 (copied-card-count {} 200)))))))))))

(deftest internal-write-goal-reference-test
  (testing "the check does nothing with no user bound"
    (do-with-unreadable-card!
     (fn [goal-id]
       (is (= :no-error (status-of #(card/check-new-card-goal-references
                                     {:visualization_settings (gauge-viz (card-goal goal-id))}))))))))

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
             (is (= 403 (dashcard-status [] [(dashcard goal-viz)]))))
           (testing "so is one nested in a visualizer dashcard's settings"
             (is (= 403 (dashcard-status [] [(dashcard visualizer-viz)])))))
         (testing "a dashcard goal already saved doesn't block unrelated edits"
           (mt/with-temp [:model/DashboardCard {dashcard-id :id} (dashcard goal-viz)]
             (mt/with-test-user :rasta
               (let [stored [(t2/select-one :model/DashboardCard :id dashcard-id)]]
                 (is (= :no-error (dashcard-status stored [{:id dashcard-id :visualization_settings renamed-viz}])))
                 (testing "but switching it to another column of the same card is refused"
                   (is (= 403 (dashcard-status stored [{:id dashcard-id :visualization_settings sum-viz}])))))))))))))

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
             snapshot      #(revisions/snapshot :model/Dashboard (t2/select-one :model/Dashboard :id dash-id))
             revert-status (fn [serialized]
                             (mt/with-test-user :rasta
                               (status-of #(revision/revert-to-revision! :model/Dashboard dash-id
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

(deftest reverted-card-goal-reference-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-temp [:model/Card {card-id :id} {:dataset_query (count-query)}]
       (let [snapshot      #(revisions/snapshot :model/Card (t2/select-one :model/Card :id card-id))
             ;; the revert endpoint runs the update check of the card against the snapshot
             revert-status (fn [serialized]
                             (mt/with-test-user :rasta
                               (status-of #(do (api/update-check (t2/select-one :model/Card :id card-id) serialized)
                                               (revision/revert-to-revision! :model/Card card-id
                                                                             (mt/user->id :rasta) serialized)))))]
         ;; a plain update runs no goal check, so these set up revisions the user couldn't save
         (t2/update! :model/Card :id card-id {:visualization_settings (gauge-viz (card-goal goal-id))})
         (let [serialized (snapshot)]
           (testing "restoring a goal the card still carries succeeds, since it isn't new"
             (is (= :no-error (revert-status serialized))))
           (testing "restoring a goal the user can't read, which the card no longer carries, is refused"
             (t2/update! :model/Card :id card-id {:visualization_settings {}})
             (is (= 403 (revert-status serialized)))))))))
  (testing "restoring a goal whose source has since become a model is refused"
    (mt/with-temp [:model/Card {source-id :id} {:dataset_query (count-query)}
                   :model/Card {card-id :id}   {:dataset_query          (count-query)
                                                :visualization_settings (gauge-viz (card-goal source-id))}]
      (let [serialized (revisions/snapshot :model/Card (t2/select-one :model/Card :id card-id))]
        (t2/update! :model/Card :id card-id {:visualization_settings {}})
        (t2/update! :model/Card :id source-id {:type :model})
        (is (= 400 (mt/with-test-user :rasta
                     (status-of #(revision/revert-to-revision! :model/Card card-id (mt/user->id :rasta)
                                                               serialized)))))
        (is (= {} (t2/select-one-fn :visualization_settings :model/Card :id card-id)))))))

(deftest document-card-goal-reference-permissions-test
  (do-with-unreadable-card!
   (fn [goal-id]
     (mt/with-model-cleanup [:model/Document :model/Card]
       (mt/with-temp [:model/Card {readable-id :id} {:dataset_query (count-query)}]
         (letfn [(save-document [status goal]
                   (mt/user-http-request :rasta :post status "document/"
                                         {:name     "Document with a dynamic goal"
                                          :document {:type    "doc"
                                                     :content [{:type "cardEmbed" :attrs {:id -1 :name nil}}]}
                                          :cards    {-1 {:name                   "Gauge"
                                                         :type                   :question
                                                         :dataset_query          (count-query)
                                                         :display                :gauge
                                                         :visualization_settings (gauge-viz goal)}}}))]
           (testing "saving a document card whose goal reads a card the user can't read is refused"
             (save-document 403 (card-goal goal-id))
             (is (not (t2/exists? :model/Document :name "Document with a dynamic goal"))))
           (testing "saving a document card whose goal reads a missing card is refused"
             (save-document 404 (card-goal Integer/MAX_VALUE))
             (is (not (t2/exists? :model/Document :name "Document with a dynamic goal"))))
           (testing "a goal reading a readable card saves"
             (save-document 200 (card-goal readable-id)))))))))

(deftest transient-dashboard-card-goal-reference-test
  (testing "saving a transient dashboard whose new card has a goal reading a missing card is refused"
    (mt/with-model-cleanup [:model/Dashboard :model/Card]
      (mt/user-http-request :rasta :post 404 "dashboard/save"
                            {:name      "Transient dashboard with a dynamic goal"
                             :dashcards [{:row 0 :col 0 :size_x 4 :size_y 4
                                          :card {:name                   "Transient gauge"
                                                 :display                "gauge"
                                                 :dataset_query          (count-query)
                                                 :visualization_settings (gauge-viz (card-goal Integer/MAX_VALUE))}}]})
      (is (not (t2/exists? :model/Card :name "Transient gauge")))
      (is (not (t2/exists? :model/Dashboard :name "Transient dashboard with a dynamic goal"))))))

(deftest created-dashboard-goal-reference-test
  (testing "creating a dashboard whose dashcard has a goal reading a missing card is refused"
    (mt/with-model-cleanup [:model/Dashboard]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (count-query)}]
        (is (= 404 (mt/with-test-user :rasta
                     (status-of #(dashboards.write/create-dashboard!
                                  {:name      "Dashboard with a dynamic goal"
                                   :dashcards [(merge layout {:card_id                card-id
                                                              :visualization_settings (gauge-viz
                                                                                       (card-goal Integer/MAX_VALUE))})]})))))
        (is (not (t2/exists? :model/Dashboard :name "Dashboard with a dynamic goal")))))))

(deftest public-card-goal-reference-save-test
  (testing "an editor can't make a public card return a card they can't read"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (do-with-unreadable-card!
       (fn [goal-id]
         (mt/with-temp [:model/Card {card-id :id uuid :public_uuid} {:dataset_query (count-query)
                                                                     :public_uuid   (str (random-uuid))}]
           (mt/user-http-request :rasta :put 403 (format "card/%d" card-id)
                                 {:visualization_settings (gauge-viz (card-goal goal-id))})
           (is (= {} (client/client :get 202 (str "public/card/" uuid "/goal-values"))))))))))

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

(defn- venues-by-tenant []
  (mt/native-query {:query         "SELECT COUNT(*) AS \"count\" FROM venues WHERE category_id = {{tenant}}"
                    :template-tags {"tenant" {:id "_TENANT_" :name "tenant" :display-name "Tenant"
                                              :type :number :default 2}}}))

(deftest card-with-parameters-goal-reference-test
  (mt/with-temp [:model/Card {variable-id :id} {:dataset_query (venues-by-tenant)}
                 :model/Card {built-on-id :id} {:dataset_query {:database (mt/id)
                                                                :type     :query
                                                                :query    {:source-table (str "card__" variable-id)
                                                                           :aggregation  [[:count]]}}}
                 :model/Card {plain-id :id} {:dataset_query (count-query)}
                 :model/Card {card-id :id} {:dataset_query (count-query)}
                 :model/Dashboard {dash-id :id} {}]
    (mt/with-test-user :crowberto
      (testing "a goal on a card with variables, or built on one, is refused even for an admin"
        (doseq [source-id [variable-id built-on-id]]
          (is (= 400 (save-card-status! {:visualization_settings (gauge-viz (card-goal source-id))})))
          (is (= 400 (update-card-status! card-id {:visualization_settings (gauge-viz (card-goal source-id))})))
          (is (= 400 (dashcard-status [] [(merge layout
                                                 {:dashboard_id           dash-id
                                                  :card_id                card-id
                                                  :visualization_settings (gauge-viz (card-goal source-id))})])))))
      (testing "a goal on a card without variables passes"
        (is (= :no-error (save-card-status! {:visualization_settings (gauge-viz (card-goal plain-id))})))))
    (testing "the API says why"
      (is (= (str "This question uses variables, directly or through a question it's built on, "
                  "so it can't be a goal.")
             (mt/user-http-request :crowberto :put 400 (format "card/%d" card-id)
                                   {:visualization_settings (gauge-viz (card-goal variable-id))}))))))

(deftest card-gaining-parameters-goal-reference-test
  (testing "a goal saved before its source gained a variable doesn't block unrelated edits; it fails at run time"
    (mt/with-temp [:model/Card {source-id :id} {:dataset_query (count-query)}
                   :model/Card {card-id :id} {:dataset_query          (count-query)
                                              :visualization_settings (gauge-viz (card-goal source-id))}]
      (t2/update! :model/Card :id source-id {:dataset_query (venues-by-tenant)})
      (mt/with-test-user :crowberto
        (is (= :no-error (update-card-status! card-id {:visualization_settings (assoc (gauge-viz (card-goal source-id))
                                                                                      :card.title "renamed")})))))))

(deftest model-goal-reference-test
  (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (count-query)}
                 :model/Card {card-id :id} {:dataset_query (count-query)}]
    (mt/with-test-user :crowberto
      (testing "a goal reading a model is refused even for an admin"
        (is (= 400 (save-card-status! {:visualization_settings (gauge-viz (card-goal model-id))})))
        (is (= 400 (update-card-status! card-id {:visualization_settings (gauge-viz (card-goal model-id))})))))
    (testing "the API says why"
      (is (= "A model can't be a goal."
             (mt/user-http-request :crowberto :put 400 (format "card/%d" card-id)
                                   {:visualization_settings (gauge-viz (card-goal model-id))}))))))
