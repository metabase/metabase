(ns metabase.transforms.models.transform-tag-test
  "Tests for the transform tag model."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.transforms.models.transform-tag :as transform-tag]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]))

(def ^:private per-row-update-growth
  "The statements an update of one more row adds: the model's before-update SELECT and its UPDATE, 2 for each of the 4
  rows between 2 and 6."
  8)


(comment transform-tag/keep-me)

(deftest initial-tags-translated-on-select
  (doseq [[type name] [["hourly"  (i18n/trs "hourly")]
                       ["daily"   (i18n/trs "daily")]
                       ["weekly"  (i18n/trs "weekly")]
                       ["monthly" (i18n/trs "monthly")]]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (is (= name
             (str (:name (t2/select-one :model/TransformTag :id (:id tag)))))))))

(deftest initial-tags-translated-on-update
  (doseq [type ["hourly" "daily" "weekly" "monthly"]]
    (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
      (transform-tag/update-transform-tags! [{:id (:id tag) :name "default2"}])
      (is (= "default2"
             (:name (t2/select-one :model/TransformTag :id (:id tag)))))
      (is (nil? (t2/select-one-fn :built_in_type :model/TransformTag :id (:id tag)))))))

(deftest initial-tags-kept-on-noop-update-test
  (testing "An update that only touches the timestamp leaves a tag built in"
    (doseq [type ["hourly" "daily" "weekly" "monthly"]]
      (mt/with-temp [:model/TransformTag tag {:name "default" :built_in_type type}]
        (transform-tag/update-transform-tags! [{:id (:id tag) :updated_at (mi/current-timestamp)}])
        (is (= type (t2/select-one-fn :built_in_type :model/TransformTag :id (:id tag))))))))

(deftest data-analyst-tag-access-follows-the-advanced-permissions-feature-test
  (testing "a data analyst reads, writes and creates transform tags only while advanced-permissions is available"
    (mt/with-temp [:model/TransformTag tag {:name "gated"}]
      (mt/with-data-analyst-role! (mt/user->id :rasta)
        (mt/with-current-user (mt/user->id :rasta)
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformTag :id 1) :can_read)))
             (is (mi/can-write? (t2/hydrate tag :can_write)))
             (is (mi/can-create? :model/TransformTag {}))))
          (testing "and none once the feature is gone"
            (mt/with-premium-features #{}
              (is (not (mi/can-read? (t2/hydrate (t2/select-one :model/TransformTag :id 1) :can_read))))
              (is (not (mi/can-write? (t2/hydrate tag :can_write))))
              (is (not (mi/can-create? :model/TransformTag {})))))))
      (testing "a superuser is unaffected"
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-premium-features #{}
            (is (mi/can-read? (t2/hydrate (t2/select-one :model/TransformTag :id 1) :can_read)))
            (is (mi/can-write? (t2/hydrate tag :can_write)))
            (is (mi/can-create? :model/TransformTag {}))))))))

(deftest tag-names-are-unique-test
  (mt/with-temp [:model/TransformTag tag {}]
    (is (thrown? Exception (t2/with-transaction [_conn]
                             (t2/insert! :model/TransformTag {:name (:name tag)}))))
    (mt/with-temp [:model/TransformTag other {}]
      (is (thrown? Exception (t2/with-transaction [_conn]
                               (t2/update! :model/TransformTag :id (:id other) {:name (:name tag)})))))))

(deftest tag-check-test
  (mt/with-temp [:model/TransformTag tag {}]
    (testing "a superuser may create and update tags"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (some? (api/create-check :model/TransformTag {:name "new"})))
        (is (some? (api/update-check tag {:name "renamed"})))))
    (testing "a user with no data analyst access may not"
      (mt/with-current-user (mt/user->id :rasta)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/create-check :model/TransformTag {:name "new"})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                              (api/update-check tag {:name "renamed"})))))))

(deftest tag-writable-by-tag-id-test
  (mt/with-temp [:model/TransformTag tag {}]
    (testing "a tag no transform carries is writable"
      (is (= {(:id tag) true} (transform-tag/tag-id->writable #{(:id tag)}))))
    (testing "no tags answer an empty map"
      (is (= {} (transform-tag/tag-id->writable #{}))))))

(defn- tag-names
  "`n` distinct tag names."
  [n]
  (vec (repeatedly n #(str "tag " (mt/random-name)))))

(deftest write-functions-refuse-taken-names-test
  (mt/with-temp [:model/TransformTag tag {}
                 :model/TransformTag other {}]
    (testing "creating a tag with a taken name fails and writes nothing"
      (is (thrown? Exception (transform-tag/create-transform-tags! [{:name (:name tag)}]))))
    (testing "creating two tags with one name fails and writes nothing"
      (let [tag-name (str "tag " (mt/random-name))]
        (is (thrown? Exception (transform-tag/create-transform-tags! [{:name tag-name} {:name tag-name}])))
        (is (zero? (t2/count :model/TransformTag :name tag-name)))))
    (testing "renaming a tag to a taken name fails, and to its own name does not"
      (is (thrown? Exception (transform-tag/update-transform-tags! [{:id (:id other) :name (:name tag)}])))
      (is (nil? (transform-tag/update-transform-tags! [{:id (:id other) :name (:name other)}]))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [created (atom [])
        count-of (fn [n]
                   (events.tu/statement-count! (fn [] (swap! created into (map :id (transform-tag/create-transform-tags! (mapv #(hash-map :name %) (tag-names n))))))))]
    (try
      (testing "creating tags"
        (count-of 1)
        (is (= (count-of 2) (count-of 6))))
      (testing "deleting tags"
        (let [delete! (fn [ids]
                        (events.tu/statement-count! (fn [] (transform-tag/delete-transform-tags! ids))))
              ids     @created]
          (delete! (take 1 ids))
          (is (= (delete! (take 2 (drop 1 ids))) (delete! (take 6 (drop 3 ids)))))))
      (finally
        (t2/delete! :model/TransformTag :id [:in @created])))))

(deftest create-transform-tags-with-different-key-sets-test
  (mt/with-model-cleanup [:model/TransformTag]
    (let [[plain built-in] (transform-tag/create-transform-tags! [{:name "Plain"}
                                                                  {:name "Built in" :built_in_type "daily"}])]
      (is (nil? (t2/select-one-fn :built_in_type :model/TransformTag :id (:id plain))))
      (is (= "daily" (t2/select-one-fn :built_in_type :model/TransformTag :id (:id built-in)))))))

(deftest update-statement-counts-do-not-grow-with-mixed-state-rows-test
  (mt/with-model-cleanup [:model/TransformTag]
    (let [tags    (fn [built-in custom]
                    (let [ids (mapv :id (transform-tag/create-transform-tags! (mapv #(hash-map :name %) (tag-names (+ built-in custom)))))]
                      (t2/update! :model/TransformTag :id [:in (take built-in ids)] {:built_in_type "hourly"})
                      ids))
          counted (fn [built-in custom]
                    (let [ids (tags built-in custom)]
                      (events.tu/statement-count!
                       #(transform-tag/update-transform-tags! (mapv (fn [row-id] (assoc {:built_in_type nil} :id row-id)) ids)))))]
      (counted 1 0)
      (is (<= (counted 3 3) (+ (counted 1 1) per-row-update-growth))))))

(deftest update-transform-tags-with-different-rows-test
  (mt/with-model-cleanup [:model/TransformTag]
    (let [ids      (mapv :id (transform-tag/create-transform-tags! (mapv #(hash-map :name %) (tag-names 10))))
          update!  (fn [ids]
                     (let [write! (fn [] (transform-tag/update-transform-tags! (mapv #(hash-map :id % :name (str "Renamed " % " " (mt/random-name))) ids)))]
                       {:statements (events.tu/statement-count! write!)
                        :events     (events.tu/published-topics! write!)}))
          _warm    (update! (take 1 ids))
          small    (update! (take 2 (drop 1 ids)))
          large    (update! (take 6 (drop 3 ids)))]
      (testing "one update event for all rows whatever their number"
        (is (= [:event/transform-tag-update] (:events small)))
        (is (= (:events small) (:events large))))
      (testing "rows that all differ cost at most one UPDATE and one before-update read for each extra row"
        (is (<= (- (:statements large) (:statements small)) (* 2 4)))))))

(defn- do-with-built-in-names-freed!
  "Calls `thunk` with the names of the built-in TransformTags set aside, since a tag made custom takes its translated name,
  and restores them."
  [thunk]
  (let [stored (t2/query {:select [:id :name] :from [:transform_tag] :where [:not= :built_in_type nil]})]
    (try
      (run! (fn [{:keys [id]}] (t2/query-one {:update :transform_tag :set {:name (str "set-aside " id)} :where [:= :id id]})) stored)
      (thunk)
      (finally
        (run! (fn [{:keys [id name]}] (t2/query-one {:update :transform_tag :set {:name name} :where [:= :id id]})) stored)))))

(defmacro ^:private with-built-in-names-freed [& body]
  `(do-with-built-in-names-freed! (fn [] ~@body)))

(deftest plain-update-makes-built-in-tags-custom-test
  (with-built-in-names-freed
    (mt/with-model-cleanup [:model/TransformTag]
      (let [[hourly daily custom] (mapv :id (transform-tag/create-transform-tags! (mapv #(hash-map :name %) (tag-names 3))))
            custom-name           (t2/select-one-fn :name :model/TransformTag :id custom)]
        (t2/update! :model/TransformTag :id hourly {:built_in_type "hourly"})
        (t2/update! :model/TransformTag :id daily {:built_in_type "daily"})
        (testing "a plain update of several rows holding other values stores a value for each row"
          (t2/update! :model/TransformTag :id [:in [hourly daily custom]] {:created_at (mi/current-timestamp)})
          (is (= [[(str (i18n/trs "hourly")) nil] [(str (i18n/trs "daily")) nil] [custom-name nil]]
                 (mapv (fn [id] (let [tag (t2/select-one :model/TransformTag :id id)] [(str (:name tag)) (:built_in_type tag)]))
                       [hourly daily custom])))
          (t2/delete! :model/TransformTag :id [:in [hourly daily custom]]))
        (testing "the statements of an update over rows in mixed state do not grow with the rows"
          (let [counted (fn [built-in custom-count]
                          (let [ids (mapv :id (transform-tag/create-transform-tags! (mapv #(hash-map :name %) (tag-names (+ built-in custom-count)))))]
                            (doseq [[id built-in-type] (map vector (take built-in ids) ["hourly" "daily" "weekly"])]
                              (t2/update! :model/TransformTag :id id {:built_in_type built-in-type}))
                            (u/prog1 (events.tu/statement-count!
                                      #(transform-tag/update-transform-tags! (mapv (fn [row-id] (assoc {:created_at (mi/current-timestamp)} :id row-id)) ids)))
                              (t2/delete! :model/TransformTag :id [:in ids]))))]
            (counted 1 0)
            (is (<= (counted 3 3) (+ (counted 1 1) per-row-update-growth)))))))))

(deftest built-in-tag-update-event-carries-real-values-test
  (with-built-in-names-freed
    (mt/with-model-cleanup [:model/TransformTag]
      (let [id        (:id (first (transform-tag/create-transform-tags! [{:name (str "tag " (mt/random-name))}])))
            published (atom [])]
        (t2/update! :model/TransformTag :id id {:built_in_type "monthly"})
        (with-redefs [events/publish-event! (fn [_topic event] (swap! published conj event))]
          (transform-tag/update-transform-tags! [{:id id :created_at (mi/current-timestamp)}]))
        (let [object (-> @published first :changes first :object)]
          (is (= (str (i18n/trs "monthly")) (str (:name object))))
          (is (nil? (:built_in_type object)))
          (is (not-any? vector? (vals object))))))))
