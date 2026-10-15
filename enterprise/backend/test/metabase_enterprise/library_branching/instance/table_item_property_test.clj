(ns metabase-enterprise.library-branching.instance.table-item-property-test
  "The laws of `write!` and `current` for segments and measures, as property tests: PutGet (current after a write
  returns the written content, also after earlier writes of other content to the same identity, on the same table or
  another one) and GetPut (a write of the current content changes no row). Each trial writes in a transaction that
  rolls back.

  The generators are constructive: a definition is one that a real segment or measure of the trial's world has, on
  the table that the item names as its place. A value that depends on the trial's app DB rows is a keyword that
  [[resolve-item]] replaces, so the generators filter nothing, and a shrunk case has fewer writes and the first value
  of each choice."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [clojure.walk :as walk]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- The world ---------------------------------------------------

(defn- table-query [mp table] (lib/query mp (lib.metadata/table mp (mt/id table))))

(defn- below [mp table field n]
  (lib/filter (table-query mp table) (lib/< (lib.metadata/field mp (mt/id table field)) n)))

(defn- sum-of [mp table field]
  (lib/aggregate (table-query mp table) (lib/sum (lib.metadata/field mp (mt/id table field)))))

(defn- table-key
  [table]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(t2/select-one-fn :name :model/Database (mt/id)) schema name]))

(defn- do-with-world!
  "Calls `f` with `{keyword value}`, the values of the keywords of the generated items for the tables and definitions
  of this call, in a transaction that rolls back."
  [f]
  (collections.tu/with-library [{:keys [data]}]
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/TableUserSettings _  {:table_id (mt/id :venues) :is_published true :collection_id (:id data)}
                     :model/TableUserSettings _  {:table_id (mt/id :checkins) :is_published true :collection_id (:id data)}
                     :model/Segment           s1 {:table_id (mt/id :venues) :name "s1" :definition (below mp :venues :price 2)}
                     :model/Segment           s2 {:table_id (mt/id :venues) :name "s2" :definition (below mp :venues :latitude 30)}
                     :model/Segment           s3 {:table_id (mt/id :checkins) :name "s3" :definition (below mp :checkins :user_id 3)}
                     :model/Measure           m1 {:table_id (mt/id :venues) :name "m1" :definition (sum-of mp :venues :price)}
                     :model/Measure           m2 {:table_id   (mt/id :venues) :name "m2"
                                                  :definition (lib/aggregate (table-query mp :venues)
                                                                             (lib/sum-where (lib.metadata/field mp (mt/id :venues :price))
                                                                                            (lib.metadata/segment mp (:id s1))))}
                     :model/Measure           m3 {:table_id (mt/id :checkins) :name "m3" :definition (sum-of mp :checkins :user_id)}]
        (let [store      #(get app-db/kind-stores %)
              definition (fn [kind row] (get-in (instance/current (store kind) (:entity_id row)) [:attrs :definition]))]
          (t2/with-transaction [_ nil {:rollback-only true}]
            (f {::venues   (table-key :venues)
                ::checkins (table-key :checkins)
                ::s1       (definition :segment s1)
                ::s2       (definition :segment s2)
                ::s3       (definition :segment s3)
                ::m1       (definition :measure m1)
                ::m2       (definition :measure m2)
                ::m3       (definition :measure m3)})))))))

(defn- resolve-item
  "`item` with each keyword of this namespace replaced by its value in `world`."
  [world item]
  (walk/postwalk #(if (and (keyword? %) (= (namespace ::here) (namespace %))) (get world %) %) item))

;;; --------------------------------------------------- Generators --------------------------------------------------

(defn- optional [g] (gen/one-of [(gen/return nil) g]))

(defn- with-attrs
  [item attrs]
  (assoc item :attrs (into {} (remove (comp nil? val)) attrs)))

(def ^:private definitions
  "The definitions of the world on each table, by kind."
  {:segment {::venues [::s1 ::s2] ::checkins [::s3]}
   :measure {::venues [::m1 ::m2] ::checkins [::m3]}})

(defn- table-and-definition-gen
  [kind]
  (gen/bind (gen/elements [::venues ::checkins])
            (fn [table] (gen/tuple (gen/return table) (gen/elements (get-in definitions [kind table]))))))

(def ^:private segment-gen
  (gen/let [item-name    (gen/elements ["Cheap" "A segment's name" "Für alle"])
            [table d]    (table-and-definition-gen :segment)
            desc         (optional (gen/elements ["Cheap places." "Notes"]))
            caveats      (optional (gen/return "Old rows."))
            interest     (optional (gen/return "Look here."))
            getting      (optional (gen/return true))]
    (with-attrs {:kind :segment :name item-name :place table}
      {:definition d :description desc :caveats caveats :points_of_interest interest :show_in_getting_started getting})))

(def ^:private measure-gen
  (gen/let [item-name (gen/elements ["Total" "A measure's name"])
            [table d] (table-and-definition-gen :measure)
            desc      (optional (gen/elements ["The sum." "Notes"]))]
    (with-attrs {:kind :measure :name item-name :place table}
      {:definition d :description desc})))

;;; ---------------------------------------------------- Property ----------------------------------------------------

(defn- rows
  [id]
  [(t2/select :segment :entity_id id)
   (t2/select :measure :entity_id id)])

(defn- laws-hold!
  "True iff each write of the generated `items` to identity `id` of `kind` reads back with current (PutGet), and a
  write of the content that current then returns changes no row (GetPut)."
  [kind id items]
  (do-with-world!
   (fn [world]
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

(defspec segment-laws-test trials
  (prop/for-all [items (gen/vector segment-gen 1 3)]
    (laws-hold! :segment "lbGenSegment000000001" items)))

(defspec measure-laws-test trials
  (prop/for-all [items (gen/vector measure-gen 1 3)]
    (laws-hold! :measure "lbGenMeasure000000001" items)))

(deftest generators-cover-the-cases-test
  (testing "the generators give the cases that the laws must hold for"
    (let [segments (gen/sample (gen/vector segment-gen 2 3) 60)
          measures (gen/sample (gen/vector measure-gen 2 3) 60)]
      (is (some #(not= (:place (first %)) (:place (second %))) segments) "a segment that moves to another table")
      (is (some #(not= (:place (first %)) (:place (second %))) measures) "a measure that moves to another table")
      (is (some #(some (fn [i] (get-in i [:attrs :show_in_getting_started])) %) segments) "a segment in getting started")
      (is (some #(some (fn [i] (= ::m2 (get-in i [:attrs :definition]))) %) measures) "a measure that uses a segment"))))
