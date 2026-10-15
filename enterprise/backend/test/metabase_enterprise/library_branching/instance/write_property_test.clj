(ns metabase-enterprise.library-branching.instance.write-property-test
  "The laws of `write!` and `current` for each kind, as property tests: PutGet (current after a write returns the
  written content, also after earlier writes of other content to the same identity) and GetPut (a write of the
  current content changes no row). Each trial writes in a transaction that rolls back.

  The generators are constructive. They pick among values that the instance can hold: a portable query that a real
  metric has, a field that the table has, a data layer that Metabase stores as it is. A value that
  depends on the trial's app DB rows (a place, a query) is a keyword that [[resolve-item]] replaces. So the
  generators filter nothing, and a shrunk case has fewer writes and the first value of each choice."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [clojure.walk :as walk]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.published-table :as format.published-table]
   [metabase-enterprise.library-branching.format.tree :as tree]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.write-test :as write-test]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ---------------------------------------------------- The world ---------------------------------------------------

(defn- do-with-world!
  "Calls `f` with `{keyword value}`, the values of the keywords of the generated items for the containers and metrics
  of this call, in a transaction that rolls back."
  [f]
  (collections.tu/with-library [{:keys [data metrics]}]
    (mt/with-temp [:model/Collection sub      {:name     "Generated metrics"
                                               :type     "library-metrics"
                                               :location (write-test/children-location metrics)}
                   :model/Collection sub-data {:name     "Generated data"
                                               :type     "library-data"
                                               :location (write-test/children-location data)}
                   :model/Collection folder   {:name "Generated filters" :namespace "snippets" :location "/"}
                   :model/Collection inner    {:name      "Generated inner filters"
                                               :namespace "snippets"
                                               :location  (write-test/children-location folder)}
                   :model/Card       m1       {:name "q1" :type :metric :display :scalar :collection_id (:id metrics)
                                               :dataset_query (write-test/sum-query :venues :price)}
                   :model/Card       m2       {:name "q2" :type :metric :display :scalar :collection_id (:id metrics)
                                               :dataset_query (write-test/sum-query :checkins :user_id)}]
      (let [query (fn [card] (get-in (write-test/current :metric (:entity_id card)) [:attrs :query]))]
        (f {::metrics         (:entity_id metrics)
            ::sub             (:entity_id sub)
            ::data            (:entity_id data)
            ::sub-data        (:entity_id sub-data)
            ::folder          (:entity_id folder)
            ::inner           (:entity_id inner)
            ::q1              (query m1)
            ::q2              (query m2)
            ::category-target (write-test/field-key :categories :id)
            ::venues-name     (t2/select-one-fn :display_name :model/Table (mt/id :venues))
            ::users-name      (t2/select-one-fn :display_name :model/Table (mt/id :users))})))))

(defn- resolve-item
  "`item` with each keyword of this namespace replaced by its value in `world`."
  [world item]
  (walk/postwalk #(if (and (keyword? %) (= (namespace ::here) (namespace %))) (get world %) %) item))

;;; --------------------------------------------------- Generators --------------------------------------------------

(defn- optional
  "A generator of nil or a value of `g`."
  [g]
  (gen/one-of [(gen/return nil) g]))

(defn- with-attrs
  "`item` with the attributes `attrs` that are not nil."
  [item attrs]
  (assoc item :attrs (into {} (remove (comp nil? val)) attrs)))

(def ^:private metric-gen
  (gen/let [item-name (gen/elements ["Revenue" "Price total" "A metric's name"])
            place     (gen/elements [::metrics ::sub])
            display   (gen/elements ["scalar" "line"])
            query     (gen/elements [::q1 ::q2])
            desc      (optional (gen/elements ["Sum of prices." "Für alle"]))
            settings  (optional (gen/elements [{:graph.metrics ["sum"]} {:graph.dimensions ["CATEGORY_ID"]}]))
            preview   (optional (gen/return false))
            position  (optional (gen/elements [1 2]))]
    (with-attrs {:kind :metric :name item-name :place place}
      {:display display :query query :description desc :visualization_settings settings
       :collection_preview preview :collection_position position})))

(defn- collection-gen
  "A generator of the content of a collection in the area `area`: :library or :snippets."
  [area]
  (gen/let [item-name (gen/elements ["Folder" "Revenue folder" "Sub folder"])
            desc      (optional (gen/elements ["What finance signs off on." "Notes"]))
            official  (optional (gen/return "official"))
            place     (gen/elements (if (= :library area) [::metrics ::sub] [nil ::folder ::inner]))]
    (with-attrs {:kind :collection :name item-name :place place}
      (if (= :library area)
        {:type "library-metrics" :description desc :authority_level official}
        {:namespace "snippets" :description desc}))))

(def ^:private snippet-bodies
  [{:content "1 = 1"}
   {:content       "x > {{x}}"
    :template_tags {:x {:type "text" :name "x" :display-name "X" :id "00000000-0000-4000-8000-000000000002"}}}])

(def ^:private snippet-gen
  (gen/let [item-name (gen/elements ["Generated snippet one" "Generated snippet two"])
            place     (gen/elements [nil ::folder ::inner])
            body      (gen/elements snippet-bodies)
            desc      (optional (gen/elements ["A filter." "Notes"]))]
    (with-attrs {:kind :snippet :name item-name :place place}
      (assoc body :description desc))))

(def ^:private layer-choices
  "The data layers of a table: none, or a value that Metabase stores as it is."
  [{} {:data_layer "final"} {:data_layer "internal"} {:data_layer "hidden"}])

(def ^:private field-names
  "Top-level fields of the test tables."
  {:venues ["CATEGORY_ID" "NAME" "PRICE"]
   :users  ["ID" "NAME" "LAST_LOGIN"]})

(def ^:private field-settings-gen
  (gen/let [display (gen/elements ["Shown name" "Other name"])
            sem     (optional (gen/elements ["type/Category" "type/Name"]))
            desc    (optional (gen/return "A field."))]
    (into {} (remove (comp nil? val)) {:display_name display :semantic_type sem :description desc})))

(defn- fields-gen
  [table]
  (gen/fmap (fn [entries] (into {} (remove (comp nil? val)) entries))
            (apply gen/hash-map (mapcat (fn [field-name] [(keyword field-name) (optional field-settings-gen)])
                                        (get field-names table)))))

(defn- published-table-gen
  "A generator of the content of the published table `table`."
  [table]
  (gen/let [item-name (gen/elements ["Places" "Things" (keyword (namespace ::here) (str (name table) "-name"))])
            place     (gen/elements [::data ::sub-data])
            desc      (optional (gen/elements ["Places to eat." "Rows"]))
            caveats   (optional (gen/return "Old rows are partial."))
            layer     (gen/elements layer-choices)
            getting   (optional (gen/return true))
            settings  (fields-gen table)
            target    (optional (gen/return ::category-target))]
    (with-attrs {:kind :published-table :name item-name :place place}
      (merge layer
             {:description             desc
              :caveats                 caveats
              :show_in_getting_started getting
              :fields                  (not-empty (cond-> settings
                                                    (and target (= :venues table))
                                                    (assoc-in [:CATEGORY_ID :fk_target] target)))}))))

;;; ---------------------------------------------------- Property ----------------------------------------------------

(defn- rows
  "Every row that can hold content of the item `id`."
  [id]
  [(t2/select :report_card :entity_id (str id))
   (t2/select :collection :entity_id (str id))
   (t2/select :native_query_snippet :entity_id (str id))
   (t2/select :metabase_table_user_settings {:order-by [:table_id]})
   (t2/select :metabase_field_user_settings {:order-by [:field_id]})])

(defn- laws-hold!
  "True iff each write of the generated `items` to identity `id` of `kind` reads back with current (PutGet), and a
  write of the content that current then returns changes no row (GetPut). Writes in a world that rolls back."
  [kind id items]
  (do-with-world!
   (fn [world]
     (when (= :published-table kind)
       ;; Each trial starts from a table with no user value.
       (let [table-id (t2/select-one-pk :model/Table :db_id (mt/id) :schema (second id) :name (peek id))]
         (t2/delete! :model/TableUserSettings :table_id table-id)
         (t2/delete! :model/FieldUserSettings :field_id [:in (t2/select-pks-set :model/Field :table_id table-id)])))
     (let [store   (get app-db/kind-stores kind)
           put-get (every? (fn [item]
                             (let [item (resolve-item world item)
                                   item (assoc item :refs (format.kinds/refs kind id (:attrs item)))]
                               (instance/write! store id item)
                               (= item (instance/current store id))))
                           items)
           before  (rows id)]
       (instance/write! store id (instance/current store id))
       (and put-get (= before (rows id)))))))

(def ^:private trials 30)

(defspec metric-laws-test trials
  (prop/for-all [items (gen/vector metric-gen 1 3)]
    (laws-hold! :metric "lbGenMetric0000000001" items)))

(defspec library-collection-laws-test trials
  (prop/for-all [items (gen/vector (collection-gen :library) 1 3)]
    (laws-hold! :collection "lbGenCollection000001" items)))

(defspec snippet-collection-laws-test trials
  (prop/for-all [items (gen/vector (collection-gen :snippets) 1 3)]
    (laws-hold! :collection "lbGenCollection000002" items)))

(defspec snippet-laws-test trials
  (prop/for-all [items (gen/vector snippet-gen 1 3)]
    (laws-hold! :snippet "lbGenSnippet000000001" items)))

(defspec published-table-laws-test trials
  (prop/for-all [[table items] (gen/bind (gen/elements [:venues :users])
                                         (fn [table]
                                           (gen/tuple (gen/return table)
                                                      (gen/vector (published-table-gen table) 1 3))))]
    (laws-hold! :published-table (write-test/table-key table) items)))

(deftest generators-cover-the-cases-test
  (testing "the generators give the cases that the laws must hold for"
    (let [sample (fn [g] (gen/sample g 60))
          tables (sample (published-table-gen :venues))]
      (is (some #(get-in % [:attrs :description]) (sample metric-gen)) "a metric with a description")
      (is (some #(nil? (:place %)) (sample (collection-gen :snippets))) "a collection at the root level")
      (is (some #(get-in % [:attrs :template_tags]) (sample snippet-gen)) "a snippet with a tag")
      (is (some #(get-in % [:attrs :fields :CATEGORY_ID :fk_target]) tables) "a foreign key target")
      (is (some #(= "hidden" (get-in % [:attrs :data_layer])) tables) "a hidden table"))))

;;; ------------------------------------------- Visibility type and data layer ------------------------------------------

(def ^:private prior-saves
  "The table settings that a person saved before a write, through the model: none, a value of the legacy visibility
  type, or a data layer. Metabase completes the other column of each."
  [nil {:visibility_type :technical} {:visibility_type :hidden} {:data_layer :final} {:data_layer :hidden}])

(def ^:private layer-content-gen
  "Generates `[prior attrs]`: a prior save of [[prior-saves]], and the attributes of a published table with one, both or
  neither of the visibility type and the data layer. The first choice of each is absent."
  (gen/tuple (gen/elements prior-saves)
             (gen/let [visibility (gen/elements [nil "hidden" "technical"])
                       layer      (gen/elements [nil "final" "internal" "hidden"])]
               (into {} (remove (comp nil? val)) {:visibility_type visibility :data_layer layer}))))

(defn- layer-laws-hold!
  "True iff the format and `write!` agree on content with the attributes `attrs`, after the person's save `prior`: the
  format accepts it iff `write!` does; `current` then returns it (PutGet), and else `write!` changes no row."
  [prior attrs]
  (do-with-world!
   (fn [world]
     (let [table-id (mt/id :venues)
           id       (write-test/table-key :venues)
           store    (get app-db/kind-stores :published-table)
           item     (resolve-item world {:kind :published-table :name "Places" :place ::data :attrs attrs})
           item     (assoc item :refs (format.kinds/refs :published-table id attrs))
           accepted (contains? (tree/decode-file {"published-table" format.published-table/codec}
                                                 (writer/write-yaml (codec/encode format.published-table/codec id item)))
                               :item)]
       (t2/delete! :model/TableUserSettings :table_id table-id)
       (t2/delete! :model/FieldUserSettings :field_id [:in (t2/select-pks-set :model/Field :table_id table-id)])
       (when prior
         (t2/insert! :model/TableUserSettings (assoc prior :table_id table-id)))
       (let [before  (rows id)
             refused (write-test/refusal #(instance/write! store id item))]
         (if accepted
           (and (nil? refused) (= item (instance/current store id)))
           (and (= :invalid-content refused) (= before (rows id)))))))))

(defspec layer-content-laws-test trials
  (prop/for-all [[prior attrs] layer-content-gen]
    (layer-laws-hold! prior attrs)))

(deftest layer-content-gen-covers-the-cases-test
  (testing "the generator gives one, both and neither attribute, after each prior save"
    (let [sample (gen/sample layer-content-gen 200)]
      (is (= (set prior-saves) (set (map first sample))))
      (is (= #{#{} #{:visibility_type} #{:data_layer} #{:visibility_type :data_layer}}
             (set (map (comp set keys second) sample)))))))
