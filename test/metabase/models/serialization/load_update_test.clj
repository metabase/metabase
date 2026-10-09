(ns metabase.models.serialization.load-update-test
  "The rules of a serdes load of an entity that the app DB already holds.

  - The end state equals the end state of the oracle load, which writes every column of the normalized file row and
    reads the row again, as the default update step did before it compared columns.
  - The end state does not depend on the order of the files.
  - A load of unchanged content sends no UPDATE and reads no row again."
  (:require
   [clojure.data :as data]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.db :as models.db]
   [metabase.models.serialization :as serdes]
   [metabase.queries.card-schema :as card-schema]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ helpers ------------------------------------------------

(defn- file-of
  "The file that an export writes for `instance` of `model-name`, after a YAML round trip."
  [model-name instance]
  (-> (serdes/with-cache (serdes/extract-one model-name {} instance))
      yaml/generate-string
      yaml/parse-string))

(defn- write-every-file-column!
  "The oracle update step: write every column of the normalized file row `ingested` over the row that `local`
  identifies, then read the row again."
  [model-name ingested local _baseline _opts]
  (let [model (t2.model/resolve-model (symbol model-name))
        pk    (first (t2/primary-keys model))
        id    (get local pk)]
    (models.db/update-entity! id (lib/normalize :metabase.models.db/model-row {:model model :row ingested}))
    (models.db/entity-by-pk model pk id)))

(defn- load-file!
  "Load the file `ingested` onto the entity that the app DB holds. `mode` is `:oracle` (every file column written) or
  `:load` (the update step under test). Returns the column sets of the rows that the load sends to the app DB, one for
  each UPDATE, under `:writes`, and the count of rows that the load reads again by primary key under `:rereads`."
  [mode ingested]
  (let [writes  (atom [])
        rereads (atom 0)
        load!   #(mt/with-dynamic-fn-redefs [models.db/update-entity!
                                             (let [real (mt/original-fn #'models.db/update-entity!)]
                                               (fn [id entity]
                                                 (swap! writes conj [(:model entity) (set (keys (:row entity)))])
                                                 (real id entity)))
                                             models.db/entity-by-pk
                                             (let [real (mt/original-fn #'models.db/entity-by-pk)]
                                               (fn [& args]
                                                 (swap! rereads inc)
                                                 (apply real args)))]
                   (serdes/with-cache
                     (serdes/load-one! ingested (serdes/load-find-local (serdes/path ingested)))))]
    (if (= mode :oracle)
      (mt/with-dynamic-fn-redefs [serdes/update-changed-columns! write-every-file-column!]
        (load!))
      (load!))
    {:writes @writes :rereads @rereads}))

(defn- raw-row
  "The stored row of `table` with `id`, read with no model and so with no after-select."
  [table id]
  (t2/query-one {:select [:*] :from [table] :where [:= :id id]}))

(defn- restore-row!
  "Store `row` as the row of `table` with `id`."
  [table id row]
  (t2/query {:update table
             :set    (dissoc row :id :unique_table_helper :unique_field_helper)
             :where  [:= :id id]}))

(defn- comparable
  "`snapshot` in the form that the differential test compares: JSON text decoded, and without `updated_at`, the keys
  `skip`, and every `:lib/uuid`. An import makes new `:lib/uuid` values, and the export drops them, so no load can
  give the values of another load."
  [skip snapshot]
  (walk/postwalk (fn [x]
                   (cond
                     (map? x)    (apply dissoc x :updated_at :lib/uuid skip)
                     (and (string? x) (re-find #"^\s*[\[{]" x))
                     (try (comparable skip (json/decode+kw x)) (catch Exception _ x))
                     :else       x))
                 snapshot))

(defn- differential
  "Take a snapshot with `snap`, run the oracle load with `load!`, take snapshot `:oracle`, restore the first snapshot
  with `restore!`, run the load under test, and take snapshot `:load`. `:same?` is true when the two snapshots are
  equal in their [[comparable]] form without the keys `skip`. `:writes` is the [[load-file!]] result of the load under
  test."
  [skip snap restore! load!]
  (let [before (snap)
        _      (load! :oracle)
        oracle (snap)
        _      (restore! before)
        writes (load! :load)
        after  (snap)]
    {:same?  (= (comparable skip oracle) (comparable skip after))
     :diff   (take 2 (data/diff (comparable skip oracle) (comparable skip after)))
     :oracle oracle
     :load   after
     :writes writes}))

;;; ---------------------------------------- differential: Table and Field ----------------------------------------

(defn- table-differential!
  "The differential test of a Table file and its TableUserSettings file, loaded in `order`. The target Table has the
  raw description \"target raw comment\" and the user description \"Repo comment\". The repo Table file has the raw
  description \"Repo comment\", and the repo settings file has no user description."
  [order]
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "PUBLIC" :name "overlay_t"
                                                 :description "target raw comment"}]
    (t2/insert! :model/TableUserSettings {:table_id table-id :display_name "T One" :description "Repo comment"})
    (let [table-file (assoc (file-of "Table" (t2/select-one :model/Table table-id)) :description "Repo comment")
          tus-file   (-> (first (into [] (serdes/extract-all "TableUserSettings" {:filter-ids [table-id]})))
                         (dissoc :description)
                         (assoc :description_set false))
          files      {:table table-file :user-settings tus-file}
          snap       (fn [] {:table    (raw-row :metabase_table table-id)
                             :settings (vec (t2/query {:select [:*] :from [:metabase_table_user_settings]
                                                       :where  [:= :table_id table-id]}))})
          restore!   (fn [{:keys [table settings]}]
                       (restore-row! :metabase_table table-id table)
                       (t2/query {:delete-from :metabase_table_user_settings :where [:= :table_id table-id]})
                       (when (seq settings)
                         (t2/query {:insert-into :metabase_table_user_settings :values settings})))
          r          (differential [] snap restore! (fn [mode] (mapv #(load-file! mode (files %)) order)))]
      (assoc r :shown-description (:description (warehouse-schema.db/table table-id))))))

(deftest table-with-user-settings-differential-test
  (doseq [order [[:table :user-settings] [:user-settings :table]]]
    (testing (str "file order " order)
      (let [{:keys [same? diff shown-description]} (table-differential! order)]
        (is (true? same?) (pr-str diff))
        (is (= "Repo comment" shown-description))))))

(defn- field-differential!
  "The differential test of a Field file and its FieldUserSettings file, loaded in `order`. The target Field has the
  raw description \"target raw comment\" and the user description \"Repo comment\". The repo Field file has the raw
  description \"Repo comment\", and the repo settings file has no user description."
  [order]
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id :schema "PUBLIC" :name "overlay_f"}
                 :model/Field    {field-id :id} {:table_id table-id :name "price" :base_type :type/Integer
                                                 :description "target raw comment"}]
    (t2/insert! :model/FieldUserSettings {:field_id field-id :display_name "Price" :description "Repo comment"})
    (let [field-file (assoc (file-of "Field" (t2/select-one :model/Field field-id)) :description "Repo comment")
          fus-file   (-> (file-of "FieldUserSettings" (t2/select-one :model/FieldUserSettings :field_id field-id))
                         (dissoc :description)
                         (assoc :description_set false))
          files      {:field field-file :user-settings fus-file}
          snap       (fn [] {:field    (raw-row :metabase_field field-id)
                             :settings (vec (t2/query {:select [:*] :from [:metabase_field_user_settings]
                                                       :where  [:= :field_id field-id]}))})
          restore!   (fn [{:keys [field settings]}]
                       (restore-row! :metabase_field field-id field)
                       (t2/query {:delete-from :metabase_field_user_settings :where [:= :field_id field-id]})
                       (when (seq settings)
                         (t2/query {:insert-into :metabase_field_user_settings :values settings})))
          r          (differential [] snap restore! (fn [mode] (mapv #(load-file! mode (files %)) order)))]
      (assoc r :shown-description (:description (warehouse-schema.db/field field-id))))))

(deftest field-with-user-settings-differential-test
  (doseq [order [[:field :user-settings] [:user-settings :field]]]
    (testing (str "file order " order)
      (let [{:keys [same? diff shown-description]} (field-differential! order)]
        (is (true? same?) (pr-str diff))
        (is (= "Repo comment" shown-description))))))

(defn- field-drift-differential!
  "The differential test of the file of a Field, after a raw change of its `description` when `drift?`."
  [drift?]
  (mt/with-temp [:model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}
                 :model/Field    {field-id :id} {:table_id table-id :name "price" :base_type :type/Integer
                                                 :description "orig"}]
    (let [file (file-of "Field" (t2/select-one :model/Field field-id))]
      (when drift?
        (t2/query {:update :metabase_field :set {:description "drift"} :where [:= :id field-id]}))
      (differential [] #(raw-row :metabase_field field-id) #(restore-row! :metabase_field field-id %)
                    #(load-file! % file)))))

(deftest field-differential-test
  (testing "no drift"
    (let [{:keys [same? diff writes]} (field-drift-differential! false)]
      (is (true? same?) (pr-str diff))
      (is (= {:writes [] :rereads 0} writes))))
  (testing "a raw change of the description"
    (let [{:keys [same? diff writes load]} (field-drift-differential! true)]
      (is (true? same?) (pr-str diff))
      (is (= [[:model/Field #{:description}]] (:writes writes)))
      (is (= "orig" (:description load))))))

;;; ------------------------------------------- differential: Card -------------------------------------------

(defn- venues-query
  "An MBQL query of the venues table, with a filter on its price when `filter?`, and a count when `count?`."
  [& {:keys [filter? count?]}]
  (let [mp (mt/metadata-provider)]
    (cond-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
      filter? (lib/filter (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1))
      count?  (lib/aggregate (lib/count)))))

(defn- checkins-query
  "An MBQL query of the checkins table."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :checkins)))))

(defn- card-differential!
  "The differential test of a Card made from `card` (its attributes; `:dataset_query` is a function of `ctx`). `setup!`
  changes the stored row before the export, and `drift!` after it. The file is the export of the Card, changed by
  `edit-file`. `skip` names the keys of the L1 exceptions of the case, at any depth."
  [{:keys [card setup! edit-file drift! skip] :or {setup! (fn [_]) edit-file identity drift! (fn [_ _]) skip []}}]
  (mt/with-temp [:model/Database {other-db :id} {:engine :h2 :details {}}
                 :model/Card     {src-card :id} {:dataset_query (venues-query)}
                 :model/Card     {decoy :id}    {:dataset_query (checkins-query)}]
    (let [ctx     {:other-db other-db :src-card src-card :decoy decoy}
          card-id (t2/insert-returning-pk! :model/Card (merge {:name                   "Differential card"
                                                               :display                :table
                                                               :visualization_settings {}
                                                               :creator_id             (mt/user->id :rasta)}
                                                              (update card :dataset_query #(% ctx))))]
      (try
        (setup! card-id)
        (let [file (edit-file (file-of "Card" (t2/select-one :model/Card card-id)))]
          (drift! card-id ctx)
          (differential skip
                        #(raw-row :report_card card-id)
                        #(t2/query {:update :report_card :set (dissoc % :id) :where [:= :id card-id]})
                        #(load-file! % file)))
        (finally
          (t2/delete! :model/Card card-id))))))

(defn- raw-update!
  "A raw UPDATE of the `report_card` row with `id`: no Card hook runs."
  [id changes]
  (t2/query {:update :report_card :set changes :where [:= :id id]}))

(defn- store-uncurated-metric!
  "Make the metric `id` a metric from before dimensions: an old `card_schema` and no stored dimensions."
  [id]
  (raw-update! id {:card_schema 23 :dimensions nil :dimension_mappings nil}))

(defn- store-dimensions!
  "Store the dimensions and dimension mappings that a read of the metric `id` computes from its `entity_id`."
  [id]
  (store-uncurated-metric! id)
  (t2/update! :model/Card id (select-keys (t2/select-one :model/Card id) [:dimensions :dimension_mappings])))

(defn- typed-columns?
  "True when each result column of `row` (a raw `report_card` row) has a field id and a base type other than
  `type/*`, as an inference gives. The model overrides of a file alone have neither."
  [row]
  (let [cols (:result_metadata (comparable [] row))]
    (boolean (and (seq cols)
                  (every? #(and (:id %) (not= "type/*" (:base_type %))) cols)))))

(defn- load-own-file-with-oracle!
  "Load the export of the Card `id` onto it with the oracle, as a load of master stores it."
  [id]
  (load-file! :oracle (file-of "Card" (t2/select-one :model/Card id))))

(def ^:private card-cases
  {"MBQL card, drift of database_id and table_id"
   {:card   {:dataset_query (fn [_] (venues-query))}
    :drift! (fn [id {:keys [other-db]}] (raw-update! id {:database_id other-db :table_id nil}))
    :check  (fn [{:keys [load writes]}]
              (is (= [[:model/Card #{:dataset_query}]] (:writes writes)))
              (is (= (mt/id :venues) (:table_id load))))}

   "native card, drift of database_id"
   {:card   {:dataset_query (fn [_] (mt/native-query {:query "select 1"}))}
    :drift! (fn [id {:keys [other-db]}] (raw-update! id {:database_id other-db}))
    :check  (fn [{:keys [load]}]
              (is (= (mt/id) (:database_id load))))}

   "drift of query_type"
   {:card   {:dataset_query (fn [_] (venues-query))}
    :drift! (fn [id _] (raw-update! id {:query_type "native"}))
    :check  (fn [{:keys [load]}]
              (is (= "query" (:query_type load))))}

   "drift of a column that the file holds"
   {:card   {:dataset_query (fn [_] (venues-query))}
    :drift! (fn [id _] (raw-update! id {:name "drift"}))
    :check  (fn [{:keys [load writes]}]
              (is (= [[:model/Card #{:name}]] (:writes writes)))
              (is (= "Differential card" (:name load))))}

   "card on a card, unchanged"
   {:card  {:dataset_query (fn [{:keys [src-card]}]
                             (let [mp (mt/metadata-provider)] (lib/query mp (lib.metadata/card mp src-card))))}
    :check (fn [{:keys [writes]}]
             (is (= {:writes [] :rereads 0} writes)))}

   "card on a card, drift of source_card_id"
   {:card   {:dataset_query (fn [{:keys [src-card]}]
                              (let [mp (mt/metadata-provider)] (lib/query mp (lib.metadata/card mp src-card))))}
    :drift! (fn [id {:keys [decoy]}] (raw-update! id {:source_card_id decoy}))}

   "Metabot origin"
   {:card   {:dataset_query (fn [_] (venues-query))}
    :drift! (fn [id _] (raw-update! id {:metabot_chart_id "chart-x"}))
    ;; L1 exception: an unchanged load keeps the Metabot origin
    :skip   [:metabot_chart_id :metabot_conversation_id]
    :check  (fn [{:keys [load]}]
              (is (= "chart-x" (:metabot_chart_id load))))}

   "old card_schema"
   {:card   {:dataset_query (fn [_] (venues-query))}
    :drift! (fn [id _] (raw-update! id {:card_schema 20}))
    ;; L1 exception: an unchanged load keeps an old card_schema and the columns that it governs
    :skip   (vec (conj card-schema/schema-governed-columns :card_schema))
    :check  (fn [{:keys [load]}]
              (is (= 20 (:card_schema load))))}

   "metric from before dimensions"
   {:card   {:type :metric :dataset_query (fn [_] (venues-query :count? true))}
    :setup! store-uncurated-metric!
    ;; L1 exception: an unchanged load keeps an old card_schema and the columns that it governs
    :skip   (vec (conj card-schema/schema-governed-columns :card_schema))
    :check  (fn [{:keys [load writes]}]
              (is (= {:writes [] :rereads 0} writes))
              (is (= 23 (:card_schema load))))}

   "metric with stored dimension mappings"
   {:card   {:type :metric :dataset_query (fn [_] (venues-query :count? true))}
    :setup! store-dimensions!
    :check  (fn [{:keys [load writes]}]
              (is (some? (:dimension_mappings load)))
              (is (= {:writes [] :rereads 0} writes)))}

   "MBQL model that an earlier load stored, unchanged"
   {:card   {:type :model :dataset_query (fn [_] (venues-query :filter? true))}
    :setup! load-own-file-with-oracle!
    :check  (fn [{:keys [load writes]}]
              (is (= {:writes [] :rereads 0} writes))
              (is (typed-columns? load)))}

   "MBQL model saved on this instance, unchanged"
   {:card  {:type :model :dataset_query (fn [_] (venues-query :filter? true))}
    ;; L1 exception: an unchanged load keeps the stored inference. The insert inferred the columns with no model
    ;; overrides. The oracle infers them again with the file overrides, which adds `:lib/from-model?` to each column.
    :skip  [:lib/from-model?]
    :check (fn [{:keys [load writes]}]
             (is (= {:writes [] :rereads 0} writes))
             (is (typed-columns? load)))}

   "MBQL model, one changed display name"
   {:card      {:type :model :dataset_query (fn [_] (venues-query :filter? true))}
    :edit-file #(assoc-in % [:result_metadata 1 :display_name] "Changed name")
    :check     (fn [{:keys [load writes]}]
                 (is (= [[:model/Card #{:dataset_query :result_metadata}]] (:writes writes)))
                 (is (typed-columns? load))
                 (is (= "Changed name" (get-in (comparable [] load) [:result_metadata 1 :display_name]))))}

   "MBQL model, changed query"
   {:card      {:type :model :dataset_query (fn [_] (venues-query :filter? true))}
    :edit-file #(assoc-in % [:dataset_query :stages 0 :filters 0 3] 2)
    :check     (fn [{:keys [load writes]}]
                 (is (= [[:model/Card #{:dataset_query :result_metadata}]] (:writes writes)))
                 (is (typed-columns? load)))}

   "stored question whose file is an MBQL model"
   {:card   {:type :model :dataset_query (fn [_] (venues-query :filter? true))}
    :drift! (fn [id _] (raw-update! id {:type "question"}))
    :check  (fn [{:keys [load]}]
              (is (= "model" (:type load)))
              (is (typed-columns? load)))}})

(deftest card-differential-test
  ;; Each model case has a query with a filter. For a whole-table query, the oracle stores the file overrides as they
  ;; are: Toucan drops the file query, which equals the stored one, so the before-update hook infers no columns. The
  ;; load under test keeps the inferred columns of an unchanged whole-table model, so its end state differs from the
  ;; oracle.
  (doseq [[label {:keys [check] :as c}] (sort-by key card-cases)]
    (testing label
      (let [r (card-differential! c)]
        (is (true? (:same? r)) (pr-str (:diff r)))
        (when check
          (check r))))))

;;; ------------------------------- no write and no read again for unchanged content -------------------------------

(defn- dashboard-file
  "The file of the Dashboard `id`, with its DashboardCards."
  [id]
  (-> (first (into [] (serdes/extract-all "Dashboard" {:filter-ids [id]})))
      yaml/generate-string
      yaml/parse-string))

(deftest load-of-unchanged-content-writes-nothing-test
  (mt/with-temp [:model/Collection    {coll-id :id}   {:name "Unchanged" :description "c"}
                 :model/Card          {card-id :id}   {:name          "Unchanged card" :collection_id coll-id
                                                       :dataset_query (venues-query :filter? true)}
                 :model/Card          {model-id :id}  {:name          "Unchanged model" :collection_id coll-id
                                                       :type          :model
                                                       :dataset_query (venues-query :filter? true)}
                 :model/Card          {stored-id :id} {:name          "Metric with stored dimensions"
                                                       :collection_id coll-id
                                                       :type          :metric
                                                       :dataset_query (venues-query :count? true)}
                 :model/Card          {old-id :id}    {:name          "Metric from before dimensions"
                                                       :collection_id coll-id
                                                       :type          :metric
                                                       :dataset_query (venues-query :count? true)}
                 :model/Card          {native-id :id} {:name            "Native card with columns"
                                                       :collection_id   coll-id
                                                       :dataset_query   (mt/native-query {:query "select 1 as one"})
                                                       :result_metadata [{:name         "ONE"
                                                                          :display_name "ONE"
                                                                          :base_type    :type/Integer}]}
                 :model/Dashboard     {dash-id :id}   {:name "Unchanged dash" :collection_id coll-id :parameters []}
                 :model/DashboardCard _               {:dashboard_id dash-id :card_id card-id
                                                       :row 0 :col 0 :size_x 4 :size_y 4}
                 :model/Database      {db-id :id}     {}
                 :model/Table         {table-id :id}  {:db_id db-id :schema "PUBLIC" :name "unchanged_t"
                                                       :description "d"}
                 :model/Field         {field-id :id}  {:table_id table-id :name "f" :base_type :type/Integer
                                                       :description "d"}
                 :model/Field         {name-id :id}   {:table_id table-id :name "f_name" :base_type :type/Text}
                 :model/Dimension     {dim-id :id}    {:field_id field-id :name "F" :type :external
                                                       :human_readable_field_id name-id}]
    (store-uncurated-metric! old-id)
    (store-dimensions! stored-id)
    (t2/insert! :model/TableUserSettings {:table_id table-id :display_name "Unchanged T"})
    (t2/insert! :model/FieldUserSettings {:field_id field-id :display_name "Unchanged F"})
    (let [card-file #(file-of "Card" (t2/select-one :model/Card %))]
      (doseq [[label file loads-before]
              [["Collection" (file-of "Collection" (t2/select-one :model/Collection coll-id)) 0]
               ["Card" (card-file card-id) 0]
               ["MBQL model" (card-file model-id) 0]
               ["metric with stored dimension mappings" (card-file stored-id) 0]
               ["metric from before dimensions" (card-file old-id) 0]
               ;; the first load can write the columns of a native card once: the file holds fewer column details
               ["native card with columns" (card-file native-id) 1]
               ["Dashboard with a DashboardCard" (dashboard-file dash-id) 0]
               ["Table" (file-of "Table" (t2/select-one :model/Table table-id)) 0]
               ["Field" (file-of "Field" (t2/select-one :model/Field field-id)) 0]
               ["TableUserSettings" (file-of "TableUserSettings"
                                             (t2/select-one :model/TableUserSettings :table_id table-id)) 0]
               ["FieldUserSettings" (file-of "FieldUserSettings"
                                             (t2/select-one :model/FieldUserSettings :field_id field-id)) 0]
               ["Dimension" (file-of "Dimension" (t2/select-one :model/Dimension dim-id)) 0]]]
        (testing label
          (dotimes [_ loads-before]
            (load-file! :load file))
          (is (= {:writes [] :rereads 0} (load-file! :load file)))
          (is (= {:writes [] :rereads 0} (load-file! :load file)) "second load"))))
    (testing "the metric from before dimensions keeps its stored card_schema"
      (is (= 23 (:card_schema (raw-row :report_card old-id)))))))

(deftest load-of-unchanged-transform-test
  (testing "An MBQL transform with clauses writes its source on each load; without clauses it writes nothing"
    (doseq [[label source writes] [["no clause"
                                    {:type "query" :query (venues-query)}
                                    []]
                                   ["a filter"
                                    {:type "query" :query (venues-query :filter? true)}
                                    [[:model/Transform #{:source}]]]]]
      (testing label
        (mt/with-temp [:model/Transform {id :id} {:source source}]
          (let [file (-> (first (into [] (serdes/extract-all "Transform" {:filter-ids [id]})))
                         yaml/generate-string
                         yaml/parse-string)]
            (load-file! :load file)
            (is (= writes (:writes (load-file! :load file))))))))))
