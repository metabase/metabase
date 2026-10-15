(ns metabase-enterprise.library-branching.scope-property-test
  "Property tests of scope against a reference model: generated trees of collections and items, written to the app DB
  in a transaction that rolls back, and the scope that the reference model computes from the same choices."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.instance.kinds.published-table :as kinds.published-table]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; ------------------------------------------------ The generated world ---------------------------------------------

(def ^:private root-places
  "The places of a generated collection at the root level: the Library root, a plain collection, a personal
  collection, or the root of a namespace."
  [:library :plain :personal :transforms :snippets :data-actions :data-apps])

(def ^:private item-kinds [:metric :question :dashboard :snippet :timeline :transform :action])

(def ^:private archive-gen
  (gen/frequency [[4 (gen/return false)] [1 (gen/return true)]]))

(def ^:private world-gen
  "`{:collections [{:parent n :archive bool}] :items [{:kind k :place n :archive bool}] :tests [{:transform n}]}`.
  Each choice is folded into a world by [[fold]], so the generator filters nothing, and a shrunk world has fewer
  collections, items and transform tests, at the root places."
  (gen/sized
   (fn [size]
     (gen/hash-map
      :collections (gen/vector (gen/hash-map :parent gen/nat :archive archive-gen) 0 (min size 12))
      :items       (gen/vector (gen/hash-map :kind (gen/elements item-kinds) :place gen/nat :archive archive-gen)
                               0 (min size 20))
      :tests       (gen/vector (gen/hash-map :transform gen/nat) 0 (min size 8))))))

(defn- entity-id
  [prefix i]
  (format "lb%s%018d" prefix i))

(defn- fold
  "The world of `choices`. Collection i has its parent among the root places and the collections before it; it takes
  the namespace of its root, and is archived iff it or an ancestor is (archive is closed downward). Item i is at the
  root level or in a collection, and is archived iff it is or its collection is; a transform has no archived flag of
  its own. Transform test i tests one of the transforms of the items; a world with no transform has no test."
  [{:keys [collections items tests]}]
  (let [colls (reduce (fn [acc [i {:keys [parent archive]}]]
                        (let [candidates (into root-places (range i))
                              p          (nth candidates (mod parent (count candidates)))
                              up         (when (int? p) (nth acc p))]
                          (conj acc {:entity-id (entity-id "c" i)
                                     :parent    p
                                     :root      (if up (:root up) p)
                                     :archived  (boolean (or archive (:archived up)))})))
                      []
                      (map-indexed vector collections))
        items      (vec (map-indexed
                         (fn [i {:keys [kind place archive]}]
                           (let [candidates (into [nil] (range (count colls)))
                                 p          (nth candidates (mod place (count candidates)))]
                             {:entity-id (entity-id "i" i)
                              :kind      kind
                              :place     p
                              :archived  (boolean (or (and archive (not= :transform kind))
                                                      (some-> p (->> (nth colls)) :archived)))}))
                         items))
        transforms (filterv #(= :transform (:kind %)) items)]
    {:collections colls
     :items       items
     :tests       (if (seq transforms)
                    (vec (map-indexed (fn [i {:keys [transform]}]
                                        {:entity-id (entity-id "t" i)
                                         :transform (:entity-id (nth transforms (mod transform (count transforms))))})
                                      tests))
                    [])}))

;;; ------------------------------------------------ The reference model ---------------------------------------------

(def ^:private root-level-kinds
  "The item kinds of the generated world whose items at the root level are in scope."
  #{:snippet :transform :action})

(defn- expected-scope
  "`{kind #{entity-id}}`: the in-scope identities of `world` by the rules of scope, for the kinds of the world."
  [{:keys [collections items tests]}]
  (let [coll-in? (fn [c] (and (not (:archived c))
                              (contains? #{:library :transforms :snippets :data-actions :data-apps} (:root c))))
        scope    (merge-with into
                             (into {} (map (fn [k] [k #{}])) (concat [:collection :transform-test] item-kinds))
                             {:collection (into #{} (comp (filter coll-in?) (map :entity-id)) collections)}
                             (reduce (fn [acc {:keys [entity-id kind place archived]}]
                                       (if (and (not archived)
                                                (if place
                                                  (coll-in? (nth collections place))
                                                  (contains? root-level-kinds kind)))
                                         (update acc kind (fnil conj #{}) entity-id)
                                         acc))
                                     {}
                                     items))]
    (assoc scope :transform-test (into #{}
                                       (comp (filter #(contains? (:transform scope) (:transform %)))
                                             (map :entity-id))
                                       tests))))

;;; ------------------------------------------------ Writing the world -----------------------------------------------

(defn- now [] (java.time.OffsetDateTime/now))

(defn- insert-collections!
  "Inserts the collections of `world` as rows, in order, and returns their ids."
  [{:keys [collections]} {:keys [library personal]}]
  (reduce (fn [ids {:keys [entity-id parent root archived]}]
            (let [location  (cond
                              (int? parent)        (let [{:keys [id location]} (nth ids parent)]
                                                     (str location id "/"))
                              (= :library parent)  (str (:location library) (:id library) "/")
                              (= :personal parent) (str (:location personal) (:id personal) "/")
                              :else                "/")
                  namespace (when (contains? #{:transforms :snippets :data-actions :data-apps} root)
                              (name root))
                  id        (first (t2/insert-returning-pks! :collection {:name      entity-id
                                                                          :slug      entity-id
                                                                          :entity_id entity-id
                                                                          :location  location
                                                                          :namespace namespace
                                                                          :archived  archived}))]
              (conj ids {:id id :location location})))
          []
          collections))

(defn- insert-item!
  "Inserts `item` as a row, and returns its id."
  [{:keys [entity-id kind archived]} collection-id]
  (let [user    (mt/user->id :crowberto)
        base    {:name entity-id :entity_id entity-id :collection_id collection-id}
        insert! (fn [table row] (first (t2/insert-returning-pks! table row)))]
    (case kind
      (:metric :question) (insert! :report_card (merge base {:type                   (name kind)
                                                             :archived               archived
                                                             :display                "table"
                                                             :dataset_query          "{}"
                                                             :visualization_settings "{}"
                                                             :creator_id             user
                                                             :database_id            (mt/id)
                                                             :created_at             (now)
                                                             :updated_at             (now)}))
      :dashboard          (insert! :report_dashboard (merge base {:archived   archived
                                                                  :parameters "[]"
                                                                  :creator_id user
                                                                  :created_at (now)
                                                                  :updated_at (now)}))
      :snippet            (insert! :native_query_snippet (merge base {:archived   archived
                                                                      :content    "1 = 1"
                                                                      :creator_id user}))
      :timeline           (insert! :timeline (merge base {:archived   archived
                                                          :icon       "star"
                                                          :creator_id user}))
      :transform          (insert! :transform (merge base {:source      "{}"
                                                           :source_type "query"
                                                           :target      "{}"}))
      :action             (insert! :action (merge base {:archived archived :type "http"})))))

(defn- insert-test!
  [{:keys [entity-id]} transform-id]
  (t2/insert! :transform_test {:entity_id    entity-id
                               :name         entity-id
                               :transform_id transform-id
                               :creator_id   (mt/user->id :crowberto)
                               :inputs       "[]"
                               :expectations "[]"}))

(defn- actual-scope
  "The in-scope identities of `world`, by kind, after it is written."
  [world]
  (let [ours (into #{} (map :entity-id) (concat (:collections world) (:items world) (:tests world)))]
    (-> (scope/scope-ids)
        (select-keys (concat [:collection :transform-test] item-kinds))
        (update-vals #(into #{} (filter ours) %)))))

(defn- check-world!
  "Writes `world` in a transaction that rolls back, and returns `{:expected :actual :counts-agree?}`."
  [world roots]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids      (insert-collections! world roots)
          item-ids (into {}
                         (map (fn [{:keys [entity-id place] :as item}]
                                [entity-id (insert-item! item (some-> place (->> (nth ids)) :id))]))
                         (:items world))]
      (doseq [{:keys [transform] :as test} (:tests world)]
        (insert-test! test (get item-ids transform)))
      {:expected      (expected-scope world)
       :actual        (actual-scope world)
       :counts-agree? (= (update-vals (scope/scope-ids) count) (scope/scope-count))})))

(defn- check-choices!
  [choices]
  (collections.tu/with-library [{:keys [library]}]
    (let [roots {:library  library
                 :personal (collections.tu/personal-collection (mt/user->id :rasta))}
          {:keys [expected actual counts-agree?]} (check-world! (fold choices) roots)]
      (and (= expected actual) counts-agree?))))

(defspec scope-matches-reference-model-test 100
  (prop/for-all [choices world-gen]
    (check-choices! choices)))

;;; ---------------------------------------------- Published table keys ----------------------------------------------

(def ^:private table-names
  "The names of the generated tables. The last one looks like the name of an archived table."
  ["lb_p_orders" "lb_p_users" "lb_p_x__mbarchiv__7"])

(def ^:private table-world-gen
  "The history of the tables of some keys: `[{:name :schema :generations [{:published :place}] :last-archived}]`.
  Each generation of a key is a table row that warehouse sync made; sync archived each one before the last, and the
  last one iff `:last-archived`. [[fold-tables]] folds the histories into rows, so the generator filters nothing, and
  a shrunk history has fewer keys and generations."
  (gen/sized
   (fn [size]
     (gen/vector (gen/hash-map :name          (gen/elements table-names)
                               :schema        (gen/frequency [[3 (gen/return "PUBLIC")] [1 (gen/return nil)]])
                               :generations   (gen/vector (gen/hash-map :published (gen/frequency [[3 (gen/return true)]
                                                                                                   [1 (gen/return false)]])
                                                                        :place     (gen/frequency [[3 (gen/return :library)]
                                                                                                   [1 (gen/return :outside)]]))
                                                          1 3)
                               :last-archived gen/boolean)
                 0 (min size 4)))))

(defn- fold-tables
  "The table rows of the histories `world`, in the order of their creation: `{:name :schema :key-name :archived
  :published :place}`. Of two histories of one key, the first one counts. An archived row has the name that warehouse
  sync gives it."
  [world]
  (let [world (vals (reduce (fn [acc {:keys [name schema] :as h}] (update acc [schema name] #(or % h)))
                            (sorted-map-by #(compare (str %1) (str %2)))
                            world))]
    (vec (for [{:keys [name schema generations last-archived]} world
               [j {:keys [published place]}] (map-indexed vector generations)
               :let [archived (or last-archived (< j (dec (count generations))))]]
           {:name      (if archived (str name "__mbarchiv__" (+ 1000 j)) name)
            :schema    schema
            :key-name  name
            :archived  archived
            :published published
            :place     (when published place)}))))

(defn- key-owners
  "`{[schema key-name] index}`: the owner of each key of the published rows of `rows`, by the rule of scope: the live
  published row, else the newest published row."
  [rows]
  (->> (map-indexed vector rows)
       (filter (comp :published second))
       (group-by (comp (juxt :schema :key-name) second))
       (into {} (map (fn [[k irs]]
                       [k (first (apply max-key (fn [[i row]] (+ i (if (:archived row) 0 1000))) irs))])))))

(defn- expected-tables
  "`{:keys #{[schema key-name]} :shadowed #{[schema name]}}`: the keys of the in-scope published tables of `rows`, and
  the published rows in the Library that do not own their key."
  [rows]
  (let [owners (key-owners rows)]
    {:keys     (into #{}
                     (keep (fn [[k i]] (when (= :library (:place (nth rows i))) k)))
                     owners)
     :shadowed (into #{}
                     (keep (fn [[i {:keys [schema name key-name published place]}]]
                             (when (and published (= :library place) (not= i (get owners [schema key-name])))
                               [schema name])))
                     (map-indexed vector rows))}))

(defn- check-tables!
  "Writes the table rows `rows` in a transaction that rolls back, and returns `{:expected :actual :counts-agree?
  :snapshot-agrees?}`."
  [rows data]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [outside (first (t2/insert-returning-pks! :collection {:name "lb outside" :slug "lb_outside" :entity_id "lboutsidecollection01" :location "/"}))]
      (doseq [{:keys [name schema archived published place]} rows]
        (t2/insert! :model/Table {:db_id         (mt/id)
                                  :schema        schema
                                  :name          name
                                  :active        (not archived)
                                  :archived_at   (when archived (now))
                                  :is_published  published
                                  :collection_id (case place :library (:id data) :outside outside nil)}))
      (let [ours     (fn [[_db _schema table]] (str/starts-with? table "lb_p_"))
            ids      (scope/scope-ids)
            counts   (scope/scope-count)
            snapshot (app-db/read-current {:published-table kinds.published-table/kind-store} scope/roots)]
        {:expected         (expected-tables rows)
         :actual           {:keys     (into #{} (comp (filter ours) (map (fn [[_db schema table]] [schema table])))
                                            (:published-table ids))
                            :shadowed (into #{}
                                            (comp (filter (comp ours :key)) (map (fn [t] [(second (:key t)) (:name t)])))
                                            (scope/shadowed-tables))}
         :counts-agree?    (= (update-vals ids count) counts)
         :snapshot-agrees? (= (:published-table counts) (count snapshot))}))))

(defspec published-table-keys-match-reference-model-test 50
  (prop/for-all [world table-world-gen]
    (collections.tu/with-library [{:keys [data]}]
      (let [{:keys [expected actual counts-agree? snapshot-agrees?]} (check-tables! (fold-tables world) data)]
        (and (= expected actual) counts-agree? snapshot-agrees?)))))

(deftest table-world-gen-coverage-test
  (testing "the generated histories hold the cases of key ownership that scope must decide"
    (let [tables (mapv #(fold-tables (gen/generate table-world-gen 30 %)) (range 50))
          shared (fn [rows pred]
                   (some (fn [[_ irs]] (pred (map (partial nth rows) irs)))
                         (group-by (comp (juxt :schema :key-name) (partial nth rows))
                                   (filter (comp :published (partial nth rows)) (range (count rows))))))]
      (is (some #(shared % (fn [rs] (and (some :archived rs) (some (complement :archived) rs)))) tables)
          "an archived and a live published table of one key")
      (is (some #(shared % (fn [rs] (< 1 (count (filter :archived rs))))) tables)
          "two archived published tables of one key")
      (is (some #(shared % (fn [rs] (and (some (comp #{:library} :place) rs) (some (comp #{:outside} :place) rs))))
                tables)
          "two published tables of one key, one outside the Library")
      (is (some (fn [rows] (some #(and (:archived %) (str/includes? (:key-name %) "__mbarchiv__")) rows)) tables)
          "an archived table whose original name looks like an archived name"))))

(deftest world-gen-coverage-test
  (testing "the generated worlds hold the cases that scope must decide"
    (let [worlds (mapv #(fold (gen/generate world-gen 20 %)) (range 50))
          some-c (fn [pred] (some #(some pred (:collections %)) worlds))
          some-i (fn [pred] (some #(some pred (:items %)) worlds))]
      (is (some-c #(int? (:parent %))) "a collection inside a generated collection")
      (is (some-c #(and (int? (:parent %)) (= :library (:root %)))) "a nested collection in the Library")
      (is (some-c #(and (:archived %) (= :library (:root %)))) "an archived Library collection")
      (is (some-c #(= :personal (:root %))) "a collection in a personal collection")
      (is (some-i #(and (nil? (:place %)) (= :transform (:kind %)))) "a transform at the root level")
      (is (some-i #(and (nil? (:place %)) (= :metric (:kind %)))) "a metric at the root level")
      (is (some-i #(and (:archived %) (= :transform (:kind %)))) "a transform in an archived collection")
      (is (some-i #(and (:archived %) (= :timeline (:kind %)))) "an archived timeline")
      (is (some #(seq (:tests %)) worlds) "a transform test")
      (is (some (fn [{:keys [items tests]}]
                  (some #(:archived (some (fn [i] (when (= (:transform %) (:entity-id i)) i)) items)) tests))
                worlds)
          "a test of a transform in an archived collection")
      (is (not-any? (fn [{:keys [items collections]}]
                      (some #(and (:place %) (not (:archived %)) (:archived (nth collections (:place %)))) items))
                    worlds)
          "never an unarchived item in an archived collection"))))
