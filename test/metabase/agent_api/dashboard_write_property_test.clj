(ns metabase.agent-api.dashboard-write-property-test
  "What has to hold for *any* op list, not just the ones somebody thought to write a test for.

   The compiler's job is to turn a list a model wrote into a save the app accepts, and the app's rules about a
   dashboard are not negotiable: once a dashboard has a tab, every card on it is on some tab; a card sits inside
   the 24-column grid; the negative ids the compile invents are resolved to real ones by the save, never persisted.
   A hand-written test proves those for the sequence it happens to name. These generate the sequence."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(def ^:private tab-names ["One" "Two" "Three"])

(defn- op-gen
  "A generator of ops that only ever name things that exist: a card the fixture made, and a tab by a name from a
   fixed vocabulary. An op naming a card or tab that is not there is a *refusal*, which is tested elsewhere — what
   is being generated here is the space of lists the compiler is supposed to accept."
  [card-id]
  (gen/one-of
   [(gen/return {:op "add_card" :card_id card-id})
    ;; Prose is non-blank: a heading with no text is a heading nobody asked for, and the schema says so.
    (gen/fmap (fn [text] {:op "add_heading" :text text}) (gen/not-empty gen/string-alphanumeric))
    (gen/fmap (fn [text] {:op "add_text" :markdown text}) (gen/not-empty gen/string-alphanumeric))
    (gen/fmap (fn [tab] {:op "add_tab" :name tab}) (gen/elements tab-names))
    (gen/fmap (fn [[tab size]] {:op    "add_card" :card_id card-id :tab tab
                                :size  {:size_x size :size_y 3}})
              (gen/tuple (gen/elements tab-names) (gen/choose 1 24)))]))

(defn- unique-tabs
  "The op list with its `add_tab`s deduplicated. Two tabs of the same name is legal but makes `tab: \"One\"`
   ambiguous — the compiler refuses it by design, and a generator that produced it would be testing the refusal
   rather than the invariants."
  [ops]
  (first
   (reduce (fn [[kept seen] {:keys [op] tab-name :name :as o}]
             (cond
               (not= "add_tab" op) [(conj kept o) seen]
               (seen tab-name)     [kept seen]
               :else               [(conj kept o) (conj seen tab-name)]))
           [[] #{}]
           ops)))

(defn- reachable-ops
  "The op list with every op that names a tab dropped until a tab exists to name. A `tab:` before the first
   `add_tab` is a 404 by design."
  [ops]
  (let [tabs (into #{} (comp (filter #(= "add_tab" (:op %))) (map :name)) ops)]
    (if (seq tabs)
      ;; Every tab named by an op is added by some op in the list; order still matters, so drop the ops whose tab
      ;; has not been added yet.
      (first
       (reduce (fn [[kept added] {:keys [op tab] tab-name :name :as o}]
                 (cond
                   (= "add_tab" op)          [(conj kept o) (conj added tab-name)]
                   (and tab (not (added tab))) [kept added]
                   :else                     [(conj kept o) added]))
               [[] #{}]
               ops))
      (mapv #(dissoc % :tab) ops))))

(defn- op-list-gen
  [card-id]
  (gen/fmap (comp reachable-ops unique-tabs)
            (gen/vector (op-gen card-id) 1 8)))

(defn- cells
  "Every grid cell a dashcard occupies, as `[tab row col]`."
  [dashcard]
  (let [{:keys [dashboard_tab_id row col size_x size_y]} dashcard]
    (for [r (range row (+ row size_y))
          c (range col (+ col size_x))]
      [dashboard_tab_id r c])))

(defspec random-op-lists-uphold-the-dashboard-s-invariants-test 30
  (prop/for-all [_ (gen/return nil)]
    ;; test.check runs the property, not a fixture, so the dashboard is built per trial inside it.
    (mt/with-temp [:model/Card      {card-id :id} {:display :table}
                   :model/Dashboard {dash-id :id} {}]
      (let [ops       (gen/generate (op-list-gen card-id))
            response  (mt/user-http-request :crowberto :post 200 "agent/v2/dashboard-write"
                                            {:method "update" :id dash-id :ops ops})
            saved     (t2/select :model/DashboardCard :dashboard_id dash-id)
            saved-tabs (t2/select :model/DashboardTab :dashboard_id dash-id)]
        (and
         ;; Every op landed: the list is a list of adds, so the dashboard has one dashcard per add.
         (= (count (remove #(= "add_tab" (:op %)) ops)) (count saved))
         (= (count (filter #(= "add_tab" (:op %)) ops)) (count saved-tabs))
         ;; The temp ids the compile invented were resolved by the save. Nothing negative was persisted, and
         ;; nothing negative is handed back to the caller to name in the next call.
         (every? pos? (map :id saved))
         (every? pos? (map :id saved-tabs))
         (every? pos? (map :id (:dashcards response)))
         ;; Once a dashboard has a tab, every card on it is on a tab. The app refuses the save otherwise, so a
         ;; compiler that got this wrong would 400 rather than corrupt — but it would 400 on a list the model was
         ;; entitled to write.
         (if (seq saved-tabs)
           (every? (comp some? :dashboard_tab_id) saved)
           (every? (comp nil? :dashboard_tab_id) saved))
         ;; Autoplace never overlaps, and never runs off the grid.
         (let [occupied (mapcat cells saved)]
           (and (= (count occupied) (count (distinct occupied)))
                (every? #(<= (+ (:col %) (:size_x %)) 24) saved)
                (every? #(<= 0 (:row %)) saved))))))))
