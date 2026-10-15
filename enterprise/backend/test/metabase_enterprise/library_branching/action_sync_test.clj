(ns metabase-enterprise.library-branching.action-sync-test
  "The push and the pull of actions with no model on the app DB instance. A push and a pull read at a read point of
  their own, so these tests commit their content and delete it afterwards, and they change the one base row of the
  app DB; they are not parallel."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private created-id
  "The entity id of the action that a pull of these tests creates."
  "lbPullNewAction000001")

(defn- reset-base! []
  (t2/query {:update :library_branching_base :set {:commit_id nil :digests nil} :where [:= :id 1]}))

(defn- do-with-committed-content!
  "Calls `f` with a function `(insert! model row)` that inserts and commits a row and returns it. Deletes every
  inserted row and the action of [[created-id]] afterwards, the last first, and clears the base row before and after."
  [f]
  (let [rows    (atom ())
        insert! (fn [model row]
                  (let [inserted (t2/insert-returning-instance! model row)]
                    (swap! rows conj [model inserted])
                    inserted))]
    (reset-base!)
    (try
      (mt/with-temporary-setting-values [library-branching-enabled true]
        (f insert!))
      (finally
        (t2/delete! :model/Action :entity_id created-id)
        (doseq [[model row] @rows
                :when (not= :model/QueryAction model)]
          (t2/delete! model :id (:id row)))
        (reset-base!)))))

(defn- insert-action!
  "Inserts and commits a query action that runs `sql`, with the columns `row`, through `insert!`."
  [insert! row sql]
  (let [action (insert! :model/Action (merge {:type :query :creator_id (mt/user->id :rasta)} row))]
    (insert! :model/QueryAction {:action_id     (:id action)
                                 :dataset_query (lib/native-query (mt/metadata-provider) sql)})
    action))

(defn- paths
  "The paths of the action and collection files of the data actions area in `commit`."
  [s commit]
  (into (sorted-set) (filter #(re-find #"^actions/" %)) (keys (store/read-tree s commit))))

(def ^:private none {:created #{} :deleted #{} :updated #{}})

(deftest push-of-actions-test
  (testing (str "a push writes the actions with no model to the data actions area, and follows their edits, archives "
                "and unarchives; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert!]
       (let [refunds  (insert! :model/Collection {:name "lb Refunds" :namespace "data-actions" :location "/"})
             root     (insert-action! insert! {:name "lb Refund order"} "UPDATE venues SET name = 'x'")
             _folder  (insert-action! insert! {:name "lb Refund all" :collection_id (:id refunds)}
                                      "UPDATE venues SET name = 'y'")
             _trashed (insert-action! insert! {:name "lb Old refund" :archived true} "UPDATE venues SET name = 'z'")
             inst     (app-db/app-db-instance)]
         (with-remote [_repo s]
           (let [{:keys [result commit]} (ptu/push! inst s)]
             (is (= :pushed result))
             (testing "the commit holds the live actions and their collection, and no archived action"
               (is (= #{"actions/lb_refund_order.action.yaml" "actions/lb_refunds/_collection.yaml"
                        "actions/lb_refunds/lb_refund_all.action.yaml"}
                      (paths s commit))))
             (is (= none (ptu/local-changes inst))))
           (testing "an edit of the query is a local update, and the next push writes it"
             (t2/update! :model/QueryAction (:id root) {:dataset_query (lib/native-query (mt/metadata-provider)
                                                                                         "UPDATE venues SET name = 'w'")})
             (is (= (assoc none :updated #{(:entity_id root)}) (ptu/local-changes inst)))
             (let [{:keys [result commit]} (ptu/push! inst s)]
               (is (= :pushed result))
               (is (= "UPDATE venues SET name = 'w'"
                      (get-in (ptu/commit-snapshot s commit) [(:entity_id root) :attrs :dataset_query :stages 0 :native])))))
           (testing "an archived action leaves the next commit, and an unarchived one comes back"
             (t2/update! :model/Action (:id root) {:archived true})
             (is (= (assoc none :deleted #{(:entity_id root)}) (ptu/local-changes inst)))
             (let [{:keys [commit]} (ptu/push! inst s)]
               (is (not (contains? (paths s commit) "actions/lb_refund_order.action.yaml"))))
             (t2/update! :model/Action (:id root) {:archived false})
             (let [{:keys [commit]} (ptu/push! inst s)]
               (is (contains? (paths s commit) "actions/lb_refund_order.action.yaml"))
               (is (= none (ptu/local-changes inst)))))))))))

(deftest pull-of-actions-test
  (testing (str "a pull creates an action, and trashes a removed one, which a dashboard outside the Library keeps as "
                "its button and the pull reports; app DB " (mdb/db-type))
    (do-with-committed-content!
     (fn [insert!]
       (let [refunds   (insert! :model/Collection {:name "lb Refunds" :namespace "data-actions" :location "/"})
             removed   (insert-action! insert! {:name "lb Refund order"} "UPDATE venues SET name = 'x'")
             kept      (insert-action! insert! {:name "lb Refund all" :collection_id (:id refunds)}
                                       "UPDATE venues SET name = 'y'")
             dashboard (insert! :model/Dashboard {:name "lb Outside dashboard" :creator_id (mt/user->id :rasta)
                                                  :parameters []})
             dashcard  (insert! :model/DashboardCard {:dashboard_id (:id dashboard) :action_id (:id removed)
                                                      :row 0 :col 0 :size_x 4 :size_y 4})
             inst      (app-db/app-db-instance)]
         (with-remote [repo s]
           (let [{:keys [commit]} (ptu/push! inst s)
                 base             (ptu/commit-snapshot s commit)
                 remote           (-> base
                                      (dissoc (:entity_id removed))
                                      (assoc created-id (assoc (get base (:entity_id kept)) :name "lb Refund new")))
                 head             (pltu/commit-snapshot! repo ptu/branch [commit] remote)
                 {:keys [result trashed-in-use]} (pull/pull! inst s ptu/branch)]
             (is (= :pulled result))
             (testing "the app DB holds the head, and the base is the head"
               (is (= remote (select-keys (:snapshot (instance/read-snapshot inst)) (keys remote))))
               (is (= head (instance/base inst))))
             (testing "the removed action is in the trash; the outside dashboard keeps its button, and the pull names
                       it"
               (is (true? (t2/select-one-fn :archived :model/Action (:id removed))))
               (is (= (:id removed) (t2/select-one-fn :action_id :model/DashboardCard (:id dashcard))))
               (is (= {(:entity_id removed) [{:kind :dashboard :id (:entity_id dashboard) :name "lb Outside dashboard"}]}
                      trashed-in-use)))
             (testing "the new action is in the collection of the head"
               (is (= (:id refunds) (t2/select-one-fn :collection_id :model/Action :entity_id created-id)))))))))))
