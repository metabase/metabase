(ns metabase-enterprise.serialization.v2.storage-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.serialization.dump :as dump]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- file-set [^java.io.File dir]
  (let [base (.toPath dir)]
    (set (for [^java.io.File file (file-seq dir)
               :when              (.isFile file)
               :let               [rel (.relativize base (.toPath file))]]
           (mapv str rel)))))

(deftest basic-dump-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection parent {:name "Some Collection"}
                         :model/Collection child  {:name "Child Collection" :location (format "/%d/" (:id parent))}]
        (let [export (into [] (extract/extract {:no-transforms true}))]
          (storage/store! export (storage.files/file-writer dump-dir))
          (testing "the right files in the right places"
            (is (= #{["main" "some_collection.yaml"]
                     ["main" "some_collection" "child_collection.yaml"]}
                   (file-set (io/file dump-dir "collections")))
                "collections form a tree, with files as siblings of their content folders")
            (is (contains? (file-set (io/file dump-dir))
                           ["settings.yaml"])
                "A few top-level files are expected"))
          (testing "the Collections properly exported"
            (let [yaml-parent (-> (yaml/from-file (io/file dump-dir "collections" "main"
                                                           "some_collection.yaml"))
                                  (dissoc :serdes/meta :metabase_version)
                                  (update :created_at t/offset-date-time))
                  yaml-child  (-> (yaml/from-file (io/file dump-dir "collections" "main"
                                                           "some_collection" "child_collection.yaml"))
                                  (dissoc :serdes/meta :metabase_version)
                                  (update :created_at t/offset-date-time))]
              (is (= (-> (into {} (t2/select-one :model/Collection :id (:id parent)))
                         (dissoc :id :location)
                         (assoc :parent_id nil)
                         (update :created_at t/offset-date-time)
                         (select-keys (keys yaml-parent)))
                     yaml-parent))
              (is (= (-> (into {} (t2/select-one :model/Collection :id (:id child)))
                         (dissoc :id :location)
                         (assoc :parent_id (:entity_id parent))
                         (update :created_at t/offset-date-time)
                         (select-keys (keys yaml-child)))
                     yaml-child)))))))))

(deftest collection-nesting-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection  grandparent {:name     "Grandparent Collection"
                                                         :location "/"}
                         :model/Collection  parent      {:name     "Parent Collection"
                                                         :location (str "/" (:id grandparent) "/")}
                         :model/Collection  child       {:name     "Child Collection"
                                                         :location (str "/" (:id grandparent) "/" (:id parent) "/")}
                         :model/Card        _c1         {:name "root card" :collection_id nil}
                         :model/Card        _c2         {:name "grandparent card" :collection_id (:id grandparent)}
                         :model/Card        _c3         {:name "parent card" :collection_id (:id parent)}
                         :model/Card        _c4         {:name "child card" :collection_id (:id child)}
                         :model/Dashboard   _d1         {:name "parent dash" :collection_id (:id parent)}]
        (let [export (into [] (extract/extract {:no-transforms true}))]
          (storage/store! export (storage.files/file-writer dump-dir))
          (testing "the right files in the right places"
            (is (= #{["main" "grandparent_collection.yaml"]
                     ["main" "grandparent_collection" "parent_collection.yaml"]
                     ["main" "grandparent_collection" "parent_collection" "child_collection.yaml"]
                     ["main" "root_card.yaml"]
                     ["main" "grandparent_collection" "grandparent_card.yaml"]
                     ["main" "grandparent_collection" "parent_collection" "parent_card.yaml"]
                     ["main" "grandparent_collection" "parent_collection" "child_collection" "child_card.yaml"]
                     ["main" "grandparent_collection" "parent_collection" "parent_dash.yaml"]}
                   (file-set (io/file dump-dir "collections"))))))))))

(deftest snippets-collections-nesting-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection         grandparent {:name      "Grandparent Collection"
                                                                :namespace :snippets
                                                                :location  "/"}
                         :model/Collection         parent      {:name      "Parent Collection"
                                                                :namespace :snippets
                                                                :location  (str "/" (:id grandparent) "/")}
                         :model/Collection         child       {:name      "Child Collection"
                                                                :namespace :snippets
                                                                :location  (str "/" (:id grandparent) "/" (:id parent) "/")}
                         :model/NativeQuerySnippet _c1         {:name "root snippet" :collection_id nil}
                         :model/NativeQuerySnippet _c2         {:name "grandparent snippet" :collection_id (:id grandparent)}
                         :model/NativeQuerySnippet _c3         {:name "parent snippet" :collection_id (:id parent)}
                         :model/NativeQuerySnippet _c4         {:name "child snippet" :collection_id (:id child)}]
        (let [export (into [] (extract/extract {:no-settings   true
                                                :no-data-model true
                                                :no-transforms true}))]
          (storage/store! export (storage.files/file-writer dump-dir))
          (testing "all snippet collections and snippets under collections/snippets/"
            (is (= #{["snippets" "grandparent_collection.yaml"]
                     ["snippets" "grandparent_collection" "parent_collection.yaml"]
                     ["snippets" "grandparent_collection" "parent_collection" "child_collection.yaml"]
                     ["snippets" "root_snippet.yaml"]
                     ["snippets" "grandparent_collection" "grandparent_snippet.yaml"]
                     ["snippets" "grandparent_collection" "parent_collection" "parent_snippet.yaml"]
                     ["snippets" "grandparent_collection" "parent_collection" "child_collection" "child_snippet.yaml"]}
                   (file-set (io/file dump-dir "collections"))))))))))

(deftest embedded-slash-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database    db      {:name "My Company Data"}
                         :model/Table       table   {:name "Customers" :db_id (:id db)}
                         :model/Field       website {:name "Company/organization website" :table_id (:id table)}
                         :model/FieldValues _       {:field_id (:id website)}
                         :model/Table       _       {:name "Orders/Invoices" :db_id (:id db)}]
        (let [export (into [] (extract/extract {:include-field-values true}))]
          (storage/store! export (storage.files/file-writer dump-dir))
          (testing "the right files in the right places"
            (is (= #{["company__SLASH__organization_website.yaml"]
                     ["company__SLASH__organization_website___fieldvalues.yaml"]}
                   (file-set (io/file dump-dir "databases" "my_company_data" "tables" "customers" "fields")))
                "Slashes in file names get escaped")
            (is (contains? (file-set (io/file dump-dir "databases" "my_company_data" "tables"))
                           ["orders__SLASH__invoices" "orders__SLASH__invoices.yaml"])
                "Slashes in directory names get escaped"))
          (testing "the Field was properly exported"
            (is (= (ts/extract-one "Field" (:id website))
                   (-> (yaml/from-file (io/file dump-dir
                                                "databases"  "my_company_data"
                                                "tables"     "customers"
                                                "fields"     "company__SLASH__organization_website.yaml"))
                       (dissoc :metabase_version)
                       (update :visibility_type keyword)
                       (update :base_type       keyword))))))))))

(deftest entity-counts-report-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection coll {:name "Some Collection"}
                         :model/Card       _    {:name "Some Card" :collection_id (:id coll)}]
        (let [export   (into [] (extract/extract {:no-data-model true :no-transforms true}))
              models   (map #(-> % :serdes/meta last :model) export)
              expected (cond-> (frequencies (remove #{"Setting"} models))
                         (some #{"Setting"} models) (assoc "Setting" 1))
              report   (storage/store! export (storage.files/file-writer dump-dir))]
          (testing ":entity-counts is a {model count} map, with all settings tallied as a single entry"
            (is (= expected (:entity-counts report)))
            (is (pos? (get-in report [:entity-counts "Setting"] 0))
                "settings should be part of this export, to exercise the Setting tally")))))))

(deftest yaml-sorted-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database           db  {:name "My Company Data"}
                         :model/Table              t   {:name "Customers" :db_id (:id db)}
                         :model/Field              w   {:name "Company/organization website" :table_id (:id t)}
                         :model/FieldValues        _   {:field_id (:id w)}
                         :model/Collection         col {:name "Some Collection"}
                         :model/Card               c1  {:name "some card" :collection_id nil}
                         :model/Card               c2  {:name "other card" :collection_id (:id col)}
                         :model/Dashboard          d1  {:name "some dash" :collection_id (:id col)}
                         :model/DashboardCard      _   {:card_id (:id c1) :dashboard_id (:id d1)}
                         :model/DashboardCard      _   {:card_id (:id c2) :dashboard_id (:id d1)}
                         :model/NativeQuerySnippet _   {:name "root snippet" :collection_id nil}]
        (let [export     (extract/extract nil)
              check-sort (fn [coll order]
                           (loop [[k :as ks] (keys coll)
                                  idx        -1]
                             (let [new-idx (get order k)]
                               (if (nil? new-idx)
                                 ;; rest are sorted alphabetically
                                 (is (= (not-empty (sort ks))
                                        (not-empty ks)))
                                 (do
                                   ;; check every present key is sorted in a monotone increasing order
                                   (is (< idx (get order k)))
                                   (recur (rest ks)
                                          (long new-idx)))))))
              descend    (fn descend
                           ([coll]
                            (let [model (-> (:serdes/meta coll) last :model)]
                              (is model)
                              (descend coll [(keyword model)])))
                           ([coll path]
                            (let [order (or (get @@#'dump/serialization-order path)
                                            (get @@#'dump/serialization-order (last path)))]
                              (testing (str "Path = " path)
                                (is order)
                                (check-sort coll order))
                              (doseq [[k v] coll]
                                (cond
                                  (map? v)               (descend v (conj path k))
                                  (and (sequential? v)
                                       (map? (first v))) (run! #(descend % (conj path k)) v))))))]
          (mt/with-dynamic-fn-redefs [spit (fn [fname yaml-data]
                                             (testing (format "File %s\n" fname)
                                               (let [coll (yaml/parse-string yaml-data)]
                                                 (if (str/ends-with? fname "settings.yaml")
                                                   (descend coll [:settings])
                                                   (descend coll)))))]
            (storage/store! export (storage.files/file-writer dump-dir))))))))

(deftest store-error-test
  (mt/with-empty-h2-app-db!
    (testing "destination not writable"
      (ts/with-random-dump-dir [parent-dir "serdesv2-"]
        (let [dump-dir (str parent-dir "/test")]
          (testing "parent is not writable, cannot create own directory"
            (.mkdirs (io/file parent-dir))
            (.setWritable (io/file parent-dir) false)
            (is (thrown-with-msg? Exception #"Destination path is not writeable: "
                                  (storage/store! [{:serdes/meta [{:model "A" :id "B"}]}]
                                                  (storage.files/file-writer dump-dir)))))
          (testing "directory exists but is not writable"
            (.setWritable (io/file parent-dir) true)
            (.mkdirs (io/file dump-dir))
            (io/make-parents dump-dir "inner")
            (.setWritable (io/file dump-dir) false)
            (is (thrown-with-msg? Exception #"Destination path is not writeable: "
                                  (storage/store! [{:serdes/meta [{:model "A" :id "B"}]}]
                                                  (storage.files/file-writer dump-dir))))))))))

(deftest nested-fields-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (let [db  (ts/create! :model/Database :name "mydb")
            t   (ts/create! :model/Table :name "table" :db_id (:id db))
            f1  (ts/create! :model/Field :name "parent" :table_id (:id t))
            _f2 (ts/create! :model/Field :name "child" :table_id (:id t) :parent_id (:id f1))]
        (serdes/with-cache
          (-> (extract/extract {:no-settings true})
              (storage/store! (storage.files/file-writer dump-dir))))
        (testing "we get correct names for nested fields"
          (is (= #{["parent.yaml"]
                   ["parent.child.yaml"]}
                 (file-set (io/file dump-dir "databases" "mydb" "tables" "table" "fields")))))))))

(deftest python-library-storage-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (t2/delete! :model/PythonLibrary)
      (ts/with-temp-dpc [:model/PythonLibrary _lib {:path "common" :source "def test(): pass"}]
        (let [export (into [] (extract/extract {:no-settings true :no-data-model true}))]
          (storage/store! export (storage.files/file-writer dump-dir))
          (testing "python library stored at top-level python_libraries/"
            (is (= #{["common.py.yaml"]}
                   (file-set (io/file dump-dir "python_libraries"))))))))))

(deftest dashcard-ordering-test
  (testing "Test that dashcard ordering in YAML export is stable when the DB returns dashcards
   in a different order (simulating non-deterministic query results from Aurora/postgres)."
    (mt/with-empty-h2-app-db!
      (ts/with-random-dump-dir [dump-dir "serdesv2-"]
        (let [now (t/offset-date-time)
              col (ts/create! :model/Collection :name "coll")
              db (ts/create! :model/Database :name "mydb")
              tbl (ts/create! :model/Table :name "mytable" :db_id (:id db))
              fld (ts/create! :model/Field :name "myfield" :table_id (:id tbl))
              c1 (ts/create! :model/Card :name "Card A" :collection_id (:id col)
                             :database_id (:id db) :table_id (:id tbl))
              c2 (ts/create! :model/Card :name "Card B" :collection_id (:id col)
                             :database_id (:id db) :table_id (:id tbl))
              c3 (ts/create! :model/Card :name "Card C" :collection_id (:id col)
                             :database_id (:id db) :table_id (:id tbl))
              dash (ts/create! :model/Dashboard :name "My Dashboard" :collection_id (:id col))
              ;; Create all dashcards with the same created_at (simulating a batch save)
              _dc1 (ts/create! :model/DashboardCard :dashboard_id (:id dash) :card_id (:id c1)
                               :row 0 :col 0 :size_x 4 :size_y 4 :created_at now
                               :parameter_mappings [{:parameter_id "param1"
                                                     :card_id      (:id c1)
                                                     :target       [:dimension [:field (:id fld) nil]]}])
              _dc2 (ts/create! :model/DashboardCard :dashboard_id (:id dash) :card_id (:id c2)
                               :row 0 :col 4 :size_x 4 :size_y 4 :created_at now)
              _dc3 (ts/create! :model/DashboardCard :dashboard_id (:id dash) :card_id (:id c3)
                               :row 4 :col 0 :size_x 4 :size_y 4 :created_at now)

              find-dash-file (fn [dir]
                               (->> (file-seq (io/file dir))
                                    (filter #(str/ends-with? (.getName ^java.io.File %) ".yaml"))
                                    (filter #(str/includes? (.getName ^java.io.File %) "my_dashboard"))
                                    first))
              clean-and-export! (fn []
                                  (doseq [^java.io.File f (reverse (file-seq (io/file dump-dir)))]
                                    (.delete f))
                                  (.mkdirs (io/file dump-dir))
                                  (storage/store! (serdes/with-cache (into [] (extract/extract {:no-settings true
                                                                                                :no-transforms true})))
                                                  (storage.files/file-writer dump-dir))
                                  (slurp (find-dash-file dump-dir)))

              ;; Export with normal DB order
              yaml-before (clean-and-export!)

              ;; Export again but with nested entity query results reversed,
              ;; simulating non-deterministic DB row ordering (as seen on Aurora Postgres)
              original-fn (mt/original-fn #'serdes/transform->nested)
              yaml-reversed
              (mt/with-dynamic-fn-redefs [serdes/transform->nested
                                          (fn [transform opts batch]
                                            (update-vals (original-fn transform opts batch) reverse))]
                (clean-and-export!))]
          (testing "Dashcard ordering should be stable regardless of DB return order"
            (is (= yaml-before yaml-reversed)
                "Dashboard YAML should be identical even when DB returns dashcards in different order")))))))

(deftest name-too-long-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      ;; that's a char that takes 3 bytes in utf-8
      (ts/with-temp-dpc [:model/Card card {:name (str/join (repeat 100 "ป"))}]
        (let [export        (into [] (extract/extract {:no-settings   true
                                                       :no-data-model true
                                                       :no-transforms true
                                                       :targets       [["Card" (:id card)]]}))
              ;; 66 is 'char-count * max-bytes / byte-count'
              card-filename (str/join (repeat 66 "ป"))]
          (storage/store! export (storage.files/file-writer dump-dir))
          ;; we could also test loading here, but file names do not play significant part in how everything's loaded,
          ;; `:serdes/meta` does and that one is not shortened or anything
          (testing "the right files in the right places"
            (is (= #{["main" (str card-filename ".yaml")]}
                   (file-set (io/file dump-dir "collections")))
                "collections form a tree, with same-named files")))))))

(defn- export-and-read-eids!
  "Export everything to `dump-dir`, then return the entity_id read from each of `filenames` under
  collections/main/my_collection/."
  [dump-dir filenames]
  (storage/store! (into [] (extract/extract {:no-settings   true
                                             :no-data-model true
                                             :no-transforms true}))
                  (storage.files/file-writer dump-dir))
  (mapv (fn [filename]
          (:entity_id (yaml/from-file (io/file dump-dir "collections" "main" "my_collection" filename))))
        filenames))

(deftest same-name-stable-filename-test
  (testing "two same-named entities in a folder get deterministic filename de-dup suffixes (`foo.yaml` vs
           `foo_2.yaml`) across exports — otherwise re-exports swap which card lands in which file, producing huge
           phantom git-sync diffs (GHY-3754)"
    (testing "the older entity (earlier created_at) keeps the unsuffixed file, so adding a new same-named entity
             appends `_2` rather than displacing the existing file. created_at decides even when entity_id order and
             insertion order both disagree"
      (ts/with-random-dump-dir [dump-dir "serdesv2-"]
        (mt/with-empty-h2-app-db!
          ;; The OLD card has the *larger* entity_id and is inserted *second*, so created_at is the only thing that
          ;; can put it in the unsuffixed file — proving created_at takes precedence over entity_id and row order.
          (ts/with-temp-dpc [:model/Collection coll {:name "My Collection"}
                             :model/Card       _new {:name          "Dup Name"
                                                     :collection_id (:id coll)
                                                     :created_at    #t "2024-01-01T00:00:00Z"
                                                     :entity_id     "aaaaaaaaaaaaaaaaaaaaa"}
                             :model/Card       _old {:name          "Dup Name"
                                                     :collection_id (:id coll)
                                                     :created_at    #t "2020-01-01T00:00:00Z"
                                                     :entity_id     "zzzzzzzzzzzzzzzzzzzzz"}]
            (is (= ["zzzzzzzzzzzzzzzzzzzzz" "aaaaaaaaaaaaaaaaaaaaa"]
                   (export-and-read-eids! dump-dir ["dup_name.yaml" "dup_name_2.yaml"]))
                "older card (earlier created_at) wins the unsuffixed file; newer card gets _2")))))
    (testing "entity_id breaks ties deterministically when created_at is identical"
      (ts/with-random-dump-dir [dump-dir "serdesv2-"]
        (mt/with-empty-h2-app-db!
          (ts/with-temp-dpc [:model/Collection coll {:name "My Collection"}
                             :model/Card       _zzz {:name          "Dup Name"
                                                     :collection_id (:id coll)
                                                     :created_at    #t "2024-01-01T00:00:00Z"
                                                     :entity_id     "zzzzzzzzzzzzzzzzzzzzz"}
                             :model/Card       _aaa {:name          "Dup Name"
                                                     :collection_id (:id coll)
                                                     :created_at    #t "2024-01-01T00:00:00Z"
                                                     :entity_id     "aaaaaaaaaaaaaaaaaaaaa"}]
            (is (= ["aaaaaaaaaaaaaaaaaaaaa" "zzzzzzzzzzzzzzzzzzzzz"]
                   (export-and-read-eids! dump-dir ["dup_name.yaml" "dup_name_2.yaml"]))
                "with equal created_at, smaller entity_id wins the unsuffixed file")))))))

(deftest ^:parallel resolve-path-test
  (let [resolve-path @#'storage.util/resolve-path]
    (testing "basic slugification"
      (let [fns (atom {})]
        (is (= ["my_collection" "some_card"]
               (resolve-path fns [{:label "My Collection" :key "coll-1"}
                                  {:label "Some Card"     :key "card-1"}])))))
    (testing "special characters are replaced with underscores"
      (let [fns (atom {})]
        (is (= ["hello_world_"]
               (resolve-path fns [{:label "Hello World!" :key "a"}])))))
    (testing "slashes are escaped"
      (let [fns (atom {})]
        (is (= ["orders__SLASH__invoices"]
               (resolve-path fns [{:label "Orders/Invoices" :key "a"}])))))
    (testing "backslashes are escaped"
      (let [fns (atom {})]
        (is (= ["c__BACKSLASH__d"]
               (resolve-path fns [{:label "C\\D" :key "a"}])))))
    (testing "deduplication within the same folder"
      (let [fns (atom {})]
        (is (= ["my_card"]
               (resolve-path fns [{:label "My Card" :key "card-1"}])))
        (is (= ["my_card_2"]
               (resolve-path fns [{:label "My Card" :key "card-2"}]))
            "second entity with same name in same folder gets _2 suffix")))
    (testing "same name in different folders does not conflict"
      (let [fns (atom {})]
        (is (= ["folder_a" "readme"]
               (resolve-path fns [{:label "Folder A" :key "f-a"}
                                  {:label "README"   :key "doc-1"}])))
        (is (= ["folder_b" "readme"]
               (resolve-path fns [{:label "Folder B" :key "f-b"}
                                  {:label "README"   :key "doc-2"}]))
            "same leaf name under different parents is fine")))
    (testing "same key with same slug is stable"
      (let [fns (atom {})]
        (is (= ["my_card"]
               (resolve-path fns [{:label "My Card" :key "card-1"}])))
        (is (= ["my_card"]
               (resolve-path fns [{:label "My Card" :key "card-1"}]))
            "re-resolving the same key+label returns the same result")))
    (testing "unicode is preserved"
      (let [fns (atom {})]
        (is (= ["données"]
               (resolve-path fns [{:label "Données" :key "a"}])))))
    (testing "dots are preserved"
      (let [fns (atom {})]
        (is (= ["parent.child"]
               (resolve-path fns [{:label "parent.child" :key "a"}])))))
    (testing "duplicate parent folder names with different keys"
      (let [fns (atom {})]
        (is (= ["my_folder" "card_a"]
               (resolve-path fns [{:label "My Folder" :key "folder-1"}
                                  {:label "Card A"    :key "card-a"}])))
        (is (= ["my_folder_2" "card_b"]
               (resolve-path fns [{:label "My Folder" :key "folder-2"}
                                  {:label "Card B"    :key "card-b"}]))
            "second folder with same name gets _2 suffix")
        (is (= ["my_folder_3" "card_c"]
               (resolve-path fns [{:label "My Folder" :key "folder-3"}
                                  {:label "Card C"    :key "card-c"}]))
            "third folder with same name gets _3 suffix")))
    (testing "empty path returns empty vector"
      (let [fns (atom {})]
        (is (= [] (resolve-path fns [])))))
    (testing "same slug under different parent paths does not collide"
      (let [fns (atom {})]
        (is (= ["collections" "transforms" "my_transform"]
               (resolve-path fns [{:label "collections" :key "collections"}
                                  {:label "transforms"  :key "ns-transforms"}
                                  {:label "My Transform" :key "t-1"}])))
        (is (= ["databases" "mydb" "schemas" "transforms" "tables" "target"]
               (resolve-path fns [{:label "databases"  :key "databases"}
                                  {:label "mydb"       :key "db-1"}
                                  {:label "schemas"    :key "schemas"}
                                  {:label "transforms" :key "schema-transforms"}
                                  {:label "tables"     :key "tables"}
                                  {:label "target"     :key "table-1"}]))
            "transforms under databases/.../schemas/ should not get _2 suffix")))))
