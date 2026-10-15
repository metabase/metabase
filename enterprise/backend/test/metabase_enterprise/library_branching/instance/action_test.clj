(ns metabase-enterprise.library-branching.instance.action-test
  "The app DB side of actions: the content that the instance reads, scope, the local changes that a content difference
  shows, `write!`, `current` and `trash!`, and the scenarios of the remote-sync action tests in library-branching
  form. Each test writes in a transaction that rolls back."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.in-use :as in-use]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users) features.tu/with-features)

;;; ---------------------------------------------------- Helpers ---------------------------------------------------

(defn- store [] (get app-db/kind-stores :action))

(defn- write! [id item] (instance/write! (store) id (assoc item :refs (format.kinds/refs :action id (:attrs item)))))

(defn- with-refs
  "Action `item` with the references of its attributes."
  [item]
  (assoc item :refs (format.kinds/refs :action nil (:attrs item))))

(defn- current [id] (instance/current (store) id))

(defn- trash! [id] (instance/trash! (store) id))

(defn- refusal
  "The reason of the ::instance/refused that `(f)` throws, or nil when it throws none."
  [f]
  (try
    (f)
    nil
    (catch clojure.lang.ExceptionInfo e
      (when (= ::instance/refused (:type (ex-data e)))
        (:reason (ex-data e))))))

(defn- db-name [] (t2/select-one-fn :name :model/Database (mt/id)))

(defn- native-query
  [sql]
  (lib/native-query (mt/metadata-provider) sql))

(defn- read-item [id] (get (app-db/read-current) id))

(defn- insert-action!
  "Inserts an action of `type` (`:query`, with the query `sql`, or `:implicit` of `kind`), as a save does, and returns
  its row."
  [{:keys [type sql kind] :or {type :query sql "UPDATE venues SET name = 'x'"} :as row}]
  (let [action (t2/insert-returning-instance! :model/Action (merge {:name       "Refund"
                                                                    :type       type
                                                                    :creator_id (mt/user->id :rasta)}
                                                                   (dissoc row :sql :kind)))]
    (case type
      :query    (t2/insert! :model/QueryAction {:action_id (:id action) :dataset_query (native-query sql)})
      :implicit (t2/insert! :model/ImplicitAction {:action_id (:id action) :kind (or kind :row/create)}))
    action))

(defn- action-rows
  "Every column of the action rows of the identities `ids`, with their query and implicit rows."
  [ids]
  (let [rows (t2/select :action :entity_id [:in ids] {:order-by [:id]})
        ids  (map :id rows)]
    [rows
     (when (seq ids) (t2/select :query_action :action_id [:in ids] {:order-by [:action_id]}))
     (when (seq ids) (t2/select :implicit_action :action_id [:in ids] {:order-by [:action_id]}))]))

(defn- venues-query
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- do-with-actions-content
  "Calls `(f refunds apps model)`: `refunds` is a collection of the data actions namespace, `apps` a collection of the
  data apps namespace, and `model` a model card in `apps`. The rows go away after the call, and so does every write of
  `f`, in a transaction that rolls back."
  [f]
  (mt/with-temp [:model/Collection refunds {:name "Refunds" :namespace "data-actions" :location "/"}
                 :model/Collection apps    {:name "Sales portal" :namespace "data-apps" :location "/"}
                 :model/Card       model   {:name          "Orders model"
                                            :type          :model
                                            :collection_id (:id apps)
                                            :dataset_query (venues-query)}]
    (t2/with-transaction [_ nil {:rollback-only true}]
      (f refunds apps model))))

(def ^:private none {:created #{} :deleted #{} :updated #{}})

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest action-content-test
  (do-with-actions-content
   (fn [refunds _apps model]
     (let [on-model (insert-action! {:model_id (:id model) :sql "UPDATE venues SET name = {{name}}"
                                     :description "Renames a place." :visualization_settings {:confirmMessage "Sure?"}})
           implicit (insert-action! {:model_id (:id model) :type :implicit :kind :row/update})
           root     (insert-action! {:name "Refund all"})
           folder   (insert-action! {:name "Refund one" :collection_id (:id refunds)})]
       (testing "an action with a model: the model as its place and as its reference, the query by natural keys"
         (let [item (read-item (:entity_id on-model))]
           (is (= {:kind  :action
                   :name  "Refund"
                   :place (:entity_id model)
                   :refs  #{[:database [:env [(db-name)]]] [:model (:entity_id model)]}}
                  (dissoc item :attrs)))
           (is (= {:description            "Renames a place."
                   :model                  (:entity_id model)
                   :type                   "query"
                   :visualization_settings {:confirmMessage "Sure?"}}
                  (dissoc (:attrs item) :dataset_query)))
           (is (= "UPDATE venues SET name = {{name}}" (get-in item [:attrs :dataset_query :stages 0 :native])))
           (is (= (db-name) (get-in item [:attrs :dataset_query :database])))))
       (testing "an implicit action: its model and its implicit kind"
         (is (= {:kind  :action :name "Refund" :place (:entity_id model) :refs #{[:model (:entity_id model)]}
                 :attrs {:model (:entity_id model) :type "implicit" :implicit_kind "row/update"}}
                (read-item (:entity_id implicit)))))
       (testing "an action with no model: at the root of the data actions namespace, whose place is the Data actions
                area root, or in its collection"
         (is (= "dataactionsdataaction" (:place (read-item (:entity_id root)))))
         (is (= (:entity_id refunds) (:place (read-item (:entity_id folder))))))
       (testing "every action that the instance reads fits the schema of its kind, and survives encode and decode"
         (let [c (first (filter #(= :action (codec/kind %)) format.kinds/codecs))]
           (doseq [a [on-model implicit root folder]
                   :let [id (:entity_id a), item (read-item id)]]
             (is (mr/validate (codec/schema c) item) id)
             (is (= [id item] (codec/decode c (codec/read-yaml (writer/write-yaml (codec/encode c id item))))) id))))
       (testing "the public link and the bookkeeping columns are not content"
         (let [before (read-item (:entity_id root))]
           (t2/update! :model/Action (:id root) {:public_uuid (str (random-uuid)) :made_public_by_id (mt/user->id :rasta)})
           (t2/update! :model/Action (:id root) {:created_at (java.time.OffsetDateTime/now)})
           (is (= before (read-item (:entity_id root))))))))))

(deftest serdes-walk-law-test
  (testing "the references and the containers of an action hold every dependency that the serdes walk of master
            follows from it: the collection of an action with a model is the place of its model"
    (do-with-actions-content
     (fn [refunds apps model]
       (mt/with-temp [:model/Card question {:name "Lookup" :type :question :dataset_query (venues-query)}
                      :model/NativeQuerySnippet _snippet {:name "lb action filter" :content "1 = 1"}]
         (let [sql     (str "UPDATE venues SET name = 'x' WHERE id IN (SELECT id FROM {{#" (:id question) "}})"
                            " AND {{snippet: lb action filter}}")
               actions [(insert-action! {:model_id (:id model) :sql sql})
                        (insert-action! {:model_id (:id model) :type :implicit})
                        (insert-action! {:collection_id (:id refunds) :sql sql})
                        (insert-action! {})]
               portable (fn [{:keys [model id]}]
                          (case model
                            "Database"           [:env [(t2/select-one-fn :name :model/Database id)]]
                            "Card"               (t2/select-one-fn :entity_id :model/Card id)
                            "Collection"         (t2/select-one-fn :entity_id :model/Collection id)
                            "NativeQuerySnippet" (t2/select-one-fn :entity_id :model/NativeQuerySnippet id)))]
           (doseq [a actions
                   :let [{:keys [place refs] :as item} (read-item (:entity_id a))
                         containers (cond-> #{place}
                                      (:model_id a) (conj (:entity_id apps)))
                         deps       (serdes/serialization-dependencies "Action" (t2/select-one :model/Action (:id a)))]]
             (testing (pr-str (:attrs item))
               (is (seq deps))
               (is (every? (into containers (map second) refs) (map (comp portable last) deps)))))))))))

;;; ------------------------------------------------------ Scope ------------------------------------------------------

(deftest scope-test
  (do-with-actions-content
   (fn [refunds apps model]
     (mt/with-temp [:model/Card outside-model {:name "Outside model" :type :model :dataset_query (venues-query)}]
       (let [in       (insert-action! {:model_id (:id model)})
             elsewhere (insert-action! {:model_id (:id outside-model)})
             archived (insert-action! {:model_id (:id model) :archived true})
             root     (insert-action! {})
             folder   (insert-action! {:collection_id (:id refunds)})
             app      (insert-action! {:collection_id (:id apps)})
             ids      #(:action (scope/scope-ids scope/roots [:action]))]
         (testing "an action on an in-scope model is in scope; on a model outside the Library, or archived, it is not"
           (is (contains? (ids) (:entity_id in)))
           (is (not (contains? (ids) (:entity_id elsewhere))))
           (is (not (contains? (ids) (:entity_id archived)))))
         (testing "an action with no model at the data actions root, in a data actions collection or in a data app
                  collection is in scope"
           (is (every? (ids) (map :entity_id [root folder app]))))
         (testing "an archived model takes its actions out of scope"
           (t2/update! :model/Card (:id model) {:archived true})
           (is (not (contains? (ids) (:entity_id in))))))))))

;;; ------------------------------------------------- Local changes ------------------------------------------------

(deftest local-changes-test
  (do-with-actions-content
   (fn [_refunds _apps model]
     (mt/with-temp [:model/Card outside-model {:name "Outside model" :type :model :dataset_query (venues-query)}]
       (let [a     (insert-action! {:model_id (:id model)})
             base  (app-db/read-current)
             local #(diff/diff base (app-db/read-current))]
         (testing "a save of an action that changes nothing is no local change"
           (t2/update! :model/Action (:id a) {:name "Refund"})
           (is (= none (local))))
         (testing "a new action on an in-scope model is a local create, in its model's place"
           (t2/with-transaction [_ nil {:rollback-only true}]
             (let [b (insert-action! {:model_id (:id model) :name "New"})]
               (is (= (assoc none :created #{(:entity_id b)}) (local)))
               (is (= (:entity_id model) (:place (read-item (:entity_id b))))))))
         (testing "a new action on a model outside the Library is no local change"
           (t2/with-transaction [_ nil {:rollback-only true}]
             (insert-action! {:model_id (:id outside-model)})
             (is (= none (local)))))
         (testing "an edit of the query or of a column is a local update"
           (t2/with-transaction [_ nil {:rollback-only true}]
             (t2/update! :model/QueryAction (:id a) {:dataset_query (native-query "UPDATE venues SET name = 'y'")})
             (is (= (assoc none :updated #{(:entity_id a)}) (local))))
           (t2/with-transaction [_ nil {:rollback-only true}]
             (t2/update! :model/Action (:id a) {:description "Changed"})
             (is (= (assoc none :updated #{(:entity_id a)}) (local)))))
         (testing "an archived action is a local delete, and its unarchive takes the delete back"
           (t2/with-transaction [_ nil {:rollback-only true}]
             (t2/update! :model/Action (:id a) {:archived true})
             (is (= (assoc none :deleted #{(:entity_id a)}) (local)))
             (t2/update! :model/Action (:id a) {:archived false})
             (is (= none (local)))))
         (testing "a model that moves out of the Library takes its action with it: a local delete of both"
           (t2/with-transaction [_ nil {:rollback-only true}]
             (t2/update! :model/Card (:id model) {:collection_id nil})
             (is (= (assoc none :deleted #{(:entity_id model) (:entity_id a)}) (local)))))
         (testing "a deleted model is a local delete of the model and its action; a deleted action, of the action"
           (t2/with-transaction [_ nil {:rollback-only true}]
             (t2/delete! :model/Card (:id model))
             (is (= (assoc none :deleted #{(:entity_id model) (:entity_id a)}) (local))))
           (t2/with-transaction [_ nil {:rollback-only true}]
             (t2/delete! :model/Action (:id a))
             (is (= (assoc none :deleted #{(:entity_id a)}) (local)))))
         (testing "after the rollbacks, nothing changed"
           (is (= none (local)))))))))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(def ^:private new-id "lbWriteAction00000001")

(deftest write-test
  (do-with-actions-content
   (fn [refunds _apps model]
     (let [template (read-item (:entity_id (insert-action! {:model_id (:id model) :sql "UPDATE venues SET name = {{name}}"
                                                            :visualization_settings {:confirmMessage "Sure?"}})))
           implicit (read-item (:entity_id (insert-action! {:model_id (:id model) :type :implicit})))
           root     (-> template
                        (assoc :place "dataactionsdataaction")
                        (update :attrs dissoc :model)
                        with-refs)]
       (testing "a write of a new identity creates the action on its model, and current returns the content"
         (write! new-id (assoc template :name "Written"))
         (is (= (assoc template :name "Written") (current new-id)))
         (is (= {:model_id (:id model) :collection_id (:collection_id model)}
                (t2/select-one [:model/Action :model_id :collection_id] :entity_id new-id))))
       (let [row-id (t2/select-one-pk :model/Action :entity_id new-id)]
         (testing "a write of the current content changes no row"
           (let [before (action-rows [new-id])]
             (instance/write! (store) new-id (current new-id))
             (is (= before (action-rows [new-id])))))
         (testing "an absent attribute goes to its default"
           (write! new-id (update template :attrs dissoc :visualization_settings))
           (is (not (contains? (:attrs (current new-id)) :visualization_settings))))
         (testing "a write of an implicit action replaces the query row with an implicit row, and back"
           (write! new-id implicit)
           (is (= implicit (current new-id)))
           (is (= [[] [{:action_id row-id :kind "row/create"}]]
                  (rest (action-rows [new-id]))))
           (write! new-id template)
           (is (= template (current new-id))))
         (testing "a write moves an action from its model to the data actions root and to a collection"
           (write! new-id root)
           (is (= root (current new-id)))
           (is (= {:model_id nil :collection_id nil} (t2/select-one [:model/Action :model_id :collection_id] row-id)))
           (write! new-id (assoc root :place (:entity_id refunds)))
           (is (= (:id refunds) (t2/select-one-fn :collection_id :model/Action row-id)))
           (write! new-id template)
           (is (= template (current new-id))))
         (testing "trash! moves the action to the trash, and a write of the trashed identity restores the same row"
           (trash! new-id)
           (is (nil? (current new-id)))
           (is (true? (t2/select-one-fn :archived :model/Action row-id)))
           (is (nil? (trash! new-id)) "a trash of an action in the trash does nothing")
           (write! new-id template)
           (is (= template (current new-id)))
           (is (= row-id (t2/select-one-pk :model/Action :entity_id new-id)))
           (is (false? (t2/select-one-fn :archived :model/Action row-id)))))
       (testing "a trash of an identity that no row has does nothing"
         (is (nil? (trash! "lbNoSuchAction0000001"))))))))

(deftest refused-writes-write-nothing-test
  (do-with-actions-content
   (fn [_refunds _apps model]
     (mt/with-temp [:model/Collection plain {:name "Plain" :location "/"}
                    :model/Card outside-model {:name "Outside model" :type :model :dataset_query (venues-query)}
                    :model/Card question      {:name          "Orders question" :type :question
                                               :collection_id (:collection_id model)
                                               :dataset_query (venues-query)}]
       (let [template (read-item (:entity_id (insert-action! {:model_id (:id model)})))
             root     (-> template (assoc :place "dataactionsdataaction") (update :attrs dissoc :model) with-refs)
             on       (fn [card] (-> template (assoc :place (:entity_id card)) (assoc-in [:attrs :model] (:entity_id card))))
             outside  (insert-action! {:model_id (:id outside-model)})
             before   (action-rows [new-id (:entity_id outside)])]
         (testing "content that is not an action"
           (is (= :invalid-content (refusal #(write! new-id (assoc template :place nil)))))
           (is (= :invalid-content (refusal #(instance/write! (store) new-id (assoc template :refs #{}))))))
         (testing "a model that is not an in-scope model on this instance: a question, a model outside the Library, or
                  no card"
           (is (= :place (refusal #(write! new-id (on question)))))
           (is (= :place (refusal #(write! new-id (on outside-model)))))
           (is (= :place (refusal #(write! new-id (on {:entity_id "lbNoSuchModel00000001"}))))))
         (testing "an action with no model at the root level, or at the root of another area"
           (is (= :place (refusal #(write! new-id (assoc root :place nil)))))
           (is (= :place (refusal #(write! new-id (assoc root :place "dataappsdataappsdatap"))))))
         (testing "a collection that is not in scope, or not of the data actions or data apps namespace"
           (is (= :place (refusal #(write! new-id (assoc root :place (:entity_id plain))))))
           (collections.tu/with-library [{:keys [data]}]
             (is (= :place (refusal #(write! new-id (assoc root :place (:entity_id data))))))))
         (testing "a row outside the Library tree with the identity: an action on a model outside the Library"
           (is (= :outside-library (refusal #(write! (:entity_id outside) root))))
           (is (= :outside-library (refusal #(trash! (:entity_id outside))))))
         (testing "nothing changed"
           (is (= before (action-rows [new-id (:entity_id outside)])))))))))

;;; ----------------------------------------------------- Trash ----------------------------------------------------

(deftest trash-keeps-outside-dashboards-test
  (testing "after trash! of a Library action, a dashboard outside the Library keeps its button for the action, and
            the in-use report names the dashboard; a dashboard in the trash is no user"
    (do-with-actions-content
     (fn [_refunds _apps model]
       (let [a      (insert-action! {:model_id (:id model)})
             unused (insert-action! {:name "Unused"})]
         (mt/with-temp [:model/Dashboard     dashboard {:name "Outside dashboard"}
                        :model/DashboardCard dashcard  {:dashboard_id (:id dashboard) :action_id (:id a)}
                        :model/Dashboard     trashed   {:name "Trashed dashboard" :archived true}
                        :model/DashboardCard _         {:dashboard_id (:id trashed) :action_id (:id unused)}]
           (trash! (:entity_id a))
           (trash! (:entity_id unused))
           (is (nil? (current (:entity_id a))))
           (is (true? (t2/select-one-fn :archived :model/Action (:id a))))
           (is (= (:id a) (t2/select-one-fn :action_id :model/DashboardCard (:id dashcard))))
           (is (= {(:entity_id a) [{:kind :dashboard :id (:entity_id dashboard) :name "Outside dashboard"}]}
                  (in-use/trashed-in-use [{:id (:entity_id a) :kind :action}
                                          {:id (:entity_id unused) :kind :action}])))))))))

(deftest trash-of-a-data-app-action-test
  (testing "an action in the collection of a data app has no trash in Metabase: trash! refuses it and writes nothing"
    (mt/with-temp [:model/DataApp app {}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (let [a (insert-action! {:collection_id (:resource_collection_id (t2/select-one :model/DataApp (:id app)))})]
          (is (some? (current (:entity_id a))))
          (is (= :no-trash (refusal #(trash! (:entity_id a)))))
          (is (false? (t2/select-one-fn :archived :model/Action (:id a)))))))))
