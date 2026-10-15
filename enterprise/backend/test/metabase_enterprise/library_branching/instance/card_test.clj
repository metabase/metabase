(ns metabase-enterprise.library-branching.instance.card-test
  "The app DB side of the card kinds :question and :model: the content that a read gives, `write!`, `current` and
  `trash!`, a change of a card's kind, and the cascades of the Card save path. Each test writes in a transaction that
  rolls back."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.in-use :as in-use]
   [metabase-enterprise.library-branching.instance.write-test :as write-test]
   [metabase.actions.core :as actions]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.core :as queries]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private new-question-id "lbWriteQuestion000001")
(def ^:private new-model-id "lbWriteModel000000001")

(defn- filter-query
  "A query of the rows of venues whose price is over 1."
  []
  (let [mp    (mt/metadata-provider)
        price (lib.metadata/field mp (mt/id :venues :price))]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/filter (lib/> price 1)))))

(defn- table-query
  "A query of every row of venues: a model of it supports implicit actions."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- do-with-world!
  "Calls `f` with `{:app :dashboards :dashboard :metrics}`: a data app's collection, a Dashboards section of the Library
  with a dashboard in it, and the Metrics section. Rolls back what `f` writes."
  [f]
  (collections.tu/with-library [{:keys [library metrics]}]
    (t2/with-transaction [_ nil {:rollback-only true}]
      (let [app        (t2/insert-returning-instance! :model/Collection {:name "Sales app" :namespace "data-apps"
                                                                         :location "/"})
            dashboards (t2/insert-returning-instance! :model/Collection {:name     "Dashboards"
                                                                         :type     "library-dashboards"
                                                                         :location (write-test/children-location library)})
            dashboard  (t2/insert-returning-instance! :model/Dashboard {:name          "Sales"
                                                                        :collection_id (:id dashboards)
                                                                        :creator_id    (mt/user->id :rasta)})]
        (f {:app app :dashboards dashboards :dashboard dashboard :metrics metrics})))))

(defn- insert-card!
  [card]
  (t2/insert-returning-instance! :model/Card (merge {:display                :table
                                                     :visualization_settings {}
                                                     :creator_id             (mt/user->id :rasta)
                                                     :dataset_query          (write-test/sum-query :venues :price)}
                                                    card)))

(defn- edit-columns!
  "Gives the first column of the result metadata of card `card` the display name `display-name`, as a person's edit of
  a model's metadata does."
  [card display-name]
  (let [cols (vec (t2/select-one-fn :result_metadata :model/Card (:id card)))]
    (t2/update! :model/Card (:id card) {:result_metadata (assoc-in cols [0 :display_name] display-name)})))

(defn- store [kind] (get app-db/kind-stores kind))

(defn- fits? [id {:keys [kind] :as item}]
  (let [c (get (codec/by-kind format.kinds/codecs) kind)]
    (and (mr/validate (codec/schema c) item)
         (= [id item] (codec/decode c (codec/read-yaml (writer/write-yaml (codec/encode c id item))))))))

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest card-content-test
  (do-with-world!
   (fn [{:keys [app dashboards dashboard]}]
     (let [question (insert-card! {:name "Orders" :type :question :collection_id (:id app) :description "All."})
           dash-q   (insert-card! {:name "On the dashboard" :type :question :collection_id (:id dashboards)
                                   :dashboard_id (:id dashboard)})
           native   (insert-card! {:name          "Native" :type :question :collection_id (:id app)
                                   :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1 AS ONE")
                                   :result_metadata [{:name "ONE" :display_name "ONE" :base_type :type/Integer}]})
           model    (insert-card! {:name "Venues model" :type :model :collection_id (:id app)})
           _        (edit-columns! model "Price total")
           s        (app-db/read-current)]
       (testing "a question in a data app's collection: the kind of its type, its collection as the place"
         (is (= {:kind  :question
                 :name  "Orders"
                 :place (:entity_id app)
                 :attrs {:description "All." :display "table"
                         :query       (get-in s [(:entity_id question) :attrs :query])}}
                (dissoc (get s (:entity_id question)) :refs))))
       (testing "a dashboard question names its dashboard, and refers to it"
         (is (= (:entity_id dashboard) (get-in s [(:entity_id dash-q) :attrs :dashboard_id])))
         (is (contains? (get-in s [(:entity_id dash-q) :refs]) [:dashboard (:entity_id dashboard)])))
       (testing "the result metadata of a question is derived, so it is not content, also for a native query"
         (is (not (contains? (get-in s [(:entity_id native) :attrs]) :result_metadata))))
       (testing "a model holds the columns as a person edits them, in the form of the serdes export"
         (is (= :model (get-in s [(:entity_id model) :kind])))
         (is (= [{:name "sum" :display_name "Price total"}]
                (mapv #(select-keys % [:name :display_name]) (get-in s [(:entity_id model) :attrs :result_metadata]))))
         (is (not-any? #(contains? % :base_type) (get-in s [(:entity_id model) :attrs :result_metadata]))))
       (testing "every card item fits its schema and survives encode and decode"
         (doseq [card [question dash-q native model]]
           (is (fits? (:entity_id card) (get s (:entity_id card))) (:name card))))))))

;;; ----------------------------------------------------- Writes ---------------------------------------------------

(deftest card-write-test
  (do-with-world!
   (fn [{:keys [app]}]
     (let [model    (insert-card! {:name "Venues model" :type :model :collection_id (:id app)})
           _        (edit-columns! model "Price total")
           template (write-test/current :model (:entity_id model))]
       (testing "a write of a new model creates it with the edited columns, completed from its query"
         (write-test/write! :model new-model-id (assoc template :name "Copy"))
         (is (= (assoc template :name "Copy") (write-test/current :model new-model-id)))
         (is (= [{:name "sum" :display_name "Price total" :base_type :type/Integer}]
                (mapv #(select-keys % [:name :display_name :base_type])
                      (t2/select-one-fn :result_metadata :model/Card :entity_id new-model-id)))))
       (testing "a write of other edits changes the columns, and a write of the current content changes no row"
         (let [edited (assoc-in template [:attrs :result_metadata 0 :description] "The price level, summed.")]
           (write-test/write! :model new-model-id (assoc edited :name "Copy"))
           (is (= (assoc edited :name "Copy") (write-test/current :model new-model-id)))
           (let [before (t2/select-one :report_card :entity_id new-model-id)]
             (instance/write! (store :model) new-model-id (write-test/current :model new-model-id))
             (is (= before (t2/select-one :report_card :entity_id new-model-id))))))
       (testing "a write of a new question in the data app's collection"
         (let [q (-> template
                     (assoc :kind :question :name "A question")
                     (update :attrs dissoc :result_metadata)
                     (assoc-in [:attrs :description] "Sums."))]
           (write-test/write! :question new-question-id q)
           (is (= (assoc q :refs (format.kinds/refs :question new-question-id (:attrs q)))
                  (write-test/current :question new-question-id)))
           (is (= :question (t2/select-one-fn :type :model/Card :entity_id new-question-id)))))
       (testing "trash! moves the question to the trash, and a write restores it"
         (let [q (write-test/current :question new-question-id)]
           (write-test/trash! :question new-question-id)
           (is (nil? (write-test/current :question new-question-id)))
           (is (t2/select-one-fn :archived :model/Card :entity_id new-question-id))
           (write-test/write! :question new-question-id q)
           (is (= q (write-test/current :question new-question-id)))))))))

(deftest dashboard-question-write-test
  (testing "a write of a dashboard question puts it on its dashboard, in the dashboard's collection"
    (do-with-world!
     (fn [{:keys [dashboards dashboard]}]
       (let [template (-> (insert-card! {:name "Template" :type :question :collection_id (:id dashboards)
                                         :dashboard_id (:id dashboard)})
                          :entity_id
                          (#(write-test/current :question %)))]
         (write-test/write! :question new-question-id (assoc template :name "On the dashboard"))
         (is (= (assoc template :name "On the dashboard") (write-test/current :question new-question-id)))
         (is (= {:dashboard_id (:id dashboard) :collection_id (:id dashboards)}
                (t2/select-one [:model/Card :dashboard_id :collection_id] :entity_id new-question-id))))))))

(deftest model-before-warehouse-sync-test
  (testing "M11-001: a model whose query has no columns on this instance yet (its warehouse is not synced) keeps the
           edited columns, and reads back as written"
    (do-with-world!
     (fn [{:keys [app]}]
       (let [model    (insert-card! {:name "Venues model" :type :model :collection_id (:id app)})
             _        (edit-columns! model "Price total")
             template (write-test/current :model (:entity_id model))]
         (mt/with-dynamic-fn-redefs [queries/infer-metadata-with-model-overrides (constantly nil)]
           (write-test/write! :model new-model-id template))
         (is (= template (write-test/current :model new-model-id))))))))

(deftest card-noop-save-stays-synced-test
  (testing "M11-011: a save of a question and of a model with no change leaves their content as it was"
    (do-with-world!
     (fn [{:keys [app]}]
       (let [question (insert-card! {:name "Orders" :type :question :collection_id (:id app)})
             model    (insert-card! {:name "Venues model" :type :model :collection_id (:id app)})
             _        (edit-columns! model "Price total")
             before   (app-db/read-current)]
         (doseq [card [question model]
                 :let [row (t2/select-one :model/Card (:id card))]]
           (t2/update! :model/Card (:id card) (select-keys row [:name :display :dataset_query :visualization_settings
                                                                :result_metadata :description])))
         (is (= before (app-db/read-current))))))))

;;; ----------------------------------------------------- Kinds ----------------------------------------------------

(defn- actions-of
  [model]
  (into (sorted-map)
        (map (juxt :name (juxt :type :archived)))
        (t2/select [:model/Action :name :type :archived] :model_id (:id model))))

(defn- add-actions!
  "An implicit action and a query action on `model`."
  [model]
  (actions/insert! {:name "Create venue" :type :implicit :kind :row/create :model_id (:id model)})
  (actions/insert! {:name          "Rename venue"
                    :type          :query
                    :model_id      (:id model)
                    :database_id   (mt/id)
                    :dataset_query (lib/native-query (mt/metadata-provider)
                                                     "UPDATE venues SET name = 'x' WHERE id = 1")
                    :parameters    []}))

(deftest model-becomes-question-test
  (testing "M11-004: a write of a question to the identity of a model turns the model into the question through the
           Card save path: its query action goes to the trash and its implicit action is deleted"
    (do-with-world!
     (fn [{:keys [app]}]
       (let [model (insert-card! {:name "Venues model" :type :model :collection_id (:id app)
                                  :dataset_query (table-query)})
             _     (add-actions! model)
             id    (:entity_id model)
             as-q  (-> (write-test/current :model id)
                       (assoc :kind :question)
                       (update :attrs dissoc :result_metadata))
             as-q  (assoc as-q :refs (format.kinds/refs :question id (:attrs as-q)))
             plan  [{:id id :write as-q :pre (write-test/current :model id)}]]
         (is (= {:stale [] :gone []}
                (apply/check-steps (fn [kind i] (instance/current (store kind) i)) plan true))
             "the current of the new kind gives the card with its own kind, so the step's precondition holds")
         (instance/write! (store :question) id as-q)
         (is (= as-q (write-test/current :question id)))
         (is (= :question (t2/select-one-fn :type :model/Card (:id model))))
         (is (= {"Rename venue" [:query true]} (actions-of model)))
         (testing "and a write of the model back turns it into a model again"
           (write-test/write! :model id (update (write-test/current :question id) :kind (constantly :model)))
           (is (= :model (t2/select-one-fn :type :model/Card (:id model))))))))))

(deftest model-query-drops-implicit-actions-test
  (testing "M11-005: a write of a model with a query that supports no implicit action deletes its implicit action
           through the Card save path; the query action stays"
    (do-with-world!
     (fn [{:keys [app]}]
       (let [model    (insert-card! {:name "Venues model" :type :model :collection_id (:id app)
                                     :dataset_query (table-query)})
             _        (add-actions! model)
             template (insert-card! {:name "Filtered" :type :model :collection_id (:id app)
                                     :dataset_query (filter-query)})
             query    (get-in (write-test/current :model (:entity_id template)) [:attrs :query])
             item     (-> (write-test/current :model (:entity_id model))
                          (assoc-in [:attrs :query] query)
                          (update :attrs dissoc :result_metadata))]
         (write-test/write! :model (:entity_id model) item)
         (is (= query (get-in (write-test/current :model (:entity_id model)) [:attrs :query])))
         (is (= {"Rename venue" [:query false]} (actions-of model))))))))

(deftest kind-refusals-test
  (testing "a metric keeps its kind: a write of a question or a model to a metric, or of a metric to a question, is
           refused and writes nothing"
    (do-with-world!
     (fn [{:keys [app metrics]}]
       (let [metric   (insert-card! {:name "Price" :type :metric :display :scalar :collection_id (:id metrics)})
             question (insert-card! {:name "Orders" :type :question :collection_id (:id app)})
             q-item   (write-test/current :question (:entity_id question))
             m-item   (write-test/current :metric (:entity_id metric))
             rows     #(t2/select :report_card :id [:in [(:id metric) (:id question)]] {:order-by [:id]})
             before   (rows)]
         (is (= :other-kind (write-test/refusal #(write-test/write! :question (:entity_id metric) q-item))))
         (is (= :other-kind (write-test/refusal #(write-test/write! :model (:entity_id metric)
                                                                    (assoc q-item :kind :model)))))
         (is (= :other-kind (write-test/refusal #(write-test/write! :metric (:entity_id question)
                                                                    (assoc m-item :place (:entity_id metrics))))))
         (is (= before (rows))))))))

;;; ------------------------------------------------------ Trash ---------------------------------------------------

(deftest trashed-question-in-use-test
  (testing "a trash of a Library question that a question outside the Library uses as its source: the outside
           question still runs, and the in-use report names it"
    (do-with-world!
     (fn [{:keys [app]}]
       (let [question (insert-card! {:name "Orders" :type :question :collection_id (:id app)})
             mp       (mt/metadata-provider)
             outside  (insert-card! {:name          "Outside user"
                                     :type          :question
                                     :dataset_query (lib/query mp (lib.metadata/card mp (:id question)))})]
         (write-test/trash! :question (:entity_id question))
         (is (nil? (write-test/current :question (:entity_id question))))
         (is (= {(:entity_id question) [{:kind :card :id (:entity_id outside) :name "Outside user"}]}
                (in-use/trashed-in-use [{:id (:entity_id question) :kind :question}]))))))))
