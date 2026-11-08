(ns metabase-enterprise.semantic-layer-import.dbt.preflight-test
  "The read-only check of an emitted tree against the app DB: what the import would bind, and what it would make up,
  with H2 standing in for the instance."
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu]
   [metabase-enterprise.semantic-layer-import.emit :as emit]
   [metabase-enterprise.semantic-layer-import.preflight :as preflight]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private resolved
  "The fixture manifest resolved: one metric `m`, its dimensions over `fact_sales`, `dim_product` and `dim_order`."
  (delay (tu/resolve-manifest-map (tu/build-manifest {}))))

(defn- metadata-provider
  "The provider the fixture resolved against: what the manifest says the warehouse has."
  []
  (-> @resolved :metrics first :metadata-provider))

(defn- insert-warehouse!
  "Give the Database `db-id` the tables and fields the manifest describes, with every table and field name, and every
  schema, passed through `rename` (identity for an instance that names things as dbt does, upper-case for H2, and so
  on); `edit-field` is applied to each field row before it is inserted, and may return nil to leave the field out."
  [db-id {:keys [rename edit-field] :or {rename identity, edit-field identity}}]
  (let [mp (metadata-provider)]
    (doseq [table (lib.metadata/tables mp)
            :let  [table-id (t2/insert-returning-pk! :model/Table {:db_id  db-id
                                                                   :schema (some-> (:schema table) rename)
                                                                   :name   (rename (:name table))
                                                                   :active true})]
            field (lib.metadata/fields mp (:id table))
            :let  [row (edit-field {:table_id      table-id
                                    :name          (rename (:name field))
                                    :base_type     (or (:base-type field) :type/*)
                                    :database_type (or (:database-type field) "unknown")
                                    :active        true})]
            :when row]
      (t2/insert! :model/Field row))))

(defn- write-tree!
  "Write the fixture's serdes tree under `dir`; returns the card's `entity_id`."
  [dir]
  (let [files (emit/files tu/default-config @resolved)]
    (emit/write! dir files)
    (-> (m/find-first :resolved files) :resolved :entity-id)))

(defn- unresolved
  "What the check reports for the fixture tree under `dir`: the unresolved references of its one card, as
  `[model ref]` pairs, with the hints by reference."
  [dir]
  (let [report (preflight/check dir)]
    (is (mr/validate ::preflight/report report))
    (is (<= (count report) 1) "one card, so at most one entry")
    {:refs  (set (map (juxt :model :ref) (-> report first :unresolved)))
     :hints (into {} (map (juxt :ref :hint)) (-> report first :unresolved))
     :card  (-> report first (select-keys [:name :entity-id]))}))

(def ^:private fact-sales ["Sales DB" "public" "fact_sales"])

(def ^:private case-hint
  "The part of a near-miss hint that names the config key for letter case."
  (str "a name the project wrote unquoted is upper-cased when the driver has the :upper-case-unquoted-identifiers"
       " feature and lower-cased otherwise; :identifier-case in the config (:upper, :lower or :as-is) overrides that"))

(def ^:private schema-hint
  "The part of a near-miss hint that names the config key for the schema."
  (str "a driver without the :schemas feature gets a nil schema; :schema-mapping in the config maps a project's schema"
       " to the schema the instance has, or to nil"))

(deftest check-test
  (mt/with-temp-dir [dir nil]
    (let [entity-id (write-tree! dir)]
      (testing "an instance with everything the manifest describes, named as dbt names it: nothing to report"
        (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
          (insert-warehouse! db-id {})
          (is (= [] (preflight/check dir)))))
      (testing "no database of that name"
        (mt/with-temp [:model/Database _ {:name "Another DB", :engine :h2}]
          (let [{:keys [refs hints card]} (unresolved dir)]
            (is (= {:name "M", :entity-id entity-id} card))
            (is (= #{["Database" "Sales DB"]} refs) "the tables and fields under it are not reported on top")
            (is (re-find #"^no Database named \"Sales DB\": the value under `:databases` in the config"
                         (hints "Sales DB")))
            (testing "the entry point answers the same"
              (is (= (preflight/check dir) (semantic-layer-import/preflight {:out-dir dir})))))))
      (testing "the instance upper-cases identifiers, as H2 does: every table is reported with what is there"
        (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
          (insert-warehouse! db-id {:rename u/upper-case-en})
          (let [{:keys [refs hints]} (unresolved dir)]
            (is (= #{["Table" fact-sales]
                     ["Table" ["Sales DB" "public" "dim_product"]]
                     ["Table" ["Sales DB" "public" "dim_order"]]}
                   refs)
                "the fields of a table that is not there are not reported on top")
            (is (= (str "no Table \"fact_sales\" in schema \"public\"; close: \"FACT_SALES\" in schema \"PUBLIC\""
                        " (the letter case or the schema differs; " case-hint "; " schema-hint ")")
                   (hints fact-sales))))))
      (testing "the instance has no schemas: the table is there under a nil schema"
        (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
          (insert-warehouse! db-id {:rename (fn [identifier] (when-not (= identifier "public") identifier))})
          (let [{:keys [hints]} (unresolved dir)]
            (is (= (str "no Table \"fact_sales\" in schema \"public\"; close: \"fact_sales\" in schema nil"
                        " (the letter case or the schema differs; " case-hint "; " schema-hint ")")
                   (hints fact-sales))))))
      (testing "a field is missing, and another differs in letter case"
        (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
          (insert-warehouse! db-id {:edit-field (fn [{field-name :name, :as row}]
                                                  (case field-name
                                                    "sales"    nil
                                                    "date_day" (assoc row :name "DATE_DAY")
                                                    row))})
          (let [{:keys [refs hints]} (unresolved dir)
                sales               (conj fact-sales "sales")
                date-day            (conj fact-sales "date_day")]
            (is (= #{["Field" sales] ["Field" date-day]} refs))
            (is (re-find #"^no Field \"sales\"; the table's fields are (\"[a-zA-Z_]+\", )*\"amount\", " (hints sales)))
            (is (= (str "no Field \"date_day\"; the letter case differs from \"DATE_DAY\" (" case-hint ")")
                   (hints date-day))))))
      (testing "a table and a field an earlier import made up: they exist, inactive, and are reported as such"
        (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
          (insert-warehouse! db-id {:edit-field (fn [{field-name :name, :as row}]
                                                  (cond-> row (= field-name "sales") (assoc :active false)))})
          (t2/update! :model/Table :db_id db-id :name "dim_order" {:active false})
          (let [{:keys [refs hints]} (unresolved dir)
                dim-order           ["Sales DB" "public" "dim_order"]]
            (is (= #{["Table" dim-order] ["Field" (conj fact-sales "sales")]} refs))
            (is (re-find #"^the Table exists but is inactive: a stub an earlier import created" (hints dim-order))))))
      (testing "a database an earlier import made up: a stub"
        (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2, :is_stub true}]
          (insert-warehouse! db-id {})
          (let [{:keys [refs hints]} (unresolved dir)]
            (is (= #{["Database" "Sales DB"]} refs))
            (is (re-find #"^the Database exists but is a stub an earlier import created" (hints "Sales DB")))))))))

(deftest unreadable-tree-test
  (mt/with-temp-dir [dir nil]
    (write-tree! dir)
    (spit (java.io.File. ^String dir "collections/main/dbt_metrics/broken.yaml") "name: [unclosed")
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"1 file\(s\) under .* could not be read"
                          (preflight/check dir)))))

(deftest folded-identifiers-test
  (testing "converted for H2, which upper-cases what dbt wrote unquoted: the tree binds on an instance that did too"
    (mt/with-temp-dir [dir nil]
      (let [config   (assoc tu/default-config :driver :h2)
            resolved (tu/resolve-manifest-map config (tu/build-manifest {:edit tu/unquoted-relations}))
            files    (emit/files config resolved)]
        (emit/write! dir files)
        (is (= ["Sales DB" "PUBLIC" "FACT_SALES"]
               (-> (m/find-first :resolved files) :resolved tu/query-clauses :source-table))
            "the refs are written as H2 stores them")
        (testing "an instance whose names are upper-case: nothing to report"
          (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
            (insert-warehouse! db-id {:rename u/upper-case-en})
            (is (= [] (preflight/check dir)))))
        (testing "an instance that kept dbt's spelling (what :identifier-case :as-is is for): reported, with the key"
          (mt/with-temp [:model/Database {db-id :id} {:name tu/db, :engine :h2}]
            (insert-warehouse! db-id {})
            (let [{:keys [hints]} (unresolved dir)]
              (is (= (str "no Table \"FACT_SALES\" in schema \"PUBLIC\"; close: \"fact_sales\" in schema \"public\""
                          " (the letter case or the schema differs; " case-hint "; " schema-hint ")")
                     (hints ["Sales DB" "PUBLIC" "FACT_SALES"]))))))))))
