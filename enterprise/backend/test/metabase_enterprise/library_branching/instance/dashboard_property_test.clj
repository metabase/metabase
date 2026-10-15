(ns metabase-enterprise.library-branching.instance.dashboard-property-test
  "The laws of `write!` and `current` for dashboards, as property tests: PutGet (current after a write returns the
  written content, also after earlier writes of other content to the same identity) and GetPut (a write of the
  current content changes no row). Each trial writes in a transaction that rolls back.

  The generators are constructive: a value that depends on the trial's app DB rows (a card, a field) is a keyword
  that [[resolve-item]] replaces, so the generators filter nothing, and a shrunk case has fewer writes, fewer tabs and
  cards, and the first value of each choice."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [clojure.walk :as walk]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.dashboard :as format.dashboard]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defn- venues-query
  "A query of all venues."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- count-query
  "The count of the venues."
  []
  (lib/aggregate (venues-query) (lib/count)))

;;; ---------------------------------------------------- The world ---------------------------------------------------

(defn- field-key
  [table field]
  (let [{:keys [schema name]} (t2/select-one :model/Table (mt/id table))]
    [(t2/select-one-fn :name :model/Database (mt/id)) schema name (t2/select-one-fn :name :model/Field (mt/id table field))]))

(defn- do-with-world!
  "Calls `f` with `{keyword value}`, the values of the keywords of the generated items for the rows of this call, in a
  transaction that rolls back."
  [f]
  (collections.tu/with-library [{:keys [library metrics]}]
    (let [query (count-query)]
      (mt/with-temp [:model/Collection dashboards {:name     "Dashboards" :type "library-dashboards"
                                                   :location (str (:location library) (:id library) "/")}
                     :model/Collection more       {:name     "More dashboards" :type "library-dashboards"
                                                   :location (str (:location library) (:id library) "/" (:id dashboards) "/")}
                     :model/Card       m1         {:name "m1" :type :metric :dataset_query query :collection_id (:id metrics)}
                     :model/Card       m2         {:name "m2" :type :metric :dataset_query query :collection_id (:id metrics)}
                     :model/Card       model      {:name "Venues" :type :model :dataset_query (venues-query)}
                     :model/Action     action     {:type :implicit :name "Create a venue" :model_id (:id model)}]
        (t2/with-transaction [_ nil {:rollback-only true}]
          (f {::dashboards  (:entity_id dashboards)
              ::more        (:entity_id more)
              ::m1          (:entity_id m1)
              ::m2          (:entity_id m2)
              ::action      (:entity_id action)
              ::name        (field-key :venues :name)
              ::category-id (field-key :venues :category_id)
              ::price       (field-key :venues :price)}))))))

(defn- resolve-item
  "`item` with each keyword of this namespace replaced by its value in `world`."
  [world item]
  (walk/postwalk #(if (and (keyword? %) (= (namespace ::here) (namespace %))) (get world %) %) item))

;;; --------------------------------------------------- Generators --------------------------------------------------

(defn- optional [g] (gen/one-of [(gen/return nil) g]))

(defn- present [m] (into {} (remove (comp nil? val)) m))

(def ^:private parameter-gen
  (gen/fmap (fn [[t source]]
              (present {:name "Filter" :slug "filter" :type t
                        :values_source_type   (when source "card")
                        :values_source_config (when source {:card_id ::m2 :value_field ["field" ::name nil]})}))
            (gen/tuple (gen/elements ["category" "string/="]) (optional (gen/return true)))))

(def ^:private dashcard-choice-gen
  (gen/let [what     (gen/elements [:card :action :text])
            tab      gen/nat
            [row col] (gen/tuple (gen/choose 0 8) (gen/choose 0 8))
            [w h]    (gen/tuple (gen/choose 1 12) (gen/choose 1 6))
            card     (gen/elements [::m1 ::m2])
            mapping? gen/boolean
            series   (gen/vector (gen/elements [::m1 ::m2]) 0 2)
            field    (gen/elements [::category-id ::price])]
    {:what what :tab tab :row row :col col :size_x w :size_y h :card card :mapping? mapping? :series series
     :field field}))

(defn- dashcard
  "The dashboard card of choice `c`, with id `id`, on a tab of `tabs`, mapped to parameter `param` (when there is one)."
  [id tabs param {:keys [what tab row col size_x size_y card mapping? series field]}]
  (present
   (merge {:id               id
           :dashboard_tab_id (when (seq tabs) (:id (nth tabs (mod tab (count tabs)))))
           :row              row
           :col              col
           :size_x           size_x
           :size_y           size_y}
          (case what
            :card   {:card_id            card
                     :series             (not-empty series)
                     :parameter_mappings (when (and mapping? param)
                                           [{:parameter_id param :card_id card
                                             :target       ["dimension" ["field" field nil]]}])}
            :action {:action_id ::action}
            :text   {:visualization_settings {:text "Notes" :virtual_card {:display "text"}}}))))

(def ^:private dashboard-gen
  (gen/let [item-name   (gen/elements ["Overview" "A dashboard's name" "Für alle"])
            place       (gen/elements [::dashboards ::more])
            description (optional (gen/elements ["At a glance." "Notes"]))
            width       (optional (gen/return "full"))
            auto        (optional (gen/return false))
            tab-names   (gen/vector (gen/elements ["One" "Two" "Three"]) 0 3)
            ;; A small pool of ids, so that a later write keeps, moves or removes the tabs and cards of an earlier one.
            tab-ids     (gen/shuffle ["lbGenTaB0000000000001" "lbGenTaB0000000000002" "lbGenTaB0000000000003"])
            params      (gen/vector parameter-gen 0 2)
            choices     (gen/vector dashcard-choice-gen 0 4)
            card-ids    (gen/shuffle (mapv #(format "lbGenDcArD00000000%03d" %) (range 1 5)))]
    (let [tabs       (mapv (fn [tab-name id] {:id id :name tab-name}) tab-names tab-ids)
          parameters (vec (map-indexed (fn [i p] (assoc p :id (str "p" i))) params))
          dashcards  (mapv (fn [id c] (dashcard id tabs (:id (first parameters)) c)) card-ids choices)]
      {:kind  :dashboard
       :name  item-name
       :place place
       :attrs (present {:description description
                        :width       width
                        :auto_apply_filters auto
                        :tabs        (not-empty tabs)
                        :parameters  (not-empty parameters)
                        :dashcards   (not-empty (format.dashboard/dashcard-order
                                                 tabs (mapv format.dashboard/normal-dashcard dashcards)))})})))

;;; ---------------------------------------------------- Property ----------------------------------------------------

(defn- rows
  [id]
  (let [dashboard (t2/select-one :report_dashboard :entity_id id)
        dashcards (t2/select :report_dashboardcard :dashboard_id (:id dashboard) {:order-by [:id]})]
    [dashboard
     (t2/select :dashboard_tab :dashboard_id (:id dashboard) {:order-by [:id]})
     dashcards
     (when (seq dashcards) (t2/select :dashboardcard_series :dashboardcard_id [:in (map :id dashcards)] {:order-by [:id]}))
     (t2/select :parameter_card :parameterized_object_type "dashboard" :parameterized_object_id (:id dashboard)
                {:order-by [:id]})]))

(defn- laws-hold!
  "True iff each write of the generated `items` to identity `id` reads back with current (PutGet), and a write of the
  content that current then returns changes no row (GetPut)."
  [id items]
  (do-with-world!
   (fn [world]
     (let [store   (get app-db/kind-stores :dashboard)
           put-get (every? (fn [item]
                             (let [item (resolve-item world item)
                                   item (assoc item :refs (format.kinds/refs :dashboard id (:attrs item)))]
                               (instance/write! store id item)
                               (= {:state :live :content item} (instance/current store id))))
                           items)
           before  (rows id)]
       (instance/write! store id (:content (instance/current store id)))
       (and put-get (= before (rows id)))))))

(defspec dashboard-laws-test 25
  (prop/for-all [items (gen/vector dashboard-gen 1 3)]
    (laws-hold! "lbGenDaShBoArD0000001" items)))

(deftest generators-cover-the-cases-test
  (testing "the generator gives the cases that the laws must hold for"
    (let [runs  (gen/sample (gen/vector dashboard-gen 2 3) 60)
          cards (fn [item] (get-in item [:attrs :dashcards]))
          ids   (fn [item k] (set (map :id (get-in item [:attrs k]))))]
      (is (some #(seq (cards (first %))) runs) "a dashboard with cards")
      (is (some #(some :series (cards (first %))) runs) "a card with series")
      (is (some #(some :parameter_mappings (cards (first %))) runs) "a card with a parameter mapping")
      (is (some #(some :action_id (cards (first %))) runs) "an action button")
      (is (some #(some :values_source_config (get-in (first %) [:attrs :parameters])) runs)
          "a parameter whose values come from a card")
      (is (some #(seq (set/intersection (ids (first %) :dashcards) (ids (second %) :dashcards))) runs)
          "a card that a later write keeps")
      (is (some #(seq (set/difference (ids (first %) :tabs) (ids (second %) :tabs))) runs)
          "a tab that a later write removes")
      (is (some #(not= (:place (first %)) (:place (second %))) runs) "a dashboard that moves"))))
