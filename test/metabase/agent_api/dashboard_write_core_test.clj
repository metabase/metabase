(ns metabase.agent-api.dashboard-write-core-test
  "The v2 `dashboard_write` tool: the cards, the tabs, and the layout — the ops that compile into the one save the
   app makes.

   Two properties are asserted harder than the rest, because the tool is unusable without them:

   - **A failed call writes nothing.** The compile runs before the save, so an op that cannot be applied aborts the
     whole list. The tests do not merely assert the error — they assert the dashboard afterwards, because an error
     over a half-applied layout is worse than no tool at all.
   - **The teaching errors are the contract.** A flat `_write` schema cannot say which fields an op needs; only the
     error copy says it, and a model that gets a refusal it cannot act on retries the same call. So the copy is
     asserted, and a change to it is a change to the API."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- write!
  ([body] (write! :crowberto 200 body))
  ([user status body]
   (mt/user-http-request user :post status "agent/v2/dashboard-write" body)))

(defn- refusal
  "The message a refused call teaches with — a teaching error's body is the message itself."
  [response]
  (if (string? response) response (str (:message response))))

(defn- dashcards [dashboard-id]
  (t2/select :model/DashboardCard :dashboard_id dashboard-id))

(defn- tabs [dashboard-id]
  (t2/select :model/DashboardTab :dashboard_id dashboard-id {:order-by [[:position :asc]]}))

(defn- kinds
  "The kind of each dashcard a write returned, in order — `card`, `text`, `heading`, and so on."
  [response]
  (mapv :kind (:dashcards response)))

;;; ──────────────────────────────────────────────────────────────────
;;; create
;;; ──────────────────────────────────────────────────────────────────

(deftest creates-an-empty-dashboard-test
  (testing "a create with no ops is a dashboard with nothing on it, in the caller's personal collection"
    (mt/with-model-cleanup [:model/Dashboard]
      (let [response (write! {:method "create" :name "Q3 review"})
            saved    (t2/select-one :model/Dashboard :id (:id response))]
        (is (= "Q3 review" (:name saved)))
        (is (= (:id response) (:id saved)))
        (is (= [] (:dashcards response)))
        (is (= [] (:tabs response)))
        (testing "and it lands in the caller's own space, not in the one collection everybody sees"
          (is (= (t2/select-one-fn :id :model/Collection
                                   :personal_owner_id (mt/user->id :crowberto))
                 (:collection_id saved))))))))

(deftest creates-a-dashboard-with-cards-test
  (testing "a create carrying ops builds the whole dashboard in one call"
    (mt/with-temp [:model/Card {card-id :id} {:name "Orders" :display :table}]
      (mt/with-model-cleanup [:model/Dashboard]
        (let [response (write! {:method "create"
                                :name   "Sales"
                                :ops    [{:op "add_heading" :text "This quarter"}
                                         {:op "add_card" :card_id card-id}
                                         {:op "add_text" :markdown "Source: **finance**"}]})]
          (is (= ["heading" "card" "text"] (kinds response)))
          (testing "the response names the card each dashcard shows, so the next op is authorable from it"
            (is (= "Orders" (:card_name (second (:dashcards response))))))
          (testing "and the dashcards are really on the dashboard"
            (is (= 3 (count (dashcards (:id response)))))))))))

(deftest create-takes-no-id-test
  (testing "a create that names an id is refused: an id the caller mistyped would create a silent duplicate"
    (is (= (str "`create` mints its own id, so it takes no `id`. To change what 7 already names, pass "
                "`method: \"update\"`.")
           (refusal (write! :crowberto 400 {:method "create" :name "Sales" :id 7}))))))

(deftest create-needs-a-name-test
  (is (= "`method: \"create\"` needs `name`."
         (refusal (write! :crowberto 400 {:method "create"})))))

(deftest update-needs-an-id-test
  (is (= (str "`method: \"update\"` needs `id`. `id` names the one to change — `search` and `get_content` "
              "return it.")
         (refusal (write! :crowberto 400 {:method "update" :name "Sales"})))))

;;; ──────────────────────────────────────────────────────────────────
;;; update — the dashboard's own fields, and the layout
;;; ──────────────────────────────────────────────────────────────────

(deftest updates-only-the-fields-it-names-test
  (testing "an update changes what the call spelled out and leaves the rest of the dashboard as it was"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Sales" :description "The old description"}]
      (write! {:method "update" :id dash-id :name "Sales, 2026"})
      (let [saved (t2/select-one :model/Dashboard :id dash-id)]
        (is (= "Sales, 2026" (:name saved)))
        (is (= "The old description" (:description saved)))))))

(deftest an-update-without-ops-leaves-the-layout-alone-test
  (testing "a rename is a rename: a call with no ops sends no layout, so it cannot delete the cards it never
            mentioned"
    (mt/with-temp [:model/Card      {card-id :id} {}
                   :model/Dashboard {dash-id :id} {:name "Sales"}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id :row 0 :col 0
                                           :size_x 4 :size_y 4}]
      (write! {:method "update" :id dash-id :description "Now with a description"})
      (is (= 1 (count (dashcards dash-id)))))))

(deftest moves-and-trashes-a-dashboard-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard  {dash-id :id} {:name "Sales"}]
    (testing "`collection_id` moves it — there is no separate move tool"
      (write! {:method "update" :id dash-id :collection_id coll-id})
      (is (= coll-id (t2/select-one-fn :collection_id :model/Dashboard :id dash-id))))
    (testing "`archived` trashes it, and restores it"
      (write! {:method "update" :id dash-id :archived true})
      (is (true? (t2/select-one-fn :archived :model/Dashboard :id dash-id)))
      (write! {:method "update" :id dash-id :archived false})
      (is (false? (t2/select-one-fn :archived :model/Dashboard :id dash-id))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The card ops
;;; ──────────────────────────────────────────────────────────────────

(deftest autoplace-never-overlaps-test
  (testing "cards added without a position are laid out, not stacked at the origin"
    (mt/with-temp [:model/Card {card-id :id} {:display :table}
                   :model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    (repeat 4 {:op "add_card" :card_id card-id})})
            placed   (:dashcards response)]
        (is (= 4 (count placed)))
        (testing "no two of them share a cell"
          (let [cells (for [{:keys [row col size_x size_y]} placed
                            r (range row (+ row size_y))
                            c (range col (+ col size_x))]
                        [r c])]
            (is (= (count cells) (count (distinct cells))))))
        (testing "and none of them runs past the 24-column grid"
          (is (every? #(<= (+ (:col %) (:size_x %)) 24) placed)))))))

(deftest honors-an-explicit-position-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}]
    (let [response (write! {:method "update" :id dash-id
                            :ops    [{:op       "add_card" :card_id card-id
                                      :position {:row 3 :col 12}
                                      :size     {:size_x 6 :size_y 2}}]})]
      (is (= [{:row 3 :col 12 :size_x 6 :size_y 2}]
             (mapv #(select-keys % [:row :col :size_x :size_y]) (:dashcards response)))))))

(deftest a-card-that-runs-off-the-grid-is-refused-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}]
    (is (= (str "Op 0: A card 18 columns wide at column 20 runs past the 24-column grid. Move it left, or make "
                "it narrower with `size`. Nothing was written — fix that op and send the whole list again.")
           (refusal (write! :crowberto 400
                            {:method "update" :id dash-id
                             :ops    [{:op       "add_card" :card_id card-id
                                       :position {:row 0 :col 20}
                                       :size     {:size_x 18 :size_y 4}}]}))))
    (is (= [] (dashcards dash-id)))))

(deftest each-virtual-card-carries-its-own-content-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (let [response (write! {:method "update" :id dash-id
                            :ops    [{:op "add_text" :markdown "Some **notes**"}
                                     {:op "add_heading" :text "Revenue"}
                                     {:op "add_link" :url "https://metabase.com"}
                                     {:op "add_iframe" :src "https://metabase.com/embed"}]})
          settings (t2/select-fn->fn :id :visualization_settings :model/DashboardCard :dashboard_id dash-id)]
      (is (= ["text" "heading" "link" "iframe"] (kinds response)))
      (testing "and the content is in the visualization settings, under the virtual card the app reads"
        (let [by-kind (into {} (for [{:keys [id kind]} (:dashcards response)]
                                 [kind (settings id)]))]
          (is (= "Some **notes**" (get-in by-kind ["text" :text])))
          (is (= "Revenue" (get-in by-kind ["heading" :text])))
          (is (= {:url "https://metabase.com"} (get-in by-kind ["link" :link])))
          (is (= "https://metabase.com/embed" (get-in by-kind ["iframe" :iframe])))
          (is (= "text" (get-in by-kind ["text" :virtual_card :display]))))))))

(deftest a-link-names-one-target-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (testing "a link that names neither a url nor an entity points at nothing"
      (is (= (str "Op 0: `add_link` needs `url` or `entity`. Nothing was written — fix that op and send the "
                  "whole list again.")
             (refusal (write! :crowberto 400 {:method "update" :id dash-id :ops [{:op "add_link"}]})))))
    (testing "and one that names both would silently drop one of them"
      (is (= (str "Op 0: `add_link` takes `url` or `entity`, not both. Nothing was written — fix that op and "
                  "send the whole list again.")
             (refusal (write! :crowberto 400
                              {:method "update" :id dash-id
                               :ops    [{:op     "add_link" :url "https://metabase.com"
                                         :entity {:type "dashboard" :id 1}}]})))))))

(deftest moves-resizes-and-removes-a-card-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}
                 :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                         :row 0 :col 0 :size_x 4 :size_y 4}]
    (testing "move puts a card in another slot"
      (write! {:method "update" :id dash-id
               :ops    [{:op "move" :dashcard_id dashcard-id :position {:row 6 :col 2}}]})
      (is (= {:row 6 :col 2} (select-keys (t2/select-one :model/DashboardCard :id dashcard-id) [:row :col]))))
    (testing "resize changes its size and nothing else"
      (write! {:method "update" :id dash-id
               :ops    [{:op "resize" :dashcard_id dashcard-id :size {:size_x 8 :size_y 3}}]})
      (is (= {:row 6 :col 2 :size_x 8 :size_y 3}
             (select-keys (t2/select-one :model/DashboardCard :id dashcard-id)
                          [:row :col :size_x :size_y]))))
    (testing "remove takes it off the dashboard"
      (write! {:method "update" :id dash-id :ops [{:op "remove" :dashcard_id dashcard-id}]})
      (is (= [] (dashcards dash-id))))))

(deftest replaces-a-card-test
  (testing "a replace swaps the card and resets what was about the old one, keeping the slot"
    (mt/with-temp [:model/Card {old-id :id} {:name "Old"}
                   :model/Card {new-id :id} {:name "New"}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id old-id
                                                           :row 2 :col 2 :size_x 6 :size_y 6
                                                           :visualization_settings {:card.title "Old title"}}]
      (write! {:method "update" :id dash-id
               :ops    [{:op "replace_card" :dashcard_id dashcard-id :card_id new-id}]})
      (let [saved (t2/select-one :model/DashboardCard :id dashcard-id)]
        (is (= new-id (:card_id saved)))
        (is (= {:row 2 :col 2 :size_x 6 :size_y 6}
               (select-keys saved [:row :col :size_x :size_y])))
        (is (= {} (:visualization_settings saved)))))))

(deftest duplicates-a-card-test
  (testing "a duplicate is a second dashcard showing the same card, in a free slot of its own"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 0 :col 0 :size_x 6 :size_y 4
                                                           :visualization_settings {:card.title "Mine"}}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "duplicate_card" :dashcard_id dashcard-id}]})
            copy     (first (remove #(= dashcard-id (:id %)) (:dashcards response)))]
        (is (= 2 (count (dashcards dash-id))))
        (is (= card-id (:card_id copy)))
        (is (= {:size_x 6 :size_y 4} (select-keys copy [:size_x :size_y])))
        (testing "and it does not sit on top of the card it copied"
          (is (not= [0 0] [(:row copy) (:col copy)])))
        (testing "and it copies what the dashcard shows"
          (is (= {:card.title "Mine"}
                 (t2/select-one-fn :visualization_settings :model/DashboardCard :id (:id copy)))))))))

(deftest sets-a-series-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Card {series-1 :id} {}
                 :model/Card {series-2 :id} {}
                 :model/Dashboard {dash-id :id} {}
                 :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                         :row 0 :col 0 :size_x 4 :size_y 4}]
    (testing "the list is the whole series, in order"
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "set_series" :dashcard_id dashcard-id
                                        :card_ids [series-1 series-2]}]})]
        (is (= [series-1 series-2] (:series_card_ids (first (:dashcards response)))))
        (is (= [series-1 series-2]
               (t2/select-fn-vec :card_id :model/DashboardCardSeries
                                 :dashboardcard_id dashcard-id {:order-by [[:position :asc]]})))))
    (testing "and an empty list clears it"
      (write! {:method "update" :id dash-id
               :ops    [{:op "set_series" :dashcard_id dashcard-id :card_ids []}]})
      (is (empty? (t2/select-fn-vec :card_id :model/DashboardCardSeries :dashboardcard_id dashcard-id))))))

(deftest a-series-carried-through-an-unrelated-op-survives-test
  (testing "an op list that does not mention a dashcard's series does not clear it: the compiler carries the
            state the ops did not touch, which is the whole point of ops"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Card {series-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 0 :col 0 :size_x 4 :size_y 4}
                   :model/DashboardCardSeries _ {:dashboardcard_id dashcard-id :card_id series-id :position 0}]
      (write! {:method "update" :id dash-id
               :ops    [{:op "move" :dashcard_id dashcard-id :position {:row 4 :col 0}}]})
      (is (= [series-id]
             (t2/select-fn-vec :card_id :model/DashboardCardSeries :dashboardcard_id dashcard-id))))))

;;; ──────────────────────────────────────────────────────────────────
;;; patch_dashcard — content, and only content
;;; ──────────────────────────────────────────────────────────────────

(deftest patches-a-dashcards-content-test
  (testing "a patch merges into the dashcard's visualization settings, leaving the settings it does not name"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 0 :col 0 :size_x 4 :size_y 4
                                                           :visualization_settings {:card.title "Keep me"}}]
      (write! {:method "update" :id dash-id
               :ops    [{:op    "patch_dashcard" :dashcard_id dashcard-id
                         :patch {:graph.dimensions ["CREATED_AT"]}}]})
      (is (= {:card.title       "Keep me"
              :graph.dimensions ["CREATED_AT"]}
             (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id))))))

(deftest a-patch-that-carries-layout-is-refused-with-the-op-that-owns-it-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}
                 :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                         :row 0 :col 0 :size_x 4 :size_y 4}]
    (doseq [[patch owner] [[{:row 4}    "`move`"]
                           [{:size_x 8} "`resize`"]
                           [{:card_id 1} "`replace_card`"]]]
      (testing (pr-str patch)
        (let [k (name (first (keys patch)))]
          (is (= (str "Op 0: `patch` does not set `" k "`: that is layout, not content. Use " owner " for it."
                      " Nothing was written — fix that op and send the whole list again.")
                 (refusal (write! :crowberto 400
                                  {:method "update" :id dash-id
                                   :ops    [{:op "patch_dashcard" :dashcard_id dashcard-id :patch patch}]})))))))
    (testing "and the dashcard is untouched"
      (is (= {:row 0 :col 0 :size_x 4 :size_y 4 :card_id card-id}
             (select-keys (t2/select-one :model/DashboardCard :id dashcard-id)
                          [:row :col :size_x :size_y :card_id]))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tab ops
;;; ──────────────────────────────────────────────────────────────────

(deftest the-first-tab-adopts-the-cards-the-dashboard-already-had-test
  (testing "a dashboard with tabs has no cards outside them, so the first tab takes the cards that were there"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {dashcard-id :id} {:dashboard_id dash-id :card_id card-id
                                                           :row 0 :col 0 :size_x 4 :size_y 4}]
      (write! {:method "update" :id dash-id :ops [{:op "add_tab" :name "Overview"}]})
      (let [tab (first (tabs dash-id))]
        (is (= "Overview" (:name tab)))
        (is (= (:id tab) (t2/select-one-fn :dashboard_tab_id :model/DashboardCard :id dashcard-id)))))))

(deftest a-card-lands-on-a-tab-the-same-call-created-test
  (testing "a tab an earlier op added has no id yet, so a card names it by name — and the save resolves it"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method "update" :id dash-id
                              :ops    [{:op "add_tab" :name "Overview"}
                                       {:op "add_tab" :name "Detail"}
                                       {:op "add_card" :card_id card-id :tab "Detail"}]})
            detail   (second (:tabs response))]
        (is (= ["Overview" "Detail"] (mapv :name (tabs dash-id))))
        (is (= "Detail" (:name detail)))
        (is (= [(:id detail)] (mapv :dashboard_tab_id (dashcards dash-id))))
        (testing "and the tab it landed on has a real id, not the negative one the compile used"
          (is (pos? (:id detail))))))))

(deftest renames-and-reorders-tabs-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (write! {:method "update" :id dash-id
             :ops    [{:op "add_tab" :name "One"}
                      {:op "add_tab" :name "Two"}
                      {:op "add_tab" :name "Three"}]})
    (testing "rename"
      (write! {:method "update" :id dash-id
               :ops    [{:op "rename_tab" :tab_id "Two" :name "Second"}]})
      (is (= ["One" "Second" "Three"] (mapv :name (tabs dash-id)))))
    (testing "move — a tab's position is its place in the row of tabs"
      (write! {:method "update" :id dash-id :ops [{:op "move_tab" :tab_id "Three" :index 0}]})
      (is (= ["Three" "One" "Second"] (mapv :name (tabs dash-id)))))))

(deftest moves-a-card-between-tabs-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}]
    (let [built    (write! {:method "update" :id dash-id
                            :ops    [{:op "add_tab" :name "One"}
                                     {:op "add_tab" :name "Two"}
                                     {:op "add_card" :card_id card-id :tab "One"}]})
          dashcard (first (:dashcards built))
          two      (second (:tabs built))]
      (write! {:method "update" :id dash-id
               :ops    [{:op "move" :dashcard_id (:id dashcard) :tab "Two"}]})
      (is (= (:id two) (t2/select-one-fn :dashboard_tab_id :model/DashboardCard :id (:id dashcard)))))))

(deftest removing-a-tab-takes-its-cards-with-it-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}]
    (let [built (write! {:method "update" :id dash-id
                         :ops    [{:op "add_tab" :name "Keep"}
                                  {:op "add_tab" :name "Drop"}
                                  {:op "add_card" :card_id card-id :tab "Keep"}
                                  {:op "add_card" :card_id card-id :tab "Drop"}
                                  {:op "add_card" :card_id card-id :tab "Drop"}]})]
      (is (= 3 (count (dashcards dash-id))))
      (let [response (write! {:method "update" :id dash-id :ops [{:op "remove_tab" :tab_id "Drop"}]})]
        (is (= ["Keep"] (mapv :name (tabs dash-id))))
        (testing "the two cards on the removed tab went with it, and the response says so"
          (is (= 1 (count (:dashcards response))))
          (is (= 1 (count (dashcards dash-id)))))
        (is (= 3 (count (:dashcards built))) "sanity: the build put three cards across the two tabs")))))

(deftest duplicates-a-tab-with-its-cards-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}]
    (write! {:method "update" :id dash-id
             :ops    [{:op "add_tab" :name "Q1"}
                      {:op "add_card" :card_id card-id :tab "Q1"}
                      {:op "add_card" :card_id card-id :tab "Q1"}]})
    (let [response (write! {:method "update" :id dash-id :ops [{:op "duplicate_tab" :tab_id "Q1" :name "Q2"}]})
          q2       (second (:tabs response))]
      (is (= ["Q1" "Q2"] (mapv :name (tabs dash-id))))
      (testing "the copy carries copies of the cards, on the new tab"
        (is (= 4 (count (dashcards dash-id))))
        (is (= 2 (count (filter #(= (:id q2) (:dashboard_tab_id %)) (:dashcards response)))))))))

(deftest a-tab-that-is-not-there-is-refused-with-the-ones-that-are-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id} {}]
    (write! {:method "update" :id dash-id :ops [{:op "add_tab" :name "Overview"}]})
    (let [message (refusal (write! :crowberto 404
                                   {:method "update" :id dash-id
                                    :ops    [{:op "add_card" :card_id card-id :tab "Detial"}]}))]
      (is (re-find #"has no tab named \"Detial\"" message))
      (testing "and the refusal lists the tabs it does have, so the model can pick one"
        (is (re-find #"\"Overview\" \(id \d+\)" message))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The compile is all-or-nothing
;;; ──────────────────────────────────────────────────────────────────

(deftest a-bad-op-aborts-the-whole-list-naming-its-index-test
  (testing "the ops before the bad one are not applied: there is no half-built layout to reason about"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}]
      (let [message (refusal (write! :crowberto 400
                                     {:method "update" :id dash-id
                                      :ops    [{:op "add_card" :card_id card-id}
                                               {:op "add_heading" :text "Fine"}
                                               {:op "add_card"}]}))]
        (is (= (str "Op 2: `add_card` needs `card_id`. Nothing was written — fix that op and send the whole "
                    "list again.")
               message)))
      (is (= [] (dashcards dash-id)) "the two ops that were fine were not applied either"))))

(deftest re-sending-a-list-that-failed-does-not-double-add-test
  (testing "a call that failed wrote nothing, so the fixed list is the whole list — and it lands once"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}]
      (let [ops [{:op "add_card" :card_id card-id}
                 {:op "add_heading" :text "Revenue"}]]
        (write! :crowberto 404 {:method "update" :id dash-id
                                :ops    (conj ops {:op "move" :dashcard_id 999999})})
        (is (= [] (dashcards dash-id)))
        (write! {:method "update" :id dash-id :ops ops})
        (is (= 2 (count (dashcards dash-id))))))))

(deftest an-unknown-op-is-refused-test
  (testing "`op` is a closed enum, so an op that does not exist is refused before it can do anything, and the
            ops that shared its list are not applied"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (write! :crowberto 400 {:method "update" :id dash-id
                              :ops    [{:op "add_tab" :name "One"}
                                       {:op "delete_card" :dashcard_id 1}]})
      (is (= [] (tabs dash-id))))))

(deftest a-dashcard-that-is-not-on-this-dashboard-is-a-404-test
  (mt/with-temp [:model/Dashboard {dash-id :id} {}]
    (is (= (str "Op 0: This dashboard has no dashcard 4242. `get_content` on the dashboard lists its dashcards "
                "and their ids. Nothing was written — fix that op and send the whole list again.")
           (refusal (write! :crowberto 404
                            {:method "update" :id dash-id
                             :ops    [{:op "remove" :dashcard_id 4242}]}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; validate_only
;;; ──────────────────────────────────────────────────────────────────

(deftest validate-only-returns-the-layout-without-writing-it-test
  (testing "a dry run compiles the ops, runs their checks, and answers with the layout they would produce"
    (mt/with-temp [:model/Card {card-id :id} {:name "Orders"}
                   :model/Dashboard {dash-id :id} {}]
      (let [response (write! {:method        "update" :id dash-id
                              :validate_only true
                              :ops           [{:op "add_tab" :name "Overview"}
                                              {:op "add_card" :card_id card-id}
                                              {:op "add_heading" :text "Revenue"}]})]
        (is (true? (:validated response)))
        (is (= ["card" "heading"] (kinds response)))
        (is (= ["Overview"] (mapv :name (:tabs response))))
        (testing "the rows it would create carry negative ids, because they do not exist"
          (is (every? neg? (map :id (:dashcards response)))))
        (testing "and nothing was written"
          (is (= [] (dashcards dash-id)))
          (is (= [] (tabs dash-id))))))))

(deftest validate-only-refuses-what-the-write-would-refuse-test
  (testing "a dry run that said yes and then failed for real would have taught the model nothing"
    (mt/with-temp [:model/Dashboard {dash-id :id} {}]
      (is (= (str "Op 0: This dashboard has no dashcard 1. `get_content` on the dashboard lists its dashcards "
                  "and their ids. Nothing was written — fix that op and send the whole list again.")
             (refusal (write! :crowberto 404
                              {:method        "update" :id dash-id
                               :validate_only true
                               :ops           [{:op "remove" :dashcard_id 1}]})))))))

(deftest validate-only-does-not-create-the-dashboard-test
  (mt/with-model-cleanup [:model/Dashboard]
    (let [before   (t2/count :model/Dashboard)
          response (write! {:method        "create" :name "Never saved"
                            :validate_only true
                            :ops           [{:op "add_heading" :text "Revenue"}]})]
      (is (true? (:validated response)))
      (is (= ["heading"] (kinds response)))
      (is (nil? (:id response)))
      (is (= before (t2/count :model/Dashboard))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Permissions — the floor the tool cannot get under
;;; ──────────────────────────────────────────────────────────────────

(deftest a-card-the-caller-cannot-read-cannot-be-placed-test
  (testing "placing a card is showing it, so a card the caller cannot read is refused — and the op names itself"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {:collection_id coll-id}
                   :model/Dashboard {dash-id :id} {}]
      (mt/with-non-admin-groups-no-collection-perms (t2/select-one :model/Collection :id coll-id)
        (write! :rasta 403 {:method "update" :id dash-id
                            :ops    [{:op "add_card" :card_id card-id}]})
        (is (= [] (dashcards dash-id)))))))

(deftest a-trashed-card-cannot-be-placed-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Gone" :archived true}
                 :model/Dashboard {dash-id :id} {}]
    (is (= (str "Op 0: Card " card-id " (\"Gone\") is in the trash, and a dashboard cannot show a trashed card. "
                "Restore it with `question_write` and `archived: false`. Nothing was written — fix that op and "
                "send the whole list again.")
           (refusal (write! :crowberto 400
                            {:method "update" :id dash-id
                             :ops    [{:op "add_card" :card_id card-id}]}))))))

(deftest a-dashboard-the-caller-cannot-write-is-refused-test
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard {dash-id :id :as dashboard} {:collection_id coll-id}]
    (mt/with-non-admin-groups-no-collection-perms (t2/select-one :model/Collection :id coll-id)
      (write! :rasta 403 {:method "update" :id dash-id :name "Mine now"})
      (is (= (:name dashboard) (t2/select-one-fn :name :model/Dashboard :id dash-id))
          "the name did not change"))))

;;; ──────────────────────────────────────────────────────────────────
;;; The round-trip — an op preserves what it did not touch
;;; ──────────────────────────────────────────────────────────────────
;;
;; This is the load-bearing property of the whole design, and the one whose failure would be quietest. The save is a
;; full-set replace: the compiler reads *every* dashcard into its state and writes *every* dashcard back, so a field
;; it forgets to carry is a field that some unrelated op silently erases. The click behavior somebody configured
;; last month disappears because an agent added a card to the same dashboard, and nothing anywhere reports an error.

(deftest an-op-preserves-the-dashcards-it-did-not-touch-test
  (mt/with-temp [:model/Card {card-id :id}   {}
                 :model/Card {series-id :id} {}
                 :model/Card {other-id :id}  {}
                 :model/Dashboard {dash-id :id}
                 {:parameters [{:id "p1" :name "Cat" :type "string/=" :slug "cat"}]}
                 :model/DashboardCard {rich-id :id}
                 {:dashboard_id           dash-id :card_id card-id
                  :row 0 :col 0 :size_x 6 :size_y 4
                  :visualization_settings {:card.title      "Rich"
                                           :click_behavior  {:type "link" :linkType "dashboard" :targetId 1}
                                           :column_settings {"[\"name\",\"X\"]" {:column_title "X!"}}}
                  :parameter_mappings     [{:parameter_id "p1" :card_id card-id
                                            :target ["dimension" ["field" 1 nil]]}]
                  :inline_parameters      ["p1"]}
                 :model/DashboardCardSeries _ {:dashboardcard_id rich-id :card_id series-id :position 0}]
    (let [before (t2/select-one :model/DashboardCard :id rich-id)]
      (testing "an op with nothing to do with this dashcard — a card added elsewhere on the dashboard"
        (write! {:method "update" :id dash-id :ops [{:op "add_card" :card_id other-id}]}))
      (let [after (t2/select-one :model/DashboardCard :id rich-id)]
        (testing "leaves its visualization settings, click behavior, and column settings alone"
          (is (= (:visualization_settings before) (:visualization_settings after))))
        (testing "leaves its filter wiring alone"
          (is (= (:parameter_mappings before) (:parameter_mappings after)))
          (is (= (:inline_parameters before) (:inline_parameters after))))
        (testing "leaves it where it was"
          (is (= (select-keys before [:row :col :size_x :size_y])
                 (select-keys after [:row :col :size_x :size_y]))))
        (testing "and leaves its series alone — a series the compiler dropped would be a chart quietly losing a
                  line"
          (is (= [series-id]
                 (t2/select-fn-vec :card_id :model/DashboardCardSeries :dashboardcard_id rich-id))))
        (testing "and the dashboard's own filters survive a write that only touched the layout"
          (is (= [{:id "p1" :name "Cat" :type :string/= :slug "cat"}]
                 (vec (t2/select-one-fn :parameters :model/Dashboard :id dash-id)))))))))

(defn- link-dashcard
  "The `visualization_settings` of a link card pointing at `card-id`. What is *stored* is the target's model and id
   and nothing else; a read looks the rest up on fetch."
  [card-id]
  {:virtual_card {:name nil :display "link" :visualization_settings {} :archived false}
   :link         {:entity {:model "card" :id card-id}}})

(deftest an-op-does-not-write-a-read-s-hydration-back-over-a-link-card-test
  (testing "a link card stores its target's model and id, and a *read* hydrates the target's current name into the
            settings alongside them. Carrying a read's view of a dashboard into a write would persist that
            hydration over the reference it was derived from."
    (mt/with-temp [:model/Card {card-id :id} {:name "Orders"}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard {link-id :id}
                   {:dashboard_id dash-id :card_id nil :row 0 :col 0 :size_x 4 :size_y 4
                    :visualization_settings (link-dashcard card-id)}]
      (let [before (t2/select-one-fn :visualization_settings :model/DashboardCard :id link-id)]
        (write! {:method "update" :id dash-id :ops [{:op "add_heading" :text "Unrelated"}]})
        (is (= before (t2/select-one-fn :visualization_settings :model/DashboardCard :id link-id)))))))

(deftest an-op-does-not-destroy-a-link-whose-target-the-writer-cannot-read-test
  (testing "and the destructive case: a read renders a link to something the caller may not see as
            `{restricted: true}` — the model and the id *gone*. A write that carried that back would delete the
            link, for everybody, permanently, as a side effect of an op about something else."
    (mt/with-temp [:model/Collection {secret-coll :id} {}
                   :model/Card       {secret-card :id} {:collection_id secret-coll}
                   :model/Collection {open-coll :id} {}
                   :model/Dashboard  {dash-id :id} {:collection_id open-coll}
                   :model/DashboardCard {link-id :id}
                   {:dashboard_id dash-id :card_id nil :row 0 :col 0 :size_x 4 :size_y 4
                    :visualization_settings (link-dashcard secret-card)}]
      ;; Rasta may edit the dashboard. Rasta may not read the card it links to.
      (mt/with-non-admin-groups-no-collection-perms (t2/select-one :model/Collection :id secret-coll)
        (let [before (t2/select-one-fn :visualization_settings :model/DashboardCard :id link-id)]
          (write! :rasta 200 {:method "update" :id dash-id :ops [{:op "add_heading" :text "Unrelated"}]})
          (is (= before (t2/select-one-fn :visualization_settings :model/DashboardCard :id link-id))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Golden — the ops compile to the save the editor makes
;;; ──────────────────────────────────────────────────────────────────
;;
;; The claim `dashboard_write` makes is not "it writes a dashboard" but "it writes the dashboard the editor would
;; have written". The way to hold it to that is to make the same gesture twice — once as ops, once as the `PUT
;; /api/dashboard/:id` body the frontend's save path sends — and compare what is on the two dashboards afterwards.
;; Nothing but the ids may differ.

(defn- layout-of
  "What is on a dashboard, as a set — every dashcard by what it shows and where, and every tab by its name and
   place. Ids are left out on purpose: they are the one thing the two paths cannot agree on, and the one thing
   nobody is asserting."
  [dashboard-id]
  (let [tab-names (into {} (map (juxt :id :name)) (tabs dashboard-id))]
    {:tabs      (mapv :name (tabs dashboard-id))
     :dashcards (set (for [{:keys [card_id dashboard_tab_id row col size_x size_y visualization_settings]}
                           (dashcards dashboard-id)]
                       {:card_id card_id
                        :tab     (tab-names dashboard_tab_id)
                        :row     row  :col    col
                        :size_x  size_x :size_y size_y
                        :settings visualization_settings}))}))

(deftest ops-compile-to-the-save-the-editor-makes-test
  (testing "the same dashboard, built twice: once through ops, once through the PUT body the frontend sends"
    (mt/with-temp [:model/Card {card-id :id} {:name "Orders" :display :table}
                   :model/Dashboard {ops-dash :id} {}
                   :model/Dashboard {put-dash :id} {}]
      (write! {:method "update" :id ops-dash
               :ops    [{:op "add_tab" :name "Overview"}
                        {:op "add_tab" :name "Detail"}
                        {:op "add_heading" :text "This quarter" :tab "Overview"}
                        {:op "add_card" :card_id card-id :tab "Overview"}
                        {:op "add_card" :card_id card-id :tab "Detail"
                         :position {:row 0 :col 0} :size {:size_x 6 :size_y 4}}]})
      ;; The body the editor's save path sends for the same five gestures: negative ids for the rows it is
      ;; creating, dashcards referencing tabs by those same negative ids, tab order carried by list order.
      (mt/user-http-request
       :crowberto :put 200 (str "dashboard/" put-dash)
       {:tabs      [{:id -1 :name "Overview"}
                    {:id -2 :name "Detail"}]
        :dashcards [{:id -3 :card_id nil :dashboard_tab_id -1 :row 0 :col 0 :size_x 24 :size_y 1
                     :visualization_settings {:text                "This quarter"
                                              :dashcard.background false
                                              :virtual_card        {:name                   nil
                                                                    :display                "heading"
                                                                    :visualization_settings {}
                                                                    :archived               false}}}
                    {:id -4 :card_id card-id :dashboard_tab_id -1 :row 1 :col 0 :size_x 12 :size_y 9
                     :visualization_settings {}}
                    {:id -5 :card_id card-id :dashboard_tab_id -2 :row 0 :col 0 :size_x 6 :size_y 4
                     :visualization_settings {}}]})
      (is (= (layout-of put-dash) (layout-of ops-dash))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Reachability — any dashboard is buildable from an empty one
;;; ──────────────────────────────────────────────────────────────────

(deftest every-shape-of-dashboard-is-reachable-from-an-empty-one-test
  (testing "a corpus of the shapes a dashboard comes in — tabbed, virtual cards of every kind, a combined chart,
            a hand-laid grid — each built from nothing by one op list. An op grammar that cannot express a
            dashboard somebody already has is an op grammar an agent gets stuck in front of."
    (mt/with-temp [:model/Card {card-id :id}   {:name "Orders" :display :table}
                   :model/Card {series-id :id} {:name "Returns" :display :line}]
      (doseq [[shape ops expected]
              [["a single card"
                [{:op "add_card" :card_id card-id}]
                1]
               ["prose and a card"
                [{:op "add_heading" :text "Q3"}
                 {:op "add_text" :markdown "Numbers are **provisional**."}
                 {:op "add_card" :card_id card-id}]
                3]
               ["three tabs, cards on each"
                [{:op "add_tab" :name "One"} {:op "add_tab" :name "Two"} {:op "add_tab" :name "Three"}
                 {:op "add_card" :card_id card-id :tab "One"}
                 {:op "add_card" :card_id card-id :tab "Two"}
                 {:op "add_card" :card_id card-id :tab "Three"}]
                3]
               ["a combined chart"
                [{:op "add_card" :card_id card-id}]
                1]
               ["a hand-laid grid"
                [{:op "add_card" :card_id card-id :position {:row 0 :col 0} :size {:size_x 12 :size_y 6}}
                 {:op "add_card" :card_id card-id :position {:row 0 :col 12} :size {:size_x 12 :size_y 6}}
                 {:op "add_card" :card_id card-id :position {:row 6 :col 0} :size {:size_x 24 :size_y 4}}]
                3]
               ["a link and an embed"
                [{:op "add_link" :url "https://metabase.com"}
                 {:op "add_iframe" :src "https://metabase.com/embed"}]
                2]]]
        (testing shape
          (mt/with-model-cleanup [:model/Dashboard]
            (let [built (write! {:method "create" :name shape :ops ops})]
              (is (= expected (count (dashcards (:id built)))))
              (when (= "a combined chart" shape)
                (write! {:method "update" :id (:id built)
                         :ops    [{:op "set_series" :dashcard_id (:id (first (:dashcards built)))
                                   :card_ids [series-id]}]})
                (is (= [series-id]
                       (t2/select-fn-vec :card_id :model/DashboardCardSeries
                                         :dashboardcard_id (:id (first (:dashcards built))))))))))))))
