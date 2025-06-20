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
        (let [export          (into [] (extract/extract nil))
              parent-filename (format "%s_some_collection"  (:entity_id parent))
              child-filename  (format "%s_child_collection" (:entity_id child))]
          (storage/store! export dump-dir)
          (testing "the right files in the right places"
            (is (= #{[parent-filename (str parent-filename ".yaml")]
                     [parent-filename child-filename (str child-filename ".yaml")]}
                   (file-set (io/file dump-dir "collections")))
                "collections form a tree, with same-named files")
            (is (contains? (file-set (io/file dump-dir))
                           ["settings.yaml"])
                "A few top-level files are expected"))

          (testing "the Collections properly exported"
            (is (= (-> (into {} (t2/select-one :model/Collection :id (:id parent)))
                       (dissoc :id :location)
                       (assoc :parent_id nil)
                       (update :created_at t/offset-date-time))
                   (-> (yaml/from-file (io/file dump-dir "collections" parent-filename (str parent-filename ".yaml")))
                       (dissoc :serdes/meta)
                       (update :created_at t/offset-date-time))))

            (is (= (-> (into {} (t2/select-one :model/Collection :id (:id child)))
                       (dissoc :id :location)
                       (assoc :parent_id (:entity_id parent))
                       (update :created_at t/offset-date-time))
                   (-> (yaml/from-file (io/file dump-dir "collections" parent-filename
                                                child-filename (str child-filename ".yaml")))
                       (dissoc :serdes/meta)
                       (update :created_at t/offset-date-time))))))))))

(deftest collection-nesting-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Collection  grandparent {:name     "Grandparent Collection"
                                                         :location "/"}
                         :model/Collection  parent      {:name     "Parent Collection"
                                                         :location (str "/" (:id grandparent) "/")}
                         :model/Collection  child       {:name     "Child Collection"
                                                         :location (str "/" (:id grandparent) "/" (:id parent) "/")}
                         :model/Card        c1          {:name "root card" :collection_id nil}
                         :model/Card        c2          {:name "grandparent card" :collection_id (:id grandparent)}
                         :model/Card        c3          {:name "parent card" :collection_id (:id parent)}
                         :model/Card        c4          {:name "child card" :collection_id (:id child)}
                         :model/Dashboard   d1          {:name "parent dash" :collection_id (:id parent)}]
        (let [export (into [] (extract/extract {}))]
          (storage/store! export dump-dir)
          (testing "the right files in the right places"
            (let [gp-dir (str (:entity_id grandparent) "_grandparent_collection")
                  p-dir  (str (:entity_id parent)      "_parent_collection")
                  c-dir  (str (:entity_id child)       "_child_collection")]
              (is (= #{[gp-dir (str gp-dir ".yaml")]                                          ; Grandparent collection
                       [gp-dir p-dir (str p-dir ".yaml")]                                     ; Parent collection
                       [gp-dir p-dir c-dir (str c-dir ".yaml")]                               ; Child collection
                       ["cards" (str (:entity_id c1) "_root_card.yaml")]                      ; Root card
                       [gp-dir "cards" (str (:entity_id c2) "_grandparent_card.yaml")]        ; Grandparent card
                       [gp-dir p-dir "cards" (str (:entity_id c3) "_parent_card.yaml")]       ; Parent card
                       [gp-dir p-dir c-dir "cards" (str (:entity_id c4) "_child_card.yaml")]  ; Child card
                       [gp-dir p-dir "dashboards" (str (:entity_id d1) "_parent_dash.yaml")]} ; Parent dashboard
                     (file-set (io/file dump-dir "collections")))))))))))

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
                         :model/NativeQuerySnippet c1          {:name "root snippet" :collection_id nil}
                         :model/NativeQuerySnippet c2          {:name "grandparent snippet" :collection_id (:id grandparent)}
                         :model/NativeQuerySnippet c3          {:name "parent snippet" :collection_id (:id parent)}
                         :model/NativeQuerySnippet c4          {:name "child snippet" :collection_id (:id child)}]
        (let [export (into [] (extract/extract {:no-settings   true
                                                :no-data-model true}))]
          (storage/store! export dump-dir)
          (let [gp-dir (str (:entity_id grandparent) "_grandparent_collection")
                p-dir  (str (:entity_id parent)      "_parent_collection")
                c-dir  (str (:entity_id child)       "_child_collection")]
            (testing "collections under collections/"
              (is (= #{[gp-dir (str gp-dir ".yaml")]                                          ; Grandparent collection
                       [gp-dir p-dir (str p-dir ".yaml")]                                     ; Parent collection
                       [gp-dir p-dir c-dir (str c-dir ".yaml")]}                              ; Child collection
                     (file-set (io/file dump-dir "collections")))))
            (testing "snippets under snippets/"
              (is (= #{[(str (:entity_id c1) "_root_snippet.yaml")]                      ; Root snippet
                       [gp-dir (str (:entity_id c2) "_grandparent_snippet.yaml")]        ; Grandparent snippet
                       [gp-dir p-dir (str (:entity_id c3) "_parent_snippet.yaml")]       ; Parent snippet
                       [gp-dir p-dir c-dir (str (:entity_id c4) "_child_snippet.yaml")]} ; Child snippet
                     (file-set (io/file dump-dir "snippets")))))))))))

(deftest embedded-slash-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (ts/with-temp-dpc [:model/Database    db      {:name "My Company Data"}
                         :model/Table       table   {:name "Customers" :db_id (:id db)}
                         :model/Field       website {:name "Company/organization website" :table_id (:id table)}
                         :model/FieldValues _       {:field_id (:id website)}
                         :model/Table       _       {:name "Orders/Invoices" :db_id (:id db)}]
        (let [export (into [] (extract/extract {:include-field-values true}))]
          (storage/store! export dump-dir)
          (testing "the right files in the right places"
            (is (= #{["Company__SLASH__organization website.yaml"]
                     ["Company__SLASH__organization website___fieldvalues.yaml"]}
                   (file-set (io/file dump-dir "databases" "My Company Data" "tables" "Customers" "fields")))
                "Slashes in file names get escaped")
            (is (contains? (file-set (io/file dump-dir "databases" "My Company Data" "tables"))
                           ["Orders__SLASH__Invoices" "Orders__SLASH__Invoices.yaml"])
                "Slashes in directory names get escaped"))

          (testing "the Field was properly exported"
            (is (= (ts/extract-one "Field" (:id website))
                   (-> (yaml/from-file (io/file dump-dir
                                                "databases" "My Company Data"
                                                "tables"    "Customers"
                                                "fields"    "Company__SLASH__organization website.yaml"))
                       (update :visibility_type keyword)
                       (update :base_type       keyword))))))))))

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
          (with-redefs [spit (fn [fname yaml-data]
                               (testing (format "File %s\n" fname)
                                 (let [coll (yaml/parse-string yaml-data)]
                                   (if (str/ends-with? fname "settings.yaml")
                                     (descend coll [:settings])
                                     (descend coll)))))]
            (storage/store! export dump-dir)))))))

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
                                                  dump-dir))))
          (testing "directory exists but is not writable"
            (.setWritable (io/file parent-dir) true)
            (.mkdirs (io/file dump-dir))
            (io/make-parents dump-dir "inner")
            (.setWritable (io/file dump-dir) false)
            (is (thrown-with-msg? Exception #"Destination path is not writeable: "
                                  (storage/store! [{:serdes/meta [{:model "A" :id "B"}]}]
                                                  dump-dir)))))))))

(deftest nested-fields-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    (mt/with-empty-h2-app-db!
      (let [db  (ts/create! :model/Database :name "mydb")
            t   (ts/create! :model/Table :name "table" :db_id (:id db))
            f1  (ts/create! :model/Field :name "parent" :table_id (:id t))
            _f2 (ts/create! :model/Field :name "child" :table_id (:id t) :parent_id (:id f1))]
        (serdes/with-cache
          (-> (extract/extract {:no-settings true})
              (storage/store! dump-dir)))
        (testing "we get correct names for nested fields"
          (is (= #{["parent.yaml"]
                   ["parent.child.yaml"]}
                 (file-set (io/file dump-dir "databases" "mydb" "tables" "table" "fields")))))))))

(deftest name-too-long-test
  (ts/with-random-dump-dir [dump-dir "serdesv2-"]
    ;; that's a char that takes 3 bytes in utf-8
    (ts/with-temp-dpc [:model/Card card {:name (str/join (repeat 100 "ป"))}]
      (let [export        (into [] (extract/extract {:no-settings   true
                                                     :no-data-model true
                                                     :targets       [["Card" (:id card)]]}))
            ;; 66 is 'char-count * max-bytes / byte-count'
            card-filename (format "%s_%s" (:entity_id card) (str/join (repeat 66 "ป")))]
        (storage/store! export dump-dir)
        ;; we could also test loading here, but file names do not play significant part in how everything's loaded,
        ;; `:serdes/meta` does and that one is not shortened or anything
        (testing "the right files in the right places"
          (is (= #{["cards" (str card-filename ".yaml")]}
                 (file-set (io/file dump-dir "collections")))
              "collections form a tree, with same-named files"))))))
