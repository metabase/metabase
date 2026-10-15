(ns metabase-enterprise.library-branching.instance.read-property-test
  "Property tests of the read side against a reference model: generated trees of collections, metrics, snippets and
  published tables, written to the app DB in a transaction that rolls back, and the snapshot that the reference model
  computes from the same choices."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.engine.count :as engine.count]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

;;; ------------------------------------------------ The generated world ---------------------------------------------

(def ^:private root-places
  "The places of a collection at the top level: a section of the Library (`:metrics`, `:data`), the root level outside
  the Library, and the root of the snippets namespace."
  [:metrics :data :plain :snippets])

(def ^:private section-types
  "`{root type}`: the collection type that the Library's content rule needs in each section of the Library."
  {:metrics "library-metrics" :data "library-data"})

(def ^:private archive-gen (gen/frequency [[4 (gen/return false)] [1 (gen/return true)]]))

(def ^:private text-gen (gen/frequency [[1 (gen/return nil)] [1 (gen/elements ["Robin" "A heron's note" "Wren"])]]))

(def ^:private metric-fields [[:venues :price] [:venues :latitude] [:checkins :user_id]])

(def ^:private tables [:venues :users :categories])

(def ^:private world-gen
  "Random choices, folded into a world by [[fold]]: the generator filters nothing, and a shrunk world has fewer
  collections and items, at the root places."
  (gen/sized
   (fn [size]
     (let [n (min size 8)]
       (gen/hash-map
        :collections (gen/vector (gen/hash-map :parent gen/nat :archive archive-gen :description text-gen) 0 n)
        :metrics     (gen/vector (gen/hash-map :place gen/nat :archive archive-gen :description text-gen
                                               :field (gen/elements metric-fields)
                                               :display (gen/elements ["scalar" "line"]))
                                 0 n)
        :snippets    (gen/vector (gen/hash-map :place gen/nat :archive archive-gen :description text-gen
                                               :content (gen/elements ["1 = 1" "x > {{x}}"]))
                                 0 n)
        :tables      (apply gen/tuple (repeat (count tables)
                                              (gen/hash-map :publish gen/boolean :place gen/nat
                                                            :description text-gen :field-name text-gen))))))))

(defn- entity-id
  [prefix i]
  (format "lb%s%018d" prefix i))

(defn- pick
  "The `k`th of `xs`, cyclically."
  [xs k]
  (nth xs (mod k (count xs))))

(defn- fold
  "The world of `choices`. Collection i has its parent among the root places and the collections before it, and is
  archived iff it or an ancestor is (archive is closed downward). An item is archived iff it or its collection is. As
  the Library's content rule needs, a metric is in a Metrics or a plain collection, a snippet in a snippet
  collection, and a published table in a Data collection or at the root level."
  [{:keys [collections metrics snippets] table-choices :tables}]
  (let [colls (reduce (fn [acc [i {:keys [parent archive description]}]]
                        (let [p  (pick (into root-places (range i)) parent)
                              up (when (int? p) (nth acc p))]
                          (conj acc {:entity-id   (entity-id "c" i)
                                     :parent      p
                                     :root        (if up (:root up) p)
                                     :archived    (boolean (or archive (:archived up)))
                                     :description description})))
                      []
                      (map-indexed vector collections))
        in    (fn [pred] (into [nil] (filter #(pred (:root (nth colls %)))) (range (count colls))))
        place (fn [k] (pick (in #{:data}) k))
        item  (fn [prefix candidates i {p :place :keys [archive] :as choice}]
                (let [p (pick candidates p)]
                  (assoc choice
                         :entity-id (entity-id prefix i)
                         :place     p
                         :archived  (boolean (or archive (some-> p (->> (nth colls)) :archived))))))]
    {:collections colls
     :metrics     (vec (map-indexed (partial item "m" (in #{:metrics :plain})) metrics))
     :snippets    (vec (map-indexed (partial item "s" (in #{:snippets})) snippets))
     :tables      (mapv (fn [table {:keys [publish] p :place :as choice}]
                          (assoc choice :table table :publish publish :place (place p)))
                        tables
                        table-choices)}))

;;; ------------------------------------------------ The reference model ---------------------------------------------

(defn- db-name [] (t2/select-one-fn :name :model/Database (mt/id)))

(defn- table-key
  [table]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(db-name) schema name]))

(defn- field-key
  [[table field]]
  (conj (table-key table) (t2/select-one-fn :name :model/Field (mt/id table field))))

(defn- expected-snapshot
  "The snapshot of `world`, by the rules of scope and content. A metric's `:query` is left out: its references stand
  for it. `sections` holds the Metrics and Data collections of the Library under `:metrics` and `:data`."
  [{:keys [collections metrics snippets] world-tables :tables} sections]
  (let [in?     (fn [c] (and (not (:archived c)) (contains? #{:metrics :data :snippets} (:root c))))
        eid-of  (fn [i] (when i (:entity-id (nth collections i))))
        in-coll (fn [i] (and i (in? (nth collections i))))
        attrs   (fn [m] (into {} (remove (comp nil? val)) m))]
    (merge
     (into {}
           (comp (filter in?)
                 (map (fn [{:keys [entity-id parent root description]}]
                        [entity-id {:kind  :collection
                                    :name  entity-id
                                    :place (cond (int? parent)           (eid-of parent)
                                                 (contains? sections parent) (:entity_id (get sections parent))
                                                 (= :snippets root)          "snippetssnippetssnipp")
                                    :refs  #{}
                                    :attrs (attrs {:description description
                                                   :namespace   (when (= :snippets root) "snippets")
                                                   :type        (section-types root)})}])))
           collections)
     (into {}
           (comp (filter #(and (not (:archived %)) (in-coll (:place %))))
                 (map (fn [{:keys [entity-id place description display] [table :as field] :field}]
                        [entity-id {:kind  :metric
                                    :name  entity-id
                                    :place (eid-of place)
                                    :refs  #{[:database [:env [(db-name)]]]
                                             [:source-table [:env (table-key table)]]
                                             [:field [:env (field-key field)]]}
                                    :attrs (attrs {:description description :display display})}])))
           metrics)
     (into {}
           (comp (filter #(and (not (:archived %)) (or (nil? (:place %)) (in-coll (:place %)))))
                 (map (fn [{:keys [entity-id place description content]}]
                        [entity-id {:kind  :snippet
                                    :name  entity-id
                                    :place (or (eid-of place) "snippetssnippetssnipp")
                                    :refs  #{}
                                    :attrs (attrs {:description   description
                                                   :content       content
                                                   :template_tags (when (= "x > {{x}}" content)
                                                                    {:x {:type "text" :name "x" :display-name "X"
                                                                         :id   "00000000-0000-4000-8000-000000000001"}})})}])))
           snippets)
     (into {}
           (comp (filter #(and (:publish %) (in-coll (:place %))))
                 (map (fn [{:keys [table place description field-name]}]
                        (let [k   (table-key table)
                              pk  (conj k (t2/select-one-fn :name :model/Field (t2/select-one-pk :model/Field
                                                                                                 :table_id (mt/id table)
                                                                                                 :semantic_type :type/PK)))]
                          [k {:kind  :published-table
                              :name  (t2/select-one-fn :display_name :model/Table (mt/id table))
                              :place (eid-of place)
                              :refs  (cond-> #{[:table [:env k]]}
                                       field-name (conj [:field [:env pk]]))
                              :attrs (attrs {:description description
                                             :fields      (when field-name {(keyword (peek pk)) {:display_name field-name}})})}]))))
           world-tables))))

;;; ------------------------------------------------ Writing the world -----------------------------------------------

(defn- now [] (java.time.OffsetDateTime/now))

(defn- sum-query
  [[table field]]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id table field)))))))

(defn- insert-collections!
  "Inserts the collections of `world` as rows, in order, and returns their ids. `sections` is as for
  [[expected-snapshot]]."
  [{:keys [collections]} sections]
  (reduce (fn [ids {:keys [entity-id parent root archived description]}]
            (let [location (cond
                             (int? parent)               (let [{:keys [id location]} (nth ids parent)]
                                                           (str location id "/"))
                             (contains? sections parent) (let [{:keys [id location]} (get sections parent)]
                                                           (str location id "/"))
                             :else                       "/")
                  id       (first (t2/insert-returning-pks! :collection
                                                            {:name        entity-id
                                                             :slug        entity-id
                                                             :entity_id   entity-id
                                                             :location    location
                                                             :namespace   (when (= :snippets root) "snippets")
                                                             :type        (section-types root)
                                                             :description description
                                                             :archived    archived}))]
              (conj ids {:id id :location location})))
          []
          collections))

(defn- write-world!
  [world sections]
  (let [ids   (insert-collections! world sections)
        coll  (fn [place] (some-> place (->> (nth ids)) :id))
        user  (mt/user->id :crowberto)]
    (doseq [{:keys [entity-id place archived description display field]} (:metrics world)]
      (t2/insert! :model/Card {:name                   entity-id
                               :entity_id              entity-id
                               :type                   :metric
                               :collection_id          (coll place)
                               :archived               archived
                               :description            description
                               :display                display
                               :creator_id             user
                               :visualization_settings {}
                               :dataset_query          (sum-query field)}))
    (doseq [{:keys [entity-id place archived description content]} (:snippets world)]
      (t2/insert! :native_query_snippet {:name          entity-id
                                         :entity_id     entity-id
                                         :collection_id (coll place)
                                         :archived      archived
                                         :description   description
                                         :content       content
                                         :template_tags (if (= "x > {{x}}" content)
                                                          "{\"x\":{\"type\":\"text\",\"name\":\"x\",\"display-name\":\"X\",\"id\":\"00000000-0000-4000-8000-000000000001\"}}"
                                                          "{}")
                                         :creator_id    user
                                         :created_at    (now)
                                         :updated_at    (now)}))
    (doseq [{:keys [table publish place description field-name]} (:tables world)]
      (t2/insert! :model/TableUserSettings (cond-> {:table_id      (mt/id table)
                                                    :is_published  publish
                                                    :collection_id (coll place)}
                                             description (assoc :description description)))
      (when field-name
        (t2/insert! :model/FieldUserSettings {:field_id     (t2/select-one-pk :model/Field
                                                                              :table_id (mt/id table)
                                                                              :semantic_type :type/PK)
                                              :display_name field-name})))))

(defn- ours
  "The items of snapshot `s` that `world` wrote."
  [s world]
  (let [ids (into (set (map table-key tables))
                  (map :entity-id)
                  (concat (:collections world) (:metrics world) (:snippets world)))]
    (select-keys s ids)))

(defn- without-queries
  [s]
  (update-vals s (fn [item] (update item :attrs dissoc :query))))

(defn- check-choices!
  [choices]
  (collections.tu/with-library [{:keys [data metrics]}]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      ;; The published tables of the world are the only ones.
      (t2/delete! :model/TableUserSettings :table_id [:in (map mt/id tables)])
      (let [world    (fold choices)
            sections {:metrics metrics :data data}]
        (write-world! world sections)
        (let [s (app-db/read-current)]
          (and (= (expected-snapshot world sections) (without-queries (ours s world)))
               (every? #(map? (get-in % [:attrs :query])) (filter (comp #{:metric} :kind) (vals (ours s world))))
               (= (select-keys (scope/scope-count) snapshot/kinds) (engine.count/count-by-kind s))))))))

(defspec read-matches-reference-model-test 100
  (prop/for-all [choices world-gen]
    (check-choices! choices)))

(deftest world-gen-coverage-test
  (testing "the generated worlds hold the cases that the read must decide"
    (let [worlds (mapv #(fold (gen/generate world-gen 8 %)) (range 50))
          some-w (fn [k pred] (some #(some pred (get % k)) worlds))]
      (is (some-w :collections #(and (int? (:parent %)) (contains? section-types (:root %))))
          "a nested Library collection")
      (is (some-w :collections #(and (:archived %) (contains? section-types (:root %))))
          "an archived Library collection")
      (is (some-w :collections #(= :snippets (:root %))) "a snippet collection")
      (is (some-w :metrics #(and (:place %) (not (:archived %)))) "a metric in a collection")
      (is (some-w :snippets #(nil? (:place %))) "a snippet at the root level")
      (is (some-w :tables #(and (:publish %) (:place %) (:field-name %))) "a published table with a field setting")
      (is (some-w :tables #(not (:publish %))) "an unpublished table"))))
