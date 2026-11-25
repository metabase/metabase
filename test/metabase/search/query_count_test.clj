(ns metabase.search.query-count-test
  "The number of app-DB queries a search runs does not grow with the number of results it returns."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.indexed-entities.models.model-index :as model-index]
   [metabase.permissions.core :as perms]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(use-fixtures :each (fn [thunk] (binding [search.ingestion/*force-sync* true]
                                  (search.tu/with-appdb-search-if-available-otherwise-legacy (thunk)))))

(def ^:private batch-size
  "How many rows the batch search finds, against the single row of the solo search."
  10)

(defn- insert-rows
  "Returns a row factory, `(fn [collection names row-attrs])`, that inserts a `model` row per name. A row takes the
  `with-temp` defaults of `model`, then `(collection-attrs collection)`, then `row-attrs`, such as `{:archived true}`."
  ([model] (insert-rows model (constantly {})))
  ([model collection-attrs]
   (fn [collection names row-attrs]
     (doseq [n names]
       (t2/insert! model (merge (mt/with-temp-defaults model) (collection-attrs collection) row-attrs {:name n}))))))

(defn- insert-model!
  "Inserts a model (a Card of type `:model`) in `collection`, for the rows that belong to one, and returns it."
  [collection]
  (t2/insert-returning-instance! :model/Card (assoc (mt/with-temp-defaults :model/Card)
                                                    :collection_id (:id collection)
                                                    :type :model)))

(defn- in-collection
  "A `collection-attrs` function for [[insert-rows]] that puts the rows in the collection, on top of `attrs`."
  [attrs]
  (fn [collection] (assoc attrs :collection_id (:id collection))))

(def ^:private search-row-factories
  "Per search model, a function of the collection to put rows in, the names of the rows to make and the extra
  attributes of those rows. A factory that cannot use the attributes names that argument `_row-attrs`."
  {"collection"     (insert-rows :model/Collection (fn [c] {:location (collection/children-location c)}))
   "dashboard"      (insert-rows :model/Dashboard (in-collection {}))
   "card"           (insert-rows :model/Card (in-collection {:type :question}))
   "dataset"        (insert-rows :model/Card (in-collection {:type :model}))
   "metric"         (insert-rows :model/Card (in-collection {:type :metric}))
   "document"       (insert-rows :model/Document (in-collection {}))
   "exploration"    (insert-rows :model/Exploration)
   "segment"        (insert-rows :model/Segment (fn [_] {:table_id (mt/id :venues)}))
   "measure"        (insert-rows :model/Measure (fn [_] {:table_id (mt/id :venues)}))
   "table"          (insert-rows :model/Table (fn [_] {:db_id (mt/id)}))
   "database"       (insert-rows :model/Database)
   "action"         (fn [collection names row-attrs]
                      (let [model   (insert-model! collection)
                            action! (insert-rows :model/Action (fn [_] {:model_id (:id model), :type :query}))]
                        (action! collection names row-attrs)))
   "data-app"       (fn [_collection names _row-attrs]
                      (doseq [n names]
                        (let [defaults (mt/with-temp-defaults :model/DataApp)
                              app      (t2/insert-returning-instance! :model/DataApp (assoc defaults :name n))]
                          (perms/grant-collection-read-permissions! (perms/all-users-group)
                                                                    (:resource_collection_id app)))))
   "indexed-entity" (fn [collection names _row-attrs]
                      (let [model (insert-model! collection)
                            index (model-index/create (mt/$ids {:model-id   (:id model)
                                                                :pk-ref     $venues.id
                                                                :value-ref  $venues.name
                                                                :creator-id (mt/user->id :rasta)}))
                            values  (fn [] (t2/reducible-select :model/ModelIndexValue :model_index_id (:id index)))]
                        (doseq [[i n] (map-indexed vector names)]
                          (t2/insert! :model/ModelIndexValue {:model_index_id (:id index), :model_pk i, :name n}))
                        (run! search/update! (values))))})

(def ^:private archived-write-check-models
  "The search models whose archived results run a write check on their rows that rasta passes.
  Left out are the models rasta cannot write when archived (Actions, Segments, Measures), so that searching them as
  rasta returns nothing to count, and the models whose rows [[search-row-factories]] do not make archived (Collections,
  Tables, Databases, DataApps, indexed entities)."
  #{"card" "dataset" "metric" "dashboard" "document" "exploration"})

(defn- rasta-visible-models
  "The search models rasta can see, which is all but those only superusers see: those never reach a permission check
  for rasta."
  []
  (->> (search.spec/specifications)
       (remove (comp #{:superuser} :visibility val))
       (map key)
       sort))

(defn- search-count
  "Searches as rasta for `query` among the `model` results, and returns the number of rows and of app-DB queries."
  [model query archived?]
  (t2/with-call-count [call-count]
    {:rows    (count (:data (mt/user-http-request :rasta :get 200 "search"
                                                  :q query :models model :limit 100 :archived archived?)))
     :queries (call-count)}))

(defn- measure-extra-queries!
  "Makes one `model` row (the solo) and `batch-size` rows (the batch) in a collection rasta can read, or can write
  when `archived?`, as that is what shows archived rows to rasta. Returns the numbers of rows each search finds and how
  many more queries the batch search runs than the solo one."
  [archived? model]
  (let [[solo-q batch-q] (repeatedly 2 mt/random-name)
        make!            (search-row-factories model)]
    (mt/with-temp [:model/Collection collection {}]
      (if archived?
        (do (perms/revoke-collection-permissions! (perms/all-users-group) collection)
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection))
        (perms/grant-collection-read-permissions! (perms/all-users-group) collection))
      (let [row-attrs (if archived? {:archived true} {})]
        (make! collection [solo-q] row-attrs)
        (make! collection (map #(str batch-q " " %) (range batch-size)) row-attrs))
      ;; the first search of each kind loads caches that the measured ones reuse
      (search-count model batch-q archived?)
      (search-count model solo-q archived?)
      (let [solo  (search-count model solo-q archived?)
            batch (search-count model batch-q archived?)]
        {:rows          [(:rows solo) (:rows batch)]
         :extra-queries (- (:queries batch) (:queries solo))}))))

(defn- check-models!
  "Asserts that every one of `models` returns its solo and batch rows for `archived?`, with no extra queries."
  [archived? models]
  (is (= (zipmap models (repeat {:rows [1 batch-size], :extra-queries 0}))
         (into {} (map (juxt identity (partial measure-extra-queries! archived?))) models))))

(defn- check-engine!
  "Checks `models` unarchived, and the ones of them that [[archived-write-check-models]] has archived."
  [models]
  (testing "unarchived"
    (check-models! false models))
  (testing "archived"
    (check-models! true (filter archived-write-check-models models))))

(deftest every-search-model-has-a-row-factory-test
  (is (= [] (remove search-row-factories (rasta-visible-models)))))

(deftest search-query-count-does-not-grow-with-results-test
  (let [models (rasta-visible-models)]
    (mt/with-model-cleanup (->> models
                                (map (comp :db-model search.config/model->db-model))
                                (remove #{:model/ModelIndexValue}) ; no id; goes with its model's Card
                                distinct)
      (mt/with-premium-features #{:data-apps}
        (testing "in-place"
          (search.tu/with-legacy-search (check-engine! models)))
        (when (search.engine/supported-engine? :search.engine/appdb)
          (testing "appdb"
            (check-engine! models)))))))
