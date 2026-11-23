(ns metabase.queries-rest.api.card-positions-test
  "Positions of the rows of a Collection after Cards move, pinned to what moving the Cards one by one left."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private models [:model/Card :model/Dashboard :model/Pulse :model/Document])

(defn- insert-row! [coll-id [kind nm pos]]
  (let [m (case kind :c :model/Card :d :model/Dashboard :p :model/Pulse :o :model/Document)]
    [nm (t2/insert-returning-pk! m (merge (mt/with-temp-defaults m) {:name nm :collection_id coll-id :collection_position pos}))]))

(defn- snapshot [coll-id]
  (vec (sort-by (juxt #(or (second %) -1) first)
                (mapcat (fn [m] (map (fn [r] [(:name r) (:collection_position r)])
                                     (t2/select [m :name :collection_position] :collection_id coll-id)))
                        models))))

(def ^:private scenarios
  {"S1 interleaved src+dest, request order c6 c1, plus unpinned u"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:p "p3" 3] [:c "c4" 4] [:o "o5" 5] [:c "c6" 6] [:c "u" nil]]}
    :dest [[:c "x" 1] [:d "y" 2] [:p "z" 3] [:o "w" 4]] :move ["c6" "c1" "u"]}
   "S2 dest pinned at same positions as moved"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:c "c3" 3] [:c "c4" 4]]}
    :dest [[:c "x1" 1] [:c "x2" 2] [:c "x3" 3] [:d "y4" 4]] :move ["c1" "c3"]}
   "S3 two sources"
   {:src {:A [[:c "a1" 1] [:c "a2" 2] [:p "a3" 3] [:c "a4" 4]] :B [[:c "b1" 1] [:o "b2" 2] [:c "b3" 3] [:c "b4" 4]]}
    :dest [[:c "x" 1] [:c "z" 2]] :move ["b3" "a4" "a1" "b1"]}
   "S4 dest empty"
   {:src {:A [[:c "c1" 1] [:c "c2" 2] [:d "d3" 3] [:c "c4" 4]]} :dest [] :move ["c4" "c2"]}
   "S5 dest holds only non-card pinned rows"
   {:src {:A [[:c "c1" 1] [:c "c2" 2]]} :dest [[:d "y" 1] [:p "z" 2]] :move ["c1" "c2"]}
   "S6 adjacent and first"
   {:src {:A [[:c "c1" 1] [:c "c2" 2] [:c "c3" 3] [:d "d4" 4] [:c "c5" 5] [:p "p6" 6]]} :dest [[:c "x" 1]] :move ["c1" "c2" "c3"]}
   "S8 gaps first middle last"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:p "p3" 3] [:c "c4" 4] [:c "c5" 5] [:c "c6" 6] [:o "o7" 7] [:c "c8" 8] [:d "d9" 9]]} :dest [[:c "x" 1] [:c "z" 2]] :move ["c1", "c6", "c8"] :only :card-collections}
   "S9 gaps adjacent"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:p "p3" 3] [:c "c4" 4] [:c "c5" 5] [:c "c6" 6] [:o "o7" 7] [:c "c8" 8] [:d "d9" 9]]} :dest [[:c "x" 1] [:c "z" 2]] :move ["c4", "c5"] :only :card-collections}
   "S10 gaps last"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:p "p3" 3] [:c "c4" 4] [:c "c5" 5] [:c "c6" 6] [:o "o7" 7] [:c "c8" 8] [:d "d9" 9]]} :dest [[:c "x" 1] [:c "z" 2]] :move ["c8"] :only :card-collections}
   "S11 gaps first"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:p "p3" 3] [:c "c4" 4] [:c "c5" 5] [:c "c6" 6] [:o "o7" 7] [:c "c8" 8] [:d "d9" 9]]} :dest [[:c "x" 1] [:c "z" 2]] :move ["c1"] :only :card-collections}
   "S12 gaps all cards"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:p "p3" 3] [:c "c4" 4] [:c "c5" 5] [:c "c6" 6] [:o "o7" 7] [:c "c8" 8] [:d "d9" 9]]} :dest [[:c "x" 1] [:c "z" 2]] :move ["c1", "c4", "c5", "c6", "c8"] :only :card-collections}
   "S7 move all in source with rows above"
   {:src {:A [[:c "c1" 1] [:d "d2" 2] [:c "c3" 3] [:o "o4" 4] [:p "p5" 5]]} :dest [[:c "x" 1] [:c "x2" 2]] :move ["c3" "c1"]}})

(defn- run-scenario! [endpoint to-dashboard? {:keys [src dest move]}]
  (let [dcoll (t2/insert-returning-pk! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:name (str "dest " (random-uuid))}))
        scolls (into {} (map (fn [[k _]] [k (t2/insert-returning-pk! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:name (str "src " k (random-uuid))}))]) src))
        ids   (into {} (mapcat (fn [[k rows]] (map #(insert-row! (scolls k) %) rows)) src))
        _     (doseq [r dest] (insert-row! dcoll r))
        dash  (when to-dashboard? (t2/insert-returning-pk! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:name "DASH" :collection_id dcoll})))
        body  (cond-> {:card_ids (mapv ids move)}
                (= endpoint :cards-move) (assoc (if to-dashboard? :dashboard_id :collection_id) (if to-dashboard? dash dcoll))
                (= endpoint :card-collections) (assoc :collection_id dcoll))
        _     (mt/user-http-request :crowberto :post 200 (if (= endpoint :cards-move) "cards/move" "card/collections") body)]
    {:src (into (sorted-map) (map (fn [[k c]] [k (snapshot c)]) scolls))
     :dest (snapshot dcoll)
     :moved (mapv (fn [nm] (let [c (t2/select-one [:model/Card :collection_id :dashboard_id :collection_position] :id (ids nm))]
                             [nm (:collection_position c) (= dcoll (:collection_id c)) (some? (:dashboard_id c))])) move)}))

(def ^:private expected
  [["S1 interleaved src+dest, request order c6 c1, plus unpinned u" :cards-move false
    {:src {:A [["d2" 1] ["p3" 2] ["c4" 3] ["o5" 4]]}, :dest [["u" nil] ["c1" 1] ["x" 2] ["y" 3] ["z" 4] ["w" 5] ["c6" 7]], :moved [["c6" 7 true false] ["c1" 1 true false] ["u" nil true false]]}]
   ["S1 interleaved src+dest, request order c6 c1, plus unpinned u" :cards-move true
    {:src {:A [["d2" 1] ["p3" 2] ["c4" 3] ["o5" 4]]}, :dest [["DASH" nil] ["u" nil] ["c1" 1] ["x" 2] ["y" 3] ["z" 4] ["w" 5] ["c6" 7]], :moved [["c6" 7 true true] ["c1" 1 true true] ["u" nil true true]]}]
   ["S1 interleaved src+dest, request order c6 c1, plus unpinned u" :card-collections false
    {:src {:A [["d2" 1] ["p3" 2] ["c4" 3] ["o5" 4]]}, :dest [["u" nil] ["x" 1] ["c1" 2] ["y" 2] ["c6" 3] ["z" 3] ["w" 4]], :moved [["c6" 3 true false] ["c1" 2 true false] ["u" nil true false]]}]
   ["S10 gaps last" :card-collections false
    {:src {:A [["c1" 1] ["d2" 2] ["p3" 3] ["c4" 4] ["c5" 5] ["c6" 6] ["o7" 7] ["d9" 8]]}, :dest [["x" 1] ["z" 2] ["c8" 3]], :moved [["c8" 3 true false]]}]
   ["S11 gaps first" :card-collections false
    {:src {:A [["d2" 1] ["p3" 2] ["c4" 3] ["c5" 4] ["c6" 5] ["o7" 6] ["c8" 7] ["d9" 8]]}, :dest [["x" 1] ["z" 2] ["c1" 3]], :moved [["c1" 3 true false]]}]
   ["S12 gaps all cards" :card-collections false
    {:src {:A [["d2" 1] ["p3" 2] ["o7" 3] ["d9" 4]]}, :dest [["x" 1] ["z" 2] ["c1" 3] ["c4" 4] ["c5" 5] ["c6" 6] ["c8" 7]], :moved [["c1" 3 true false] ["c4" 4 true false] ["c5" 5 true false] ["c6" 6 true false] ["c8" 7 true false]]}]
   ["S2 dest pinned at same positions as moved" :cards-move false
    {:src {:A [["d2" 1] ["c4" 2]]}, :dest [["c1" 1] ["c3" 2] ["x1" 3] ["x2" 4] ["x3" 5] ["y4" 6]], :moved [["c1" 1 true false] ["c3" 2 true false]]}]
   ["S2 dest pinned at same positions as moved" :cards-move true
    {:src {:A [["d2" 1] ["c4" 2]]}, :dest [["DASH" nil] ["c1" 1] ["c3" 2] ["x1" 3] ["x2" 4] ["x3" 5] ["y4" 6]], :moved [["c1" 1 true true] ["c3" 2 true true]]}]
   ["S2 dest pinned at same positions as moved" :card-collections false
    {:src {:A [["d2" 1] ["c4" 2]]}, :dest [["x1" 1] ["x2" 2] ["x3" 3] ["c1" 4] ["y4" 4] ["c3" 5]], :moved [["c1" 4 true false] ["c3" 5 true false]]}]
   ["S3 two sources" :cards-move false
    {:src {:A [["a2" 1] ["a3" 2]], :B [["b2" 1] ["b4" 2]]}, :dest [["b1" 1] ["a1" 2] ["x" 3] ["z" 4] ["b3" 5] ["a4" 6]], :moved [["b3" 5 true false] ["a4" 6 true false] ["a1" 2 true false] ["b1" 1 true false]]}]
   ["S3 two sources" :cards-move true
    {:src {:A [["a2" 1] ["a3" 2]], :B [["b2" 1] ["b4" 2]]}, :dest [["DASH" nil] ["b1" 1] ["a1" 2] ["x" 3] ["z" 4] ["b3" 5] ["a4" 6]], :moved [["b3" 5 true true] ["a4" 6 true true] ["a1" 2 true true] ["b1" 1 true true]]}]
   ["S3 two sources" :card-collections false
    {:src {:A [["a2" 1] ["a3" 2]], :B [["b2" 1] ["b4" 2]]}, :dest [["x" 1] ["z" 2] ["a1" 3] ["b1" 4] ["b3" 5] ["a4" 6]], :moved [["b3" 5 true false] ["a4" 6 true false] ["a1" 3 true false] ["b1" 4 true false]]}]
   ["S4 dest empty" :cards-move false
    {:src {:A [["c1" 1] ["d3" 2]]}, :dest [["c2" 2] ["c4" 5]], :moved [["c4" 5 true false] ["c2" 2 true false]]}]
   ["S4 dest empty" :cards-move true
    {:src {:A [["c1" 1] ["d3" 2]]}, :dest [["DASH" nil] ["c2" 2] ["c4" 5]], :moved [["c4" 5 true true] ["c2" 2 true true]]}]
   ["S4 dest empty" :card-collections false
    {:src {:A [["c1" 1] ["d3" 2]]}, :dest [["c2" 1] ["c4" 2]], :moved [["c4" 2 true false] ["c2" 1 true false]]}]
   ["S5 dest holds only non-card pinned rows" :cards-move false
    {:src {:A []}, :dest [["c2" 1] ["c1" 2] ["y" 3] ["z" 4]], :moved [["c1" 2 true false] ["c2" 1 true false]]}]
   ["S5 dest holds only non-card pinned rows" :cards-move true
    {:src {:A []}, :dest [["DASH" nil] ["c2" 1] ["c1" 2] ["y" 3] ["z" 4]], :moved [["c1" 2 true true] ["c2" 1 true true]]}]
   ["S5 dest holds only non-card pinned rows" :card-collections false
    {:src {:A []}, :dest [["c1" 1] ["y" 1] ["c2" 2] ["z" 2]], :moved [["c1" 1 true false] ["c2" 2 true false]]}]
   ["S6 adjacent and first" :cards-move false
    {:src {:A [["d4" 1] ["c5" 2] ["p6" 3]]}, :dest [["c3" 1] ["c2" 2] ["c1" 3] ["x" 4]], :moved [["c1" 3 true false] ["c2" 2 true false] ["c3" 1 true false]]}]
   ["S6 adjacent and first" :cards-move true
    {:src {:A [["d4" 1] ["c5" 2] ["p6" 3]]}, :dest [["DASH" nil] ["c3" 1] ["c2" 2] ["c1" 3] ["x" 4]], :moved [["c1" 3 true true] ["c2" 2 true true] ["c3" 1 true true]]}]
   ["S6 adjacent and first" :card-collections false
    {:src {:A [["d4" 1] ["c5" 2] ["p6" 3]]}, :dest [["x" 1] ["c1" 2] ["c2" 3] ["c3" 4]], :moved [["c1" 2 true false] ["c2" 3 true false] ["c3" 4 true false]]}]
   ["S7 move all in source with rows above" :cards-move false
    {:src {:A [["d2" 1] ["o4" 2] ["p5" 3]]}, :dest [["c1" 1] ["x" 2] ["x2" 3] ["c3" 4]], :moved [["c3" 4 true false] ["c1" 1 true false]]}]
   ["S7 move all in source with rows above" :cards-move true
    {:src {:A [["d2" 1] ["o4" 2] ["p5" 3]]}, :dest [["DASH" nil] ["c1" 1] ["x" 2] ["x2" 3] ["c3" 4]], :moved [["c3" 4 true true] ["c1" 1 true true]]}]
   ["S7 move all in source with rows above" :card-collections false
    {:src {:A [["d2" 1] ["o4" 2] ["p5" 3]]}, :dest [["x" 1] ["x2" 2] ["c1" 3] ["c3" 4]], :moved [["c3" 4 true false] ["c1" 3 true false]]}]
   ["S8 gaps first middle last" :card-collections false
    {:src {:A [["d2" 1] ["p3" 2] ["c4" 3] ["c5" 4] ["o7" 5] ["d9" 6]]}, :dest [["x" 1] ["z" 2] ["c1" 3] ["c6" 4] ["c8" 5]], :moved [["c1" 3 true false] ["c6" 4 true false] ["c8" 5 true false]]}]
   ["S9 gaps adjacent" :card-collections false
    {:src {:A [["c1" 1] ["d2" 2] ["p3" 3] ["c6" 4] ["o7" 5] ["c8" 6] ["d9" 7]]}, :dest [["x" 1] ["z" 2] ["c4" 3] ["c5" 4]], :moved [["c4" 3 true false] ["c5" 4 true false]]}]])

(deftest ^:synchronous positions-after-moving-pinned-cards-test
  (doseq [[label endpoint dashboard? positions] expected]
    (testing (str label " " endpoint (when dashboard? " to a dashboard"))
      (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Pulse :model/Document :model/Collection]
        (is (= positions (run-scenario! endpoint dashboard? (get scenarios label))))))))

(defn- pinned-move-statements
  "The statements of moving to an empty Collection, as a non-admin, `n` pinned Cards that sit one in each of `n` Collections,
  or all in one when not `distinct-sources?`, after one move as warm-up."
  [n distinct-sources?]
  (letfn [(collection! []
            (let [id (t2/insert-returning-pk! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:name (str "c " (random-uuid))}))]
              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) id)
              id))
          (move! []
            (let [sources  (if distinct-sources? (vec (repeatedly n collection!)) (vec (repeat n (collection!))))
                  card-ids (vec (map-indexed (fn [i source]
                                               (t2/insert-returning-pk! :model/Card
                                                                        (merge (mt/with-temp-defaults :model/Card)
                                                                               {:name (str "pinned " i) :collection_id source
                                                                                :collection_position (inc i)})))
                                             sources))
                  dest     (collection!)]
              (t2/with-call-count [call-count]
                (mt/user-http-request :rasta :post 200 "card/collections" {:card_ids card-ids :collection_id dest})
                (call-count))))]
    (move!)
    (move!)))

(deftest ^:synchronous pinned-cards-from-many-collections-read-positions-once-test
  (testing "POST /api/card/collections reads positions from a number of statements that does not grow with source collections"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-model-cleanup [:model/Card :model/Collection]
        (let [one-source-growth (- (pinned-move-statements 6 false) (pinned-move-statements 2 false))
              many-growth       (- (pinned-move-statements 6 true) (pinned-move-statements 2 true))]
          (is (<= many-growth one-source-growth)))))))
