(ns metabase-enterprise.library-branching.format.old-test
  "The old-format decoder: the serdes files that remote sync writes, decoded to a snapshot. The scenarios of the old
  tests that read legacy files are here: v57 collections, files at old paths, table settings of v64 and field files
  with dimensions, and glossary files keyed by their term."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.old :as old]
   [metabase-enterprise.library-branching.format.old-test-util :as old.tu]
   [metabase-enterprise.library-branching.format.old.glossary :as old.glossary]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase.util :as u])
  (:import
   (java.io File)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

(defn- utf8
  ^bytes [^String s]
  (.getBytes s StandardCharsets/UTF_8))

(defn- decode
  "`old/decode-tree` of the YAML texts `texts`, with the codecs of the kinds."
  ([texts] (decode texts {}))
  ([texts opts] (old/decode-tree kinds/codecs (map utf8 texts) opts)))

(defn- snapshot-of
  [texts & [opts]]
  (let [{:keys [snapshot findings]} (decode texts opts)]
    (is (nil? findings))
    snapshot))

(defn- finding-types
  [{:keys [findings]}]
  (mapv #(select-keys % [:type :file]) findings))

(defn- item
  [kind item-name place attrs & [refs]]
  {:kind kind :name item-name :place place :refs (or refs #{}) :attrs attrs})

;;; ---------------------------------------------- The files of remote sync ----------------------------------------------

(def ^:private old-golden-dir
  "The files that remote sync of master writes for the content of the golden tree."
  "enterprise/backend/test_resources/library_branching/old_golden")

(def ^:private golden-dir "enterprise/backend/test_resources/library_branching/golden")

(defn- dir-files
  "`{path bytes}` of the files under `dir`."
  [dir]
  (let [root (.toPath (io/file dir))]
    (into {}
          (keep (fn [^File f]
                  (when (.isFile f)
                    [(str (.relativize root (.toPath f))) (Files/readAllBytes (.toPath f))])))
          (file-seq (io/file dir)))))

(defn golden-snapshot
  "The snapshot that the golden files of the new format decode to."
  []
  (:snapshot (tree/decode-tree kinds/codecs (vals (dir-files golden-dir)))))

(def golden-table-names
  "The display name that warehouse sync gives each published table of the golden content."
  {["Sample Database" "PUBLIC" "ORDERS"] "Orders"})

(deftest remote-sync-files-decode-to-the-golden-items-test
  (testing "the files that remote sync writes for the golden content decode to the items of the golden tree"
    (let [files (dir-files old-golden-dir)]
      (is (claims/old-format? (claims/item-claims files)))
      (is (= {:snapshot (golden-snapshot)}
             (old/decode-tree kinds/codecs (vals files) {:table-names golden-table-names}))))))

;;; ------------------------------------------------- Collections ------------------------------------------------------

(defn- collection-yaml
  "A collection file as the old tests write it: every column, nil included, and the serdes path in `serdes/meta`."
  [entity-id coll-name & {:keys [parent-id namespace type extra]}]
  (str "name: " coll-name "\n"
       "description: null\n"
       "entity_id: " entity-id "\n"
       "slug: " (str/replace (u/lower-case-en coll-name) #"\s+" "_") "\n"
       "created_at: '2024-08-28T09:46:18.671622Z'\n"
       "archived: false\n"
       "type: " (or type "null") "\n"
       "parent_id: " (or parent-id "null") "\n"
       "personal_owner_id: null\n"
       "namespace: " (or namespace "null") "\n"
       "authority_level: null\n"
       "serdes/meta:\n- id: " entity-id "\n  label: x\n  model: Collection\n"
       "archive_operation_id: null\n"
       "archived_directly: null\n"
       "is_sample: false\n"
       extra))

(deftest v57-remote-synced-collection-test
  (testing "a collection that v57 wrote with `type: remote-synced` is a collection with no type: scope is fixed, so
           the marker has no meaning"
    (is (= {"V57CollectionXXXXXXXX" (item :collection "V57 Collection" nil {})}
           (snapshot-of [(collection-yaml "V57CollectionXXXXXXXX" "V57 Collection" :type "remote-synced")]))))
  (testing "the flag that replaced the marker is no attribute either"
    (is (= {"V57CollectionXXXXXXXX" (item :collection "V57 Collection" nil {})}
           (snapshot-of [(collection-yaml "V57CollectionXXXXXXXX" "V57 Collection" :extra "is_remote_synced: true\n")]))))
  (testing "another type stays"
    (is (= {"LibraryCollectionXXXX" (item :collection "Library" nil {:type "library"})}
           (snapshot-of [(collection-yaml "LibraryCollectionXXXX" "Library" :type "library")])))))

(deftest v57-nested-remote-synced-collections-test
  (testing "nested collections that v57 marked as remote-synced are collections, the child in its parent"
    (is (= {"V57ParentCollXXXXXXXX" (item :collection "V57 Parent" nil {})
            "V57ChildCollXXXXXXXXX" (item :collection "V57 Child" "V57ParentCollXXXXXXXX" {})}
           (snapshot-of [(collection-yaml "V57ParentCollXXXXXXXX" "V57 Parent" :type "remote-synced")
                         (collection-yaml "V57ChildCollXXXXXXXXX" "V57 Child"
                                          :parent-id "V57ParentCollXXXXXXXX" :type "remote-synced")])))))

(deftest old-format-paths-test
  (testing "a tree at old paths (the entity id in the file name) decodes: the identity and the place are in the file"
    (let [eid  "OldFmtCollXXXXXXXXXXX"
          file (utf8 (collection-yaml eid "Test Collection" :type "library"))]
      (is (= {eid (item :collection "Test Collection" nil {:type "library"})}
             (:snapshot (claims/decode kinds/codecs {(str "collections/" eid "_test_collection/" eid "_test_collection.yaml")
                                                     file}))))
      (testing "the same file at any path gives the same snapshot"
        (is (= (claims/decode kinds/codecs {"collections/x.yaml" file})
               (claims/decode kinds/codecs {"anywhere/else/y.yaml" file})))))))

(deftest archived-items-test
  (testing "an archived item is in the trash, so it is not in the snapshot; nor is an item under it"
    (is (= {"KeptCollectionXXXXXXX" (item :collection "Kept" nil {:type "library"})}
           (snapshot-of [(collection-yaml "KeptCollectionXXXXXXX" "Kept" :type "library")
                         (str/replace (collection-yaml "GoneCollectionXXXXXXX" "Gone" :parent-id "KeptCollectionXXXXXXX")
                                      "archived: false" "archived: true")
                         (collection-yaml "UnderGoneCollXXXXXXXX" "Under" :parent-id "GoneCollectionXXXXXXX")])))))

;;; ---------------------------------------------------- Cards ---------------------------------------------------------

(defn- card-yaml
  [entity-id card-name collection-id card-type & {:keys [extra]}]
  (str "name: " card-name "\n"
       "entity_id: " entity-id "\n"
       "created_at: '2024-08-28T09:46:24.692002Z'\n"
       "creator_id: rasta@metabase.com\n"
       "display: scalar\n"
       "archived: false\n"
       "collection_id: " collection-id "\n"
       "collection_preview: true\n"
       "parameters: []\n"
       "parameter_mappings: []\n"
       "dataset_query:\n"
       "  database: Sample Database\n"
       "  lib/type: mbql/query\n"
       "  stages:\n"
       "  - lib/type: mbql.stage/mbql\n"
       "    source-table: [Sample Database, PUBLIC, ORDERS]\n"
       "    aggregation:\n"
       "    - [count, {}]\n"
       "visualization_settings:\n"
       "  column_settings: null\n"
       "card_schema: 24\n"
       "public_uuid: null\n"
       "enable_embedding: false\n"
       "serdes/meta:\n- model: Card\n"
       "type: " card-type "\n"
       extra))

(deftest cards-test
  (testing "a card of type metric is a metric: the query is the dataset query; derived values, the public link and the
           embedding settings are not attributes"
    (is (= {"MetricCardXXXXXXXXXXX"
            (item :metric "Orders" "LibraryCollectionXXXX"
                  {:display "scalar"
                   :query   {:lib/type "mbql/query"
                             :database "Sample Database"
                             :stages   [{:lib/type     "mbql.stage/mbql"
                                         :source-table ["Sample Database" "PUBLIC" "ORDERS"]
                                         :aggregation  [["count" {}]]}]}}
                  #{[:database [:env ["Sample Database"]]]
                    [:source-table [:env ["Sample Database" "PUBLIC" "ORDERS"]]]})}
           (snapshot-of [(card-yaml "MetricCardXXXXXXXXXXX" "Orders" "LibraryCollectionXXXX" "metric")]))))
  (testing "a question and a model are kinds with no codec yet: the file is an item that does not decode"
    (is (= [{:type :unknown-kind :kind :question :file 0}
            {:type :unknown-kind :kind :model :file 1}]
           (map #(select-keys % [:type :kind :file])
                (:findings (decode [(card-yaml "QuestionCardXXXXXXXXX" "Q" "LibraryCollectionXXXX" "question")
                                    (card-yaml "ModelCardXXXXXXXXXXXX" "M" "LibraryCollectionXXXX" "model")]))))))
  (testing "an archived card is not in the snapshot"
    (is (= {}
           (snapshot-of [(str/replace (card-yaml "MetricCardXXXXXXXXXXX" "Orders" "LibraryCollectionXXXX" "metric")
                                      "archived: false" "archived: true")])))))

(deftest unknown-models-test
  (testing "a file of a model that has no old-format decoder is an item that does not decode: the pull refuses it,
           and never drops the item"
    (is (= {:findings [{:type :unknown-kind :model "Pulse" :file 0
                        :reason "No old-format decoder for the model Pulse"}]}
           (decode ["name: Sales\nentity_id: PulsePulseXXXXXXXXXXX\nserdes/meta:\n- model: Pulse\n"])))))

(deftest findings-test
  (testing "a file that its kind refuses is an invalid item, with its position"
    (is (= [{:type :invalid :file 1}]
           (finding-types (decode [(collection-yaml "LibraryCollectionXXXX" "Library" :type "library")
                                   (str/replace (card-yaml "MetricCardXXXXXXXXXXX" "Orders" "LibraryCollectionXXXX"
                                                           "metric")
                                                #"display: scalar\n" "")])))))
  (testing "two files with one identity"
    (is (= {:findings [{:type :duplicate-identity :reason "Two or more files hold one identity."
                        :id "LibraryCollectionXXXX" :files [0 1]}]}
           (decode [(collection-yaml "LibraryCollectionXXXX" "Library" :type "library")
                    (collection-yaml "LibraryCollectionXXXX" "Library 2" :type "library")]))))
  (testing "a file whose serdes/meta names no model"
    (is (= [{:type :invalid :file 0}]
           (finding-types (decode ["name: x\nserdes/meta: []\n"]))))))

;;; ------------------------------------------------ Snippets ----------------------------------------------------------

(deftest snippets-test
  (testing "a snippet: no template tags is the default; a snippet tag refers to its snippet"
    (is (= {"BaseFilterSnippetXXXX" (item :snippet "Base filter" nil {:content "x IS NULL"})
            "ActiveSnippetXXXXXXXX"
            (item :snippet "Active" "SnippetCollectionXXXX"
                  {:content       "{{snippet: Base filter}}"
                   :template_tags {(keyword "snippet: Base filter") {:type         "snippet"
                                                                     :name         "snippet: Base filter"
                                                                     :snippet-id   "BaseFilterSnippetXXXX"
                                                                     :snippet-name "Base filter"
                                                                     :id           "0b1d6e0e"}}}
                  #{[:snippet "BaseFilterSnippetXXXX"]})}
           (snapshot-of [(str "name: Base filter\ndescription: null\nentity_id: BaseFilterSnippetXXXX\n"
                              "content: 'x IS NULL'\narchived: false\ntemplate_tags: null\n"
                              "created_at: '2024-08-28T09:46:18.671622Z'\ncreator_id: rasta@metabase.com\n"
                              "collection_id: null\nserdes/meta:\n- id: BaseFilterSnippetXXXX\n  label: base_filter\n"
                              "  model: NativeQuerySnippet\n")
                         (str "name: Active\nentity_id: ActiveSnippetXXXXXXXX\ncontent: '{{snippet: Base filter}}'\n"
                              "collection_id: SnippetCollectionXXXX\n"
                              "template_tags:\n  'snippet: Base filter':\n    type: snippet\n"
                              "    name: 'snippet: Base filter'\n    snippet-id: BaseFilterSnippetXXXX\n"
                              "    snippet-name: Base filter\n    id: 0b1d6e0e\n"
                              "serdes/meta:\n- model: NativeQuerySnippet\n")])))))

;;; ------------------------------------------------ Glossary ----------------------------------------------------------

(defn- legacy-glossary-yaml
  "A glossary file as it was written before glossary terms had an entity id: keyed by its term."
  [term definition]
  (str "term: " term "\ndefinition: " definition "\ncreated_at: '2024-08-28T09:46:18.671622Z'\n"
       "creator_id: rasta@metabase.com\nserdes/meta:\n- id: " term "\n  model: Glossary\n"))

(defn- glossary-yaml
  [entity-id term definition]
  (str "entity_id: " entity-id "\nterm: " term "\ndefinition: " definition "\n"
       "created_at: '2024-08-28T09:46:18.671622Z'\ncreator_id: rasta@metabase.com\n"
       "serdes/meta:\n- id: " entity-id "\n  label: x\n  model: Glossary\n"))

(deftest term-keyed-glossary-file-test
  (testing "a glossary file keyed by its term has an identity that is a function of the term: the same on every
           instance and in every pull"
    (let [s (snapshot-of [(legacy-glossary-yaml "Churn" "Customers who cancel.")])]
      (is (= {(old.glossary/term-identity "Churn") (item :glossary-term "Churn" nil {:definition "Customers who cancel."})}
             s))
      (is (= s (snapshot-of [(legacy-glossary-yaml "Churn" "Customers who cancel.")])))))
  (testing "a file with an entity id has that identity"
    (is (= {"ChurnTermEntityIdXXXX" (item :glossary-term "Churn" nil {:definition "Customers who cancel."})}
           (snapshot-of [(glossary-yaml "ChurnTermEntityIdXXXX" "Churn" "Customers who cancel.")])))))

(deftest nano-id-shaped-term-test
  (testing "a term of 21 characters of the entity-id alphabet is a term: only the presence of `entity_id` makes a file
           one with an entity id"
    (let [term "AbCdEfGhIjKlMnOpQrStU"]
      (is (= 21 (count term)))
      (is (= {(old.glossary/term-identity term) (item :glossary-term term nil {:definition "Looks like an id."})}
             (snapshot-of [(legacy-glossary-yaml term "Looks like an id.")])))
      (is (not= term (old.glossary/term-identity term))))))

(defspec term-identity-property-test 200
  (prop/for-all [a gen/string
                 b gen/string]
    (and (re-matches #"[A-Za-z0-9_-]{21}" (old.glossary/term-identity a))
         (= (old.glossary/term-identity a) (old.glossary/term-identity a))
         (= (= a b) (= (old.glossary/term-identity a) (old.glossary/term-identity b))))))

;;; ---------------------------------------------- Published tables ----------------------------------------------------

(def ^:private orders ["test-db" nil "Test Table"])

(def ^:private table-settings-yaml
  (str "collection_id: DataCollectionXXXXXXX\ncreated_at: '2024-08-28T09:46:18.671622Z'\n"
       "display_name: Renamed\ndescription: Curated.\ndescription_set: true\nis_published: true\n"
       "table_id: [test-db, null, Test Table]\nserdes/meta:\n- model: TableUserSettings\n"))

(def ^:private f1-settings-yaml
  (str "created_at: '2024-08-28T09:46:18.671622Z'\ndescription: curated\ndescription_set: true\n"
       "field_id: [test-db, null, Test Table, F1]\nserdes/meta:\n- model: FieldUserSettings\n"))

(def ^:private f2-dimension-yaml
  (str "name: Remapped F2\ntype: internal\nentity_id: DimensionF2XXXXXXXXXX\ncreated_at: '2024-08-28T09:46:18.671622Z'\n"
       "field_id: [test-db, null, Test Table, F2]\nserdes/meta:\n- model: Dimension\n"))

(def ^:private settings-item
  (item :published-table "Renamed" "DataCollectionXXXXXXX"
        {:description "Curated." :fields {:F1 {:description "curated"}}}
        #{[:table [:env orders]] [:field [:env (conj orders "F1")]]}))

(deftest table-settings-test
  (testing "a published table is its settings file and the settings files of its fields; a dimension file loads, and
           remappings are not content of the format yet"
    (is (= {orders settings-item}
           (snapshot-of [table-settings-yaml f1-settings-yaml f2-dimension-yaml]))))
  (testing "a settings file that v64 wrote, with the settings of its fields under `fields`, gives the same item"
    (is (= {orders settings-item}
           (snapshot-of [(str table-settings-yaml
                              "fields:\n- field_id: [test-db, null, Test Table, F1]\n  description: curated\n"
                              "  description_set: true\n  serdes/meta:\n  - model: FieldUserSettings\n")]))))
  (testing "a settings file that v64 wrote for a table with no field settings has an empty `fields`"
    (is (= {orders (assoc settings-item :attrs {:description "Curated."} :refs #{[:table [:env orders]]})}
           (snapshot-of [(str table-settings-yaml "fields: []\n")]))))
  (testing "a field file that an older remote sync wrote, with the dimensions that it carries, loads"
    (is (= {orders settings-item}
           (snapshot-of [table-settings-yaml f1-settings-yaml
                         (str "name: F2\ntable_id: [test-db, null, Test Table]\nbase_type: type/Text\n"
                              "dimensions:\n- {name: Remapped F2, type: internal, entity_id: DimensionF2XXXXXXXXXX}\n"
                              "serdes/meta:\n- {model: Database, id: test-db}\n- {model: Table, id: Test Table}\n"
                              "- {model: Field, id: F2}\n")]))))
  (testing "with no settings file, the table is not published: its field settings files are not an item"
    (is (= {} (snapshot-of [f1-settings-yaml f2-dimension-yaml]))))
  (testing "a settings file of a table that is not published is not an item"
    (is (= {} (snapshot-of [(str/replace table-settings-yaml "is_published: true" "is_published: false")])))))

(deftest user-set-values-test
  (testing "a value whose flag is false or absent is the value of warehouse sync, not one that the user set"
    (is (= {orders (item :published-table "Renamed" "DataCollectionXXXXXXX" {:caveats "Late data."}
                         #{[:table [:env orders]]})}
           (snapshot-of [(str "collection_id: DataCollectionXXXXXXX\ndisplay_name: Renamed\n"
                              "description: From sync.\ndescription_set: false\npoints_of_interest: Sync too.\n"
                              "caveats: Late data.\ncaveats_set: true\nis_published: true\n"
                              "table_id: [test-db, null, Test Table]\nserdes/meta:\n- model: TableUserSettings\n")]))))
  (testing "a field: the coercion strategy is the user's iff the user set the effective type; a foreign key target
           is a setting only with its flag"
    (is (= {:F1 {:effective_type "type/DateTime" :coercion_strategy "Coercion/ISO8601->DateTime"
                 :fk_target      ["test-db" nil "Other" "ID"]}}
           (get-in (snapshot-of [table-settings-yaml
                                 (str "effective_type: type/DateTime\ncoercion_strategy: Coercion/ISO8601->DateTime\n"
                                      "fk_target_field_id: [test-db, null, Other, ID]\nfk_target_field_id_set: true\n"
                                      "semantic_type: type/FK\n"
                                      "field_id: [test-db, null, Test Table, F1]\nserdes/meta:\n"
                                      "- model: FieldUserSettings\n")
                                 (str "coercion_strategy: Coercion/UNIXSeconds->DateTime\n"
                                      "fk_target_field_id: [test-db, null, Other, ID]\n"
                                      "field_id: [test-db, null, Test Table, F2]\nserdes/meta:\n"
                                      "- model: FieldUserSettings\n")])
                   [orders :attrs :fields]))))
  (testing "a nested field is under its parent"
    (is (= {:J {:fields {:K {:display_name "Kay"}}}}
           (get-in (snapshot-of [table-settings-yaml
                                 (str "display_name: Kay\nfield_id: [test-db, null, Test Table, J, K]\n"
                                      "serdes/meta:\n- model: FieldUserSettings\n")])
                   [orders :attrs :fields])))))

(deftest legacy-data-layers-test
  (testing "a data layer of the old medallion names is the value that Metabase stores for it"
    (are [old-value new-value]
         (= new-value (get-in (snapshot-of [(str table-settings-yaml "data_layer: " old-value "\ndata_layer_set: true\n")])
                              [orders :attrs :data_layer]))
      "copper" "hidden"
      "bronze" "final"
      "silver" "final"
      "gold"   "final"
      "final"  "final")))

(deftest display-names-test
  (let [no-name (str/replace table-settings-yaml "display_name: Renamed\n" "")]
    (testing "with no display name in the settings file, the name is the one that warehouse sync gives the table"
      (is (= "Test table" (get-in (snapshot-of [no-name] {:table-names {orders "Test table"}}) [orders :name]))))
    (testing "with no name from warehouse sync either, it is the table name"
      (is (= "Test Table" (get-in (snapshot-of [no-name]) [orders :name]))))
    (testing "a display name that the user set wins"
      (is (= "Renamed" (get-in (snapshot-of [table-settings-yaml] {:table-names {orders "Test table"}})
                               [orders :name]))))))

(deftest field-settings-sources-test
  (testing "a field settings file wins over the entry of the field in a v64 settings file"
    (is (= {:F1 {:description "curated"}}
           (get-in (snapshot-of [(str table-settings-yaml
                                      "fields:\n- field_id: [test-db, null, Test Table, F1]\n  description: older\n"
                                      "  description_set: true\n")
                                 f1-settings-yaml])
                   [orders :attrs :fields]))))
  (testing "two settings files of one field, or of one table, are two files with one identity"
    (is (= {:findings [{:type :duplicate-identity :reason "Two or more files hold one identity."
                        :id (conj orders "F1") :files [1 2]}]}
           (decode [table-settings-yaml f1-settings-yaml f1-settings-yaml])))
    (is (= {:findings [{:type :duplicate-identity :reason "Two or more files hold one identity." :id orders
                        :files [0 1]}]}
           (decode [table-settings-yaml table-settings-yaml])))))

;;; ------------------------------------------------ Table items -------------------------------------------------------

(def ^:private segment-yaml
  (str "name: Large\nentity_id: LargeSegmentXXXXXXXXX\ndescription: Big ones.\narchived: false\n"
       "created_at: '2024-08-28T09:46:18.671622Z'\ncreator_id: rasta@metabase.com\n"
       "definition:\n  database: test-db\n  lib/type: mbql/query\n  stages:\n  - lib/type: mbql.stage/mbql\n"
       "    source-table: [test-db, null, Test Table]\n    filters:\n    - ['>', {}, [field, {}, [test-db, null, Test Table, F1]], 1]\n"
       "serdes/meta:\n- model: Segment\n"))

(deftest table-items-test
  (testing "a segment file has no table: the place is the source table of the definition"
    (is (= {:kind  :segment
            :name  "Large"
            :place orders
            :attrs {:description "Big ones."
                    :definition  {:database "test-db"
                                  :lib/type "mbql/query"
                                  :stages   [{:lib/type     "mbql.stage/mbql"
                                              :source-table orders
                                              :filters      [[">" {} ["field" {} (conj orders "F1")] 1]]}]}}}
           (dissoc (get (snapshot-of [segment-yaml]) "LargeSegmentXXXXXXXXX") :refs))))
  (testing "a measure file, the same"
    (is (= orders
           (get-in (snapshot-of [(str "name: Count\nentity_id: CountMeasureXXXXXXXXX\n"
                                      "definition:\n  database: test-db\n  lib/type: mbql/query\n  stages:\n"
                                      "  - lib/type: mbql.stage/mbql\n    source-table: [test-db, null, Test Table]\n"
                                      "    aggregation:\n    - [count, {}]\nserdes/meta:\n- model: Measure\n")])
                   ["CountMeasureXXXXXXXXX" :place]))))
  (testing "an archived segment is not in the snapshot"
    (is (= {} (snapshot-of [(str/replace segment-yaml "archived: false" "archived: true")])))))

;;; ------------------------------------------------- Claims -----------------------------------------------------------

(deftest claims-decode-test
  (testing "`claims/decode` reads a tree in the old format with the old-format decoder, and completes the system
           items"
    (let [library (collection-yaml "librarylibrarylibrary" "Library" :type "library")
          {:keys [snapshot]} (claims/decode kinds/codecs {"collections/main/library.yaml" (utf8 library)
                                                          "README.md"                     (utf8 "# x")})]
      (is (= (into #{"librarylibrarylibrary"} (keys claims/system-items)) (set (keys snapshot))))))
  (testing "the options reach the decoder"
    (is (= "Test table"
           (get-in (claims/decode kinds/codecs {"t.yaml" (utf8 (str/replace table-settings-yaml "display_name: Renamed\n" ""))}
                                  {:table-names {orders "Test table"}})
                   [:snapshot orders :name]))))
  (testing "a tree with item files of both formats and no format version file is refused"
    (is (= {:findings [{:type :mixed-format
                        :reason "The tree holds item files of the old format and of the new format, and no format version file."}]}
           (claims/decode kinds/codecs {"a.yaml" (utf8 (collection-yaml "LibraryCollectionXXXX" "Library" :type "library"))
                                        "b.yaml" (utf8 "kind: collection\nid: OtherCollectionXXXXX\nname: Other\n")})))))

;;; ------------------------------------------------ Properties --------------------------------------------------------

(defn- holdable
  "Snapshot `s` as an instance can hold it: no visualization setting is nil, as the instance drops those. The old format
  writes `column_settings: null`, so it cannot tell a nil setting from an absent one."
  [s]
  (update-vals s (fn [{:keys [kind] :as it}]
                   (if (= :metric kind)
                     (let [vs (into {} (remove (comp nil? val)) (get-in it [:attrs :visualization_settings]))]
                       (if (seq vs)
                         (assoc-in it [:attrs :visualization_settings] vs)
                         (update it :attrs dissoc :visualization_settings)))
                     it))))

(defspec old-format-round-trip-property-test 50
  (prop/for-all [s (gen/fmap holdable (kinds.tu/snapshot-gen 20))
                 seed gen/large-integer]
    (let [files (old.tu/files s)
          shuffled (let [r (java.util.Random. seed)] (sort-by (fn [_] (.nextInt r)) files))]
      (and (= {:snapshot s} (old/decode-tree kinds/codecs files))
           (= {:snapshot s} (old/decode-tree kinds/codecs shuffled))))))
