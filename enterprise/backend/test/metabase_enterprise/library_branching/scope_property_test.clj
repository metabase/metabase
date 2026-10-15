(ns metabase-enterprise.library-branching.scope-property-test
  "Property tests of scope against a reference model: generated trees of collections and items, written to the app DB
  in a transaction that rolls back, and the scope that the reference model computes from the same choices."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ The generated world ---------------------------------------------

(def ^:private root-places
  "The places of a generated collection at the root level: the Library root, a plain collection, a personal
  collection, or the root of a namespace."
  [:library :plain :personal :transforms :snippets :data-actions :data-apps])

(def ^:private item-kinds [:metric :question :dashboard :snippet :transform :action])

(def ^:private archive-gen
  (gen/frequency [[4 (gen/return false)] [1 (gen/return true)]]))

(def ^:private world-gen
  "`{:collections [{:parent n :archive bool}] :items [{:kind k :place n :archive bool}]}`. Each choice is folded into a
  world by [[fold]], so the generator filters nothing, and a shrunk world has fewer collections and items, at the root
  places."
  (gen/sized
   (fn [size]
     (gen/hash-map
      :collections (gen/vector (gen/hash-map :parent gen/nat :archive archive-gen) 0 (min size 12))
      :items       (gen/vector (gen/hash-map :kind (gen/elements item-kinds) :place gen/nat :archive archive-gen)
                               0 (min size 20))))))

(defn- entity-id
  [prefix i]
  (format "lb%s%018d" prefix i))

(defn- fold
  "The world of `choices`. Collection i has its parent among the root places and the collections before it; it takes
  the namespace of its root, and is archived iff it or an ancestor is (archive is closed downward). Item i is at the
  root level or in a collection, and is archived iff it is or its collection is; a transform has no archived flag of
  its own."
  [{:keys [collections items]}]
  (let [colls (reduce (fn [acc [i {:keys [parent archive]}]]
                        (let [candidates (into root-places (range i))
                              p          (nth candidates (mod parent (count candidates)))
                              up         (when (int? p) (nth acc p))]
                          (conj acc {:entity-id (entity-id "c" i)
                                     :parent    p
                                     :root      (if up (:root up) p)
                                     :archived  (boolean (or archive (:archived up)))})))
                      []
                      (map-indexed vector collections))]
    {:collections colls
     :items       (vec (map-indexed
                        (fn [i {:keys [kind place archive]}]
                          (let [candidates (into [nil] (range (count colls)))
                                p          (nth candidates (mod place (count candidates)))]
                            {:entity-id (entity-id "i" i)
                             :kind      kind
                             :place     p
                             :archived  (boolean (or (and archive (not= :transform kind))
                                                     (some-> p (->> (nth colls)) :archived)))}))
                        items))}))

;;; ------------------------------------------------ The reference model ---------------------------------------------

(def ^:private root-level-kinds
  "The item kinds of the generated world whose items at the root level are in scope."
  #{:snippet :transform :action})

(defn- expected-scope
  "`{kind #{entity-id}}`: the in-scope identities of `world` by the rules of scope, for the kinds of the world."
  [{:keys [collections items]}]
  (let [coll-in? (fn [c] (and (not (:archived c))
                              (contains? #{:library :transforms :snippets :data-actions :data-apps} (:root c))))]
    (merge-with into
                (into {} (map (fn [k] [k #{}])) (cons :collection item-kinds))
                {:collection (into #{} (comp (filter coll-in?) (map :entity-id)) collections)}
                (reduce (fn [acc {:keys [entity-id kind place archived]}]
                          (if (and (not archived)
                                   (if place
                                     (coll-in? (nth collections place))
                                     (contains? root-level-kinds kind)))
                            (update acc kind (fnil conj #{}) entity-id)
                            acc))
                        {}
                        items))))

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
  [{:keys [entity-id kind archived]} collection-id]
  (let [user (mt/user->id :crowberto)
        base {:name entity-id :entity_id entity-id :collection_id collection-id}]
    (case kind
      (:metric :question) (t2/insert! :report_card (merge base {:type                   (name kind)
                                                                :archived               archived
                                                                :display                "table"
                                                                :dataset_query          "{}"
                                                                :visualization_settings "{}"
                                                                :creator_id             user
                                                                :database_id            (mt/id)
                                                                :created_at             (now)
                                                                :updated_at             (now)}))
      :dashboard          (t2/insert! :report_dashboard (merge base {:archived   archived
                                                                     :parameters "[]"
                                                                     :creator_id user
                                                                     :created_at (now)
                                                                     :updated_at (now)}))
      :snippet            (t2/insert! :native_query_snippet (merge base {:archived   archived
                                                                         :content    "1 = 1"
                                                                         :creator_id user}))
      :transform          (t2/insert! :transform (merge base {:source      "{}"
                                                              :source_type "query"
                                                              :target      "{}"}))
      :action             (t2/insert! :action (merge base {:archived archived :type "http"})))))

(defn- actual-scope
  "The in-scope identities of `world`, by kind, after it is written."
  [world]
  (let [ours (into #{} (map :entity-id) (concat (:collections world) (:items world)))]
    (-> (scope/scope-ids)
        (select-keys (cons :collection item-kinds))
        (update-vals #(into #{} (filter ours) %)))))

(defn- check-world!
  "Writes `world` in a transaction that rolls back, and returns `{:expected :actual :counts-agree?}`."
  [world roots]
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids (insert-collections! world roots)]
      (doseq [{:keys [place] :as item} (:items world)]
        (insert-item! item (some-> place (->> (nth ids)) :id)))
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
      (is (not-any? (fn [{:keys [items collections]}]
                      (some #(and (:place %) (not (:archived %)) (:archived (nth collections (:place %)))) items))
                    worlds)
          "never an unarchived item in an archived collection"))))
