(ns metabase-enterprise.library-branching.instance.table-item-test
  "The instance side of the kinds that live on a published table, segments and measures: the content that a read
  gives, the local changes that a content difference shows, `write!`, `current` and `trash!`, and the trash of their
  table. Each test writes in a transaction that rolls back."
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
   [metabase-enterprise.library-branching.instance.save-rule :as save-rule]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.collections.core :as collections]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

;;; ---------------------------------------------------- Helpers ---------------------------------------------------

(defn- store [kind] (get app-db/kind-stores kind))

(defn- write!
  [kind id item]
  (instance/write! (store kind) id (assoc item :refs (format.kinds/refs kind id (:attrs item)))))

(defn- current [kind id] (instance/current (store kind) id))

(defn- content [kind id] (:content (current kind id)))

(defn- trash! [kind id] (instance/trash! (store kind) id))

(defn- refusal
  "The reason of the ::instance/refused that `(f)` throws, or nil when it throws none."
  [f]
  (try
    (f)
    nil
    (catch clojure.lang.ExceptionInfo e
      (when (= ::instance/refused (:type (ex-data e)))
        (:reason (ex-data e))))))

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- db-name [] (t2/select-one-fn :name :model/Database (mt/id)))

(defn- table-key
  [table]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(db-name) schema name]))

(defn- field-key
  [table field]
  (conj (table-key table) (t2/select-one-fn :name :model/Field (mt/id table field))))

(defn- mp [] (mt/metadata-provider))

(defn- table-query [table] (lib/query (mp) (lib.metadata/table (mp) (mt/id table))))

(defn- field [table field-name] (lib.metadata/field (mp) (mt/id table field-name)))

(defn- below
  "A segment definition: `field` of `table` below `n`."
  [table field-name n]
  (lib/filter (table-query table) (lib/< (field table field-name) n)))

(defn- sum-of
  "A measure definition: the sum of `field` of `table`."
  [table field-name]
  (lib/aggregate (table-query table) (lib/sum (field table field-name))))

(defn- read-item [id] (get (app-db/read-current) id))

(defn- published
  "The user settings row that publishes `table` into `collection`."
  [table collection]
  {:table_id (mt/id table) :is_published true :collection_id (:id collection)})

(def ^:private none {:created #{} :deleted #{} :updated #{}})

;;; ---------------------------------------------------- Content ---------------------------------------------------

(deftest segment-content-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                   :model/Segment           s {:table_id           (mt/id :venues)
                                               :name               "Cheap places"
                                               :description        "Price level 1."
                                               :caveats            "Old prices."
                                               :points_of_interest nil
                                               :definition         (below :venues :price 2)}]
      (testing "a segment: its table as the place, the definition by natural keys, and the references of the
                definition"
        (let [{:keys [attrs] :as item} (read-item (:entity_id s))]
          (is (= {:kind  :segment
                  :name  "Cheap places"
                  :place (table-key :venues)
                  :refs  #{[:database [:env [(db-name)]]]
                           [:source-table [:env (table-key :venues)]]
                           [:field [:env (field-key :venues :price)]]}}
                 (dissoc item :attrs)))
          (is (= #{:description :caveats :definition} (set (keys attrs))))
          (is (= (table-key :venues) (get-in attrs [:definition :stages 0 :source-table])))
          (is (mr/validate (codec/schema (first (filter #(= :segment (codec/kind %)) format.kinds/codecs))) item))))
      (testing "the bookkeeping columns are not content"
        (let [before (read-item (:entity_id s))]
          (t2/update! :model/Segment (:id s) {:created_at (java.time.OffsetDateTime/now)})
          (is (= before (read-item (:entity_id s)))))))))

(deftest measure-content-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                   :model/Measure           m {:table_id    (mt/id :venues)
                                               :name        "Price total"
                                               :description "The sum of price levels."
                                               :definition  (sum-of :venues :price)}]
      (let [item (read-item (:entity_id m))]
        (testing "a measure: its table as the place, the definition by natural keys"
          (is (= {:kind  :measure
                  :name  "Price total"
                  :place (table-key :venues)
                  :refs  #{[:database [:env [(db-name)]]]
                           [:source-table [:env (table-key :venues)]]
                           [:field [:env (field-key :venues :price)]]}}
                 (dissoc item :attrs)))
          (is (= #{:description :definition} (set (keys (:attrs item))))))
        (testing "the dimensions of a measure are not content"
          (t2/update! :model/Measure (:id m) {:dimensions [{:id (str (random-uuid)) :name "price"}]})
          (is (= item (read-item (:entity_id m)))))))))

(deftest items-fit-the-format-test
  (testing "every segment and measure that the instance reads fits the schema of its kind, and survives encode and
            decode"
    (collections.tu/with-library [{:keys [data]}]
      (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                     :model/Segment           s {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                     :model/Measure           _ {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}
                     :model/Measure           _ {:table_id   (mt/id :venues)
                                                 :name       "Cheap total"
                                                 :definition (lib/aggregate (table-query :venues)
                                                                            (lib/sum-where (field :venues :price)
                                                                                           (lib.metadata/segment (mp) (:id s))))}]
        (let [by-kind (codec/by-kind format.kinds/codecs)
              s       (into {} (filter (comp #{:segment :measure} :kind val)) (app-db/read-current))]
          (is (= {:segment 1 :measure 2} (frequencies (map :kind (vals s)))))
          (doseq [[id item] s
                  :let [c (get by-kind (:kind item))]]
            (testing (pr-str id)
              (is (mr/validate (codec/schema c) item))
              (is (= [id item] (codec/decode c (codec/read-yaml (writer/write-yaml (codec/encode c id item)))))))))))))

;;; ------------------------------------------------------ Scope ------------------------------------------------------

(deftest scope-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/Collection        outside   {:name "Not the Library" :type "library-data" :location "/"}
                   :model/TableUserSettings _         (published :venues data)
                   :model/TableUserSettings _         (published :checkins outside)
                   :model/Segment           in        {:table_id (mt/id :venues) :name "In" :definition (below :venues :price 2)}
                   :model/Segment           archived  {:table_id   (mt/id :venues) :name "Archived" :archived true
                                                       :definition (below :venues :price 3)}
                   :model/Segment           elsewhere {:table_id   (mt/id :checkins) :name "Published elsewhere"
                                                       :definition (below :checkins :user_id 3)}
                   :model/Segment           private   {:table_id   (mt/id :users) :name "On an unpublished table"
                                                       :definition (below :users :id 3)}
                   :model/Measure           m-in      {:table_id (mt/id :venues) :name "In" :definition (sum-of :venues :price)}
                   :model/Measure           m-archived {:table_id   (mt/id :venues) :name "Archived" :archived true
                                                        :definition (sum-of :venues :price)}
                   :model/Measure           m-private {:table_id   (mt/id :users) :name "On an unpublished table"
                                                       :definition (sum-of :users :id)}]
      (testing "a segment or a measure is in scope iff it is not archived and its table is published into the Library"
        (is (= #{(:entity_id in)} (:segment (scope/scope-ids scope/roots [:segment]))))
        (is (= #{(:entity_id m-in)} (:measure (scope/scope-ids scope/roots [:measure]))))
        (is (= {:segment 1 :measure 1} (select-keys (scope/scope-count) [:segment :measure])))
        (is (every? (complement (app-db/read-current))
                    (map :entity_id [archived elsewhere private m-archived m-private])))))))

;;; ------------------------------------------------- Local changes ------------------------------------------------

(deftest local-changes-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/Collection        outside {:name "Not the Library" :type "library-data" :location "/"}
                   :model/TableUserSettings _       (published :venues data)
                   :model/TableUserSettings _       (published :checkins outside)
                   :model/Segment           s       {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                   :model/Measure           m       {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}]
      (let [base  (app-db/read-current)
            local #(diff/diff base (app-db/read-current))]
        (testing "a save of a segment or a measure that changes nothing is no local change"
          (t2/update! :model/Segment (:id s) {:name "Cheap" :definition (below :venues :price 2)})
          (t2/update! :model/Measure (:id m) {:name "Total" :definition (sum-of :venues :price)})
          (is (= none (local))))
        (testing "a new segment or measure on a published Library table is a local create"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (let [s2 (t2/insert-returning-instance! :model/Segment {:table_id   (mt/id :venues) :name "New"
                                                                    :creator_id (mt/user->id :crowberto)
                                                                    :definition (below :venues :price 4)})
                  m2 (t2/insert-returning-instance! :model/Measure {:table_id   (mt/id :venues) :name "New"
                                                                    :creator_id (mt/user->id :crowberto)
                                                                    :definition (sum-of :venues :latitude)})]
              (is (= (assoc none :created #{(:entity_id s2) (:entity_id m2)}) (local))))))
        (testing "an update of the definition or of an attribute is a local update"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/Segment (:id s) {:definition (below :venues :price 3)})
            (t2/update! :model/Measure (:id m) {:description "Changed"})
            (is (= (assoc none :updated #{(:entity_id s) (:entity_id m)}) (local)))))
        (testing "an archived segment or measure is a local delete"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/Segment (:id s) {:archived true})
            (t2/update! :model/Measure (:id m) {:archived true})
            (is (= (assoc none :deleted #{(:entity_id s) (:entity_id m)}) (local)))))
        (testing "a deleted segment or measure is a local delete"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/delete! :model/Segment (:id s))
            (t2/delete! :model/Measure (:id m))
            (is (= (assoc none :deleted #{(:entity_id s) (:entity_id m)}) (local)))))
        (testing "an unpublished table is a local delete, with its segments and measures"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/update! :model/TableUserSettings (mt/id :venues) {:is_published false})
            (is (= (assoc none :deleted #{(table-key :venues) (:entity_id s) (:entity_id m)}) (local)))))
        (testing "a segment on a table outside the Library, or on an unpublished table, is no local change"
          (t2/with-transaction [_ nil {:rollback-only true}]
            (t2/insert! :model/Segment {:table_id (mt/id :checkins) :name "Outside" :creator_id (mt/user->id :crowberto)
                                        :definition (below :checkins :user_id 2)})
            (t2/insert! :model/Segment {:table_id (mt/id :users) :name "Unpublished" :creator_id (mt/user->id :crowberto)
                                        :definition (below :users :id 2)})
            (is (= none (local)))))
        (testing "after the rollbacks, nothing changed"
          (is (= none (local))))))))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(def ^:private new-segment-id "lbWriteSegment0000001")
(def ^:private new-measure-id "lbWriteMeasure0000001")

(deftest write-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                   :model/TableUserSettings _ (published :checkins data)
                   :model/Segment           s {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                   :model/Segment           c {:table_id (mt/id :checkins) :name "Early" :definition (below :checkins :user_id 3)}
                   :model/Measure           m {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (doseq [[kind id template] [[:segment new-segment-id (read-item (:entity_id s))]
                                    [:measure new-measure-id (read-item (:entity_id m))]]]
          (testing (str kind)
            (let [model (if (= :segment kind) :model/Segment :model/Measure)
                  item  (-> template (assoc :name "Written") (assoc-in [:attrs :description] "Written by sync."))]
              (testing "a write of a new identity creates the item on its table, and current returns the content"
                (is (= {:state :absent} (current kind id)))
                (write! kind id item)
                (is (= {:state :live :content (assoc item :refs (format.kinds/refs kind id (:attrs item)))}
                       (current kind id)))
                (is (= {:table_id (mt/id :venues) :archived false}
                       (t2/select-one [model :table_id :archived] :entity_id id))))
              (let [row-id (t2/select-one-pk model :entity_id id)]
                (testing "an absent attribute goes to its default"
                  (write! kind id (update item :attrs dissoc :description))
                  (is (nil? (t2/select-one-fn :description model row-id)))
                  (is (= (dissoc (update item :attrs dissoc :description) :refs) (dissoc (content kind id) :refs))))
                (testing "a write of the current content changes no row"
                  (let [before (t2/select-one (t2/table-name model) row-id)]
                    (instance/write! (store kind) id (content kind id))
                    (is (= before (t2/select-one (t2/table-name model) row-id)))))
                (testing "trash! moves the item to the trash, and a write of the trashed identity restores the same row"
                  (let [live (content kind id)]
                    (trash! kind id)
                    (is (= {:state :trashed :content live} (current kind id))))
                  (is (t2/select-one-fn :archived model row-id))
                  (is (nil? (trash! kind id)) "a trash of an item in the trash does nothing")
                  (write! kind id item)
                  (is (= (:attrs item) (:attrs (content kind id))))
                  (is (= row-id (t2/select-one-pk model :entity_id id)))
                  (is (false? (t2/select-one-fn :archived model row-id))))))))
        (testing "a write of a segment on another table moves it to that table"
          (let [moved (assoc (read-item (:entity_id c)) :name "Moved")]
            (write! :segment new-segment-id moved)
            (is (= (table-key :checkins) (:place (content :segment new-segment-id))))
            (is (= (mt/id :checkins) (t2/select-one-fn :table_id :model/Segment :entity_id new-segment-id)))))
        (testing "a trash of an identity that no row has does nothing"
          (is (nil? (trash! :segment "lbNoSuchSegment000001")))
          (is (nil? (trash! :measure "lbNoSuchMeasure000001"))))))))

(deftest refused-writes-write-nothing-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/Collection        outside {:name "Not the Library" :type "library-data" :location "/"}
                   :model/TableUserSettings _       (published :venues data)
                   :model/TableUserSettings _       (published :checkins outside)
                   :model/Segment           s       {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                   :model/Measure           lm      {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}
                   :model/Segment           theirs  {:table_id   (mt/id :checkins) :name "Published elsewhere"
                                                     :definition (below :checkins :user_id 2)}
                   :model/Segment           private {:table_id   (mt/id :users) :name "Mine"
                                                     :definition (below :users :id 2)}
                   :model/Measure           mine    {:table_id (mt/id :users) :name "Mine" :definition (sum-of :users :id)}]
      (let [item     (read-item (:entity_id s))
            on-users (fn [d] (-> item
                                 (assoc :place (table-key :users))
                                 (assoc-in [:attrs :definition] d)))
            users-d  (-> (:attrs item) :definition (assoc-in [:stages 0 :source-table] (table-key :users)))
            rows     #(vector (t2/select :segment {:order-by [:id]}) (t2/select :measure {:order-by [:id]}))
            before   (rows)]
        (testing "content that is not an item of the kind"
          (is (= :invalid-content (refusal #(write! :segment new-segment-id (assoc item :place nil)))))
          (is (= :invalid-content (refusal #(write! :segment new-segment-id (assoc item :place (table-key :users))))))
          (is (= :invalid-content (refusal #(instance/write! (store :segment) new-segment-id (assoc item :refs #{})))))
          (is (= :invalid-content (refusal #(write! :measure new-measure-id (assoc item :kind :measure))))))
        (testing "a table that is not published into the Library"
          (is (= :place (refusal #(write! :segment new-segment-id (on-users users-d))))))
        (testing "a table that this instance does not have"
          (let [k [(db-name) "PUBLIC" "NO_SUCH_TABLE"]]
            (is (= :environment
                   (refusal #(write! :segment new-segment-id
                                     (-> item (assoc :place k) (assoc-in [:attrs :definition :stages 0 :source-table] k))))))))
        (testing "a row outside the Library tree with the identity: a segment or a measure of an unpublished table, or
                  of a table published outside the Library"
          (is (= :outside-library (refusal #(write! :segment (:entity_id private) item))))
          (is (= :outside-library (refusal #(write! :segment (:entity_id theirs) item))))
          (is (= :outside-library (refusal #(write! :measure (:entity_id mine) (read-item (:entity_id lm))))))
          (is (= :outside-library (refusal #(trash! :segment (:entity_id private))))))
        (is (= before (rows)))))))

;;; ----------------------------------------------------- Trash ----------------------------------------------------

(deftest trash-keeps-outside-content-working-test
  (testing "after trash! of a Library segment or measure, a question outside the Library that uses it still runs"
    (collections.tu/with-library [{:keys [data]}]
      (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                     :model/Segment           s {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                     :model/Measure           m {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}]
        (let [query    (-> (table-query :venues)
                           (lib/filter (lib.metadata/segment (mp) (:id s)))
                           (lib/aggregate (lib.metadata/measure (mp) (:id m))))
              run      #(-> (qp/process-query query) :data :rows)
              expected (run)]
          (is (seq expected))
          (trash! :segment (:entity_id s))
          (trash! :measure (:entity_id m))
          (is (= :trashed (:state (current :segment (:entity_id s)))))
          (is (= :trashed (:state (current :measure (:entity_id m)))))
          (is (= expected (run))))))))

(deftest trashed-segment-or-measure-in-use-test
  (testing "a trashed segment or measure that a question outside the Library uses is in use, with that question; a
            Library metric and a question in the trash are not users"
    (collections.tu/with-library [{:keys [data metrics]}]
      (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                     :model/Segment           s {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                     :model/Segment           unused {:table_id   (mt/id :venues) :name "Unused"
                                                      :definition (below :venues :price 3)}
                     :model/Measure           m {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}]
        (let [query (-> (table-query :venues)
                        (lib/filter (lib.metadata/segment (mp) (:id s)))
                        (lib/aggregate (lib.metadata/measure (mp) (:id m))))]
          (mt/with-temp [:model/Card outside {:name "Outside question" :type :question :dataset_query query}
                         :model/Card _       {:name "Library metric" :type :metric :collection_id (:id metrics)
                                              :display :scalar :dataset_query query}
                         :model/Card _       {:name "Trashed question" :type :question :archived true
                                              :dataset_query query}]
            (t2/with-transaction [_ nil {:rollback-only true}]
              (let [trashed (for [[kind item] [[:segment s] [:segment unused] [:measure m]]]
                              {:id (:entity_id item) :kind kind})
                    users   [{:kind :card :id (:entity_id outside) :name "Outside question"}]]
                (doseq [{:keys [id kind]} trashed]
                  (trash! kind id))
                (is (= {(:entity_id s) users (:entity_id m) users}
                       (in-use/trashed-in-use trashed)))))))))))

(deftest trash-of-the-table-test
  (collections.tu/with-library [{:keys [data]}]
    (mt/with-temp [:model/Collection        sub {:name     "Places"
                                                 :type     collections/library-data-collection-type
                                                 :location (children-location data)}
                   :model/TableUserSettings _   (published :venues data)
                   :model/TableUserSettings _   (published :checkins sub)
                   :model/Segment           s   {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                   :model/Measure           m   {:table_id (mt/id :venues) :name "Total" :definition (sum-of :venues :price)}
                   :model/Segment           cs  {:table_id   (mt/id :checkins) :name "Early"
                                                 :definition (below :checkins :user_id 3)}
                   :model/Measure           old {:table_id   (mt/id :venues) :name "Archived before" :archived true
                                                 :definition (sum-of :venues :price)}]
      (t2/with-transaction [_ nil {:rollback-only true}]
        (let [before (app-db/read-current)
              venues (table-key :venues)
              ids    (map :entity_id [s m])]
          (testing (str "trash! of a published table moves its segments and measures to the trash; the table is no "
                        "longer published, so their rows are outside the Library tree")
            (trash! :published-table venues)
            (is (= (repeat 3 {:state :absent}) [(current :published-table venues) (current :segment (:entity_id s))
                                                (current :measure (:entity_id m))]))
            (is (every? true? (map #(t2/select-one-fn :archived %1 :entity_id %2)
                                   [:model/Segment :model/Measure] ids))))
          (testing "a write of the trashed table restores it alone"
            (write! :published-table venues (get before venues))
            (is (= {:state :live :content (get before venues)} (current :published-table venues)))
            (is (= [{:state :trashed :content (get before (:entity_id s))}
                    {:state :trashed :content (get before (:entity_id m))}]
                   [(current :segment (:entity_id s)) (current :measure (:entity_id m))])))
          (testing "a write of each segment and measure restores it; one archived before stays archived"
            (write! :segment (:entity_id s) (get before (:entity_id s)))
            (write! :measure (:entity_id m) (get before (:entity_id m)))
            (is (= (select-keys before (cons venues ids)) (select-keys (app-db/read-current) (cons venues ids))))
            (is (true? (t2/select-one-fn :archived :model/Measure (:id old)))))
          (testing (str "trash! of a collection moves the segments of its tables to the trash; the trash unpublishes "
                        "the tables, so their rows are outside the Library tree")
            (trash! :collection (:entity_id sub))
            (is (= {:state :absent} (current :segment (:entity_id cs))))
            (is (true? (t2/select-one-fn :archived :model/Segment (:id cs))))
            (is (= :live (:state (current :segment (:entity_id s)))) "a segment of a table in another collection stays")))))))

;;; ---------------------------------------------------- Save rule ---------------------------------------------------

(deftest save-rule-test
  (testing "a trash of a segment that a Library measure uses is refused, with the measure named"
    (collections.tu/with-library [{:keys [data]}]
      (mt/with-temp [:model/TableUserSettings _ (published :venues data)
                     :model/Segment           s {:table_id (mt/id :venues) :name "Cheap" :definition (below :venues :price 2)}
                     :model/Measure           m {:table_id   (mt/id :venues)
                                                 :name       "Cheap total"
                                                 :definition (lib/aggregate (table-query :venues)
                                                                            (lib/sum-where (field :venues :price)
                                                                                           (lib.metadata/segment (mp) (:id s))))}]
        (is (contains? (:refs (read-item (:entity_id m))) [:segment (:entity_id s)]))
        (let [e (try
                  (save-rule/do-with-save-rule #(t2/update! :model/Segment (:id s) {:archived true}))
                  nil
                  (catch clojure.lang.ExceptionInfo e e))]
          (is (= [{:user (:entity_id m) :user-kind :measure :user-name "Cheap total" :role :segment
                   :target (:entity_id s)}]
                 (:findings (ex-data e))))
          (is (false? (t2/select-one-fn :archived :model/Segment (:id s)))))))))
