(ns metabase.mcp.v2.dashboard-ops-test
  "Unit tests for the pure `dashboard_write` op compiler. No DB: `compile-ops` takes a hydrated
   dashboard map and returns the save payload, so every op and every rejection is exercised
   against plain maps."
  (:require
   [clojure.test :refer :all]
   [metabase.mcp.v2.dashboard-ops :as dashboard-ops]
   [metabase.parameters.mapping-targets]))

(set! *warn-on-reflection* true)

(def ^:private empty-dash
  {:id 1 :dashcards [] :tabs [] :parameters []})

(defn- dash-with
  [dashcards]
  (assoc empty-dash :dashcards dashcards))

(deftest add-card-autoplaces-test
  (testing "GHY-4147: add_card with no position lands at the top-left of an empty dashboard"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_card" :id -1 :card_id 42}])]
      (is (= 1 (count dashcards)))
      (is (= {:id -1 :card_id 42 :row 0 :col 0}
             (select-keys (first dashcards) [:id :card_id :row :col])))
      (is (pos-int? (:size_x (first dashcards))))
      (is (pos-int? (:size_y (first dashcards)))))))

(deftest add-card-respects-explicit-position-and-size-test
  (testing "GHY-4147: explicit position and size are passed through untouched"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_card" :id -1 :card_id 42
                                 :position {:row 3 :col 4}
                                 :size {:size_x 6 :size_y 5}}])]
      (is (= {:id -1 :card_id 42 :row 3 :col 4 :size_x 6 :size_y 5}
             (select-keys (first dashcards) [:id :card_id :row :col :size_x :size_y]))))))

(deftest existing-dashcards-are-preserved-test
  (testing "GHY-4147: the payload is a full replacement, so untouched dashcards survive verbatim"
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :dashboard_tab_id nil}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "add_card" :id -1 :card_id 42}])]
      (is (= #{7 -1} (set (map :id dashcards))))
      (is (= existing (first (filter #(= 7 (:id %)) dashcards)))))))

(deftest autoplace-avoids-existing-cards-test
  (testing "GHY-4147: autoplace does not overlap an occupied slot"
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 24 :size_y 4 :dashboard_tab_id nil}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "add_card" :id -1 :card_id 42}])
          added (first (filter #(= -1 (:id %)) dashcards))]
      (is (<= 4 (:row added))))))

(deftest duplicate-temp-id-is-rejected-test
  (testing "GHY-4147: reusing a temp id inside one batch is a teaching error naming the op index"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 1.*-1"
         (dashboard-ops/compile-ops
          empty-dash
          [{:op "add_card" :id -1 :card_id 42}
           {:op "add_card" :id -1 :card_id 43}])))))

(deftest positive-temp-id-is-rejected-test
  (testing "GHY-4147: a new dashcard's id must be negative — positives would silently target a real row"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*negative"
         (dashboard-ops/compile-ops empty-dash [{:op "add_card" :id 5 :card_id 42}])))))

(deftest unknown-op-is-rejected-test
  (testing "GHY-4147: an unrecognized op names the index and the op"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*frobnicate"
         (dashboard-ops/compile-ops empty-dash [{:op "frobnicate"}])))))

(deftest add-text-test
  (testing "GHY-4147: add_text produces a virtual text dashcard with no card_id"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_text" :id -1 :markdown "## Hello"}])
          dc (first dashcards)]
      (is (nil? (:card_id dc)))
      (is (= "text" (get-in dc [:visualization_settings :virtual_card :display])))
      (is (= "## Hello" (get-in dc [:visualization_settings :text]))))))

(deftest add-heading-test
  (testing "GHY-4147: add_heading matches the editor, including the transparent background"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_heading" :id -1 :text "Revenue"}])
          vs (:visualization_settings (first dashcards))]
      (is (= "heading" (get-in vs [:virtual_card :display])))
      (is (= "Revenue" (:text vs)))
      (is (false? (:dashcard.background vs))))))

(deftest add-link-url-test
  (testing "GHY-4147: add_link with an external url"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_link" :id -1 :url "https://example.com"}])
          vs (:visualization_settings (first dashcards))]
      (is (= "link" (get-in vs [:virtual_card :display])))
      (is (= {:url "https://example.com"} (:link vs))))))

(deftest add-link-entity-test
  (testing "GHY-4147: add_link with an entity reference stores the entity, not a url"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_link" :id -1 :entity {:type "dashboard" :id 12}}])
          vs (:visualization_settings (first dashcards))]
      (is (= {:entity {:model "dashboard" :id 12}} (:link vs))))))

(deftest add-link-requires-exactly-one-target-test
  (testing "GHY-4147: add_link with neither url nor entity, or both, is a teaching error"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*exactly one"
                          (dashboard-ops/compile-ops empty-dash [{:op "add_link" :id -1}])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*exactly one"
                          (dashboard-ops/compile-ops
                           empty-dash
                           [{:op "add_link" :id -1 :url "https://example.com"
                             :entity {:type "dashboard" :id 12}}])))))

(deftest add-iframe-test
  (testing "GHY-4147: add_iframe stores the src in visualization settings"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_iframe" :id -1 :src "https://example.com/embed"}])
          vs (:visualization_settings (first dashcards))]
      (is (= "iframe" (get-in vs [:virtual_card :display])))
      (is (= "https://example.com/embed" (:iframe vs))))))

(deftest add-action-test
  (testing "GHY-4147: add_action produces an action dashcard with action_id and no card_id"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_action" :id -1 :action_id 3 :label "Run" :display "button"}])
          dc (first dashcards)]
      (is (= 3 (:action_id dc)))
      (is (nil? (:card_id dc)))
      (is (= "button" (get-in dc [:visualization_settings :actionDisplayType])))
      (is (= "Run" (get-in dc [:visualization_settings "button.label"]))))))

(deftest duplicate-card-test
  (testing "GHY-4147: duplicate_card clones content but takes the new negative id and its own slot"
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :dashboard_tab_id nil
                    :visualization_settings {:card.title "Original"}
                    :parameter_mappings [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 1 nil]]}]}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "duplicate_card" :id -1 :dashcard_id 7}])
          clone (first (filter #(= -1 (:id %)) dashcards))]
      (is (= 2 (count dashcards)))
      (is (= 9 (:card_id clone)))
      (is (= {:card.title "Original"} (:visualization_settings clone)))
      (is (= (:parameter_mappings existing) (:parameter_mappings clone)))
      (is (not= [(:row existing) (:col existing)] [(:row clone) (:col clone)])))))

(deftest duplicate-card-unknown-dashcard-test
  (testing "GHY-4147: duplicate_card on a missing dashcard names the op index"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*999"
                          (dashboard-ops/compile-ops
                           empty-dash
                           [{:op "duplicate_card" :id -1 :dashcard_id 999}])))))

(deftest duplicate-card-does-not-remap-visualizer-source-ids-test
  (testing "GHY-4147: duplicate_card does not remap visualizer columnValuesMapping sourceIds —
            update-colvalmap-setting (api.clj) is private and out of scope for this compiler, so a
            cloned visualizer card still points at the source dashcard's columns. Recorded as a
            known decision, not an oversight."
    (let [existing {:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :dashboard_tab_id nil
                    :visualization_settings
                    {:visualization "table"
                     :columnValuesMapping {:COLUMN_1 [{:sourceId "card:7" :originalName "NAME" :name "COLUMN_1"}]}}}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [existing])
                               [{:op "duplicate_card" :id -1 :dashcard_id 7}])
          clone (first (filter #(= -1 (:id %)) dashcards))]
      (is (= (get-in existing [:visualization_settings :columnValuesMapping])
             (get-in clone [:visualization_settings :columnValuesMapping]))))))

(def ^:private a-dashcard
  {:id 7 :card_id 9 :row 2 :col 3 :size_x 4 :size_y 4 :dashboard_tab_id nil
   :visualization_settings {:card.title "Old"}
   :parameter_mappings [{:parameter_id "p1" :card_id 9 :target ["dimension" ["field" 1 nil]]}]
   :series [{:id 11}]})

(deftest replace-card-resets-content-test
  (testing "GHY-4147: replace_card keeps the dashcard id and resets series, mappings, and viz settings"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "replace_card" :dashcard_id 7 :card_id 99}])
          dc (first dashcards)]
      (is (= 7 (:id dc)))
      (is (= 99 (:card_id dc)))
      (is (= [] (:series dc)))
      (is (= [] (:parameter_mappings dc)))
      (is (= {} (:visualization_settings dc)))
      (testing "layout is untouched"
        (is (= [2 3 4 4] [(:row dc) (:col dc) (:size_x dc) (:size_y dc)]))))))

(deftest move-and-resize-test
  (testing "GHY-4147: move relocates, resize resizes, neither disturbs the other"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "move" :dashcard_id 7 :position {:row 0 :col 0}}
                                {:op "resize" :dashcard_id 7 :size {:size_x 8 :size_y 2}}])
          dc (first dashcards)]
      (is (= [0 0 8 2] [(:row dc) (:col dc) (:size_x dc) (:size_y dc)])))))

(deftest remove-test
  (testing "GHY-4147: remove drops the dashcard from the payload, which deletes it on save"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "remove" :dashcard_id 7}])]
      (is (= [] dashcards)))))

(deftest set-series-test
  (testing "GHY-4147: set_series is an ordered full replace"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "set_series" :dashcard_id 7 :card_ids [21 20]}])]
      (is (= [{:id 21} {:id 20}] (:series (first dashcards)))))))

(deftest patch-dashcard-merges-content-test
  (testing "GHY-4147: patch_dashcard merges into visualization_settings rather than replacing them"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               (dash-with [a-dashcard])
                               [{:op "patch_dashcard" :dashcard_id 7
                                 :patch {:visualization_settings {:card.description "New"}}}])
          vs (:visualization_settings (first dashcards))]
      (is (= "Old" (:card.title vs)))
      (is (= "New" (:card.description vs))))))

(deftest patch-dashcard-rejects-layout-keys-test
  (testing "GHY-4147: layout and identity keys in a patch are rejected, naming the op that owns them"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*`row`.*move"
                          (dashboard-ops/compile-ops
                           (dash-with [a-dashcard])
                           [{:op "patch_dashcard" :dashcard_id 7 :patch {:row 0}}])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*`size_x`.*resize"
                          (dashboard-ops/compile-ops
                           (dash-with [a-dashcard])
                           [{:op "patch_dashcard" :dashcard_id 7 :patch {:size_x 4}}])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*`card_id`.*replace_card"
                          (dashboard-ops/compile-ops
                           (dash-with [a-dashcard])
                           [{:op "patch_dashcard" :dashcard_id 7 :patch {:card_id 1}}])))))

(deftest ops-apply-in-order-test
  (testing "GHY-4147: a later op sees the effect of an earlier one — add then move the same new card"
    (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                               empty-dash
                               [{:op "add_card" :id -1 :card_id 42}
                                {:op "move" :dashcard_id -1 :position {:row 9 :col 1}}])]
      (is (= [9 1] [(:row (first dashcards)) (:col (first dashcards))])))))

(deftest add-tab-and-place-a-card-in-it-test
  (testing "GHY-4147: a card can reference a tab created earlier in the same batch by its negative id"
    (let [{:keys [tabs dashcards]} (dashboard-ops/compile-ops
                                    empty-dash
                                    [{:op "add_tab" :id -1 :name "Q3"}
                                     {:op "add_card" :id -2 :card_id 42 :tab -1}])]
      (is (= [{:id -1 :name "Q3"}] tabs))
      (is (= -1 (:dashboard_tab_id (first dashcards)))))))

(deftest rename-tab-test
  (testing "GHY-4147: rename_tab changes only the name"
    (let [{:keys [tabs]} (dashboard-ops/compile-ops
                          (assoc empty-dash :tabs [{:id 5 :name "Old" :position 0}])
                          [{:op "rename_tab" :tab_id 5 :name "New"}])]
      (is (= "New" (:name (first tabs))))
      (is (= 5 (:id (first tabs)))))))

(deftest move-tab-reorders-test
  (testing "GHY-4147: move_tab reorders the vector; update-dashboard! derives :position from the index"
    (let [{:keys [tabs]} (dashboard-ops/compile-ops
                          (assoc empty-dash :tabs [{:id 5 :name "A"} {:id 6 :name "B"} {:id 7 :name "C"}])
                          [{:op "move_tab" :tab_id 7 :index 0}])]
      (is (= [7 5 6] (mapv :id tabs))))))

(deftest duplicate-tab-clones-cards-test
  (testing "GHY-4147: duplicate_tab clones the tab and every dashcard on it, under new negative ids"
    (let [current {:id 1
                   :tabs [{:id 5 :name "A"}]
                   :parameters []
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :dashboard_tab_id 5 :visualization_settings {}}]}
          {:keys [tabs dashcards]} (dashboard-ops/compile-ops
                                    current
                                    [{:op "duplicate_tab" :id -1 :tab_id 5}])]
      (is (= [5 -1] (mapv :id tabs)))
      (is (= "A" (:name (second tabs))))
      (is (= 2 (count dashcards)))
      (let [clone (first (filter #(= -1 (:dashboard_tab_id %)) dashcards))]
        (is (neg? (:id clone)))
        (is (= 9 (:card_id clone)))))))

(deftest remove-tab-deletes-its-cards-test
  (testing "GHY-4147: remove_tab drops the tab and every dashcard on it"
    (let [current {:id 1
                   :tabs [{:id 5 :name "A"} {:id 6 :name "B"}]
                   :parameters []
                   :dashcards [{:id 7 :card_id 9 :dashboard_tab_id 5 :row 0 :col 0 :size_x 4 :size_y 4}
                               {:id 8 :card_id 9 :dashboard_tab_id 6 :row 0 :col 0 :size_x 4 :size_y 4}]}
          {:keys [tabs dashcards]} (dashboard-ops/compile-ops current [{:op "remove_tab" :tab_id 5}])]
      (is (= [6] (mapv :id tabs)))
      (is (= [8] (mapv :id dashcards))))))

(deftest tab-coverage-is-enforced-test
  (testing "GHY-4147: with two or more tabs present, a dashcard with no tab is rejected with a clear message"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"every card must belong to a tab"
         (dashboard-ops/compile-ops
          empty-dash
          [{:op "add_tab" :id -1 :name "Q3"}
           {:op "add_tab" :id -2 :name "Q4"}
           {:op "add_card" :id -3 :card_id 42}])))))

(deftest single-tab-coverage-is-not-enforced-test
  (testing "GHY-4147: with exactly one tab, a tabless card is allowed — update-dashboard! back-fills
            its dashboard_tab_id itself (api.clj), so the compiler must not reject it early"
    (is (some? (dashboard-ops/compile-ops
                empty-dash
                [{:op "add_tab" :id -1 :name "Q3"}
                 {:op "add_card" :id -2 :card_id 42}])))))

(deftest unknown-tab-is-rejected-test
  (testing "GHY-4147: referencing a tab that does not exist names the op index"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"op 0.*99"
                          (dashboard-ops/compile-ops empty-dash [{:op "rename_tab" :tab_id 99 :name "x"}])))))

(def ^:private a-card
  "Minimal stand-in for a hydrated card; mapping-targets is stubbed in these tests, so only the
   id matters here."
  {:id 9 :name "Revenue" :type "question"})

(deftest add-parameter-test
  (testing "GHY-4147: add_parameter appends a parameter carrying the caller's id, REST names intact"
    (let [{:keys [parameters]} (dashboard-ops/compile-ops
                                empty-dash
                                [{:op "add_parameter" :parameter_id "p_date" :name "Date"
                                  :type "date/all-options" :isMultiSelect false}]
                                {})]
      (is (= [{:id "p_date" :name "Date" :type "date/all-options" :isMultiSelect false}]
             parameters)))))

(deftest add-parameter-rejects-duplicate-id-test
  (testing "GHY-4147: reusing an existing parameter id is a teaching error pointing at update_parameter"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*update_parameter"
         (dashboard-ops/compile-ops
          (assoc empty-dash :parameters [{:id "p1" :name "X" :type "string/="}])
          [{:op "add_parameter" :parameter_id "p1" :name "Y" :type "string/="}]
          {})))))

(deftest update-parameter-merges-test
  (testing "GHY-4147: update_parameter merges into the existing parameter"
    (let [{:keys [parameters]} (dashboard-ops/compile-ops
                                (assoc empty-dash :parameters [{:id "p1" :name "X" :type "string/="}])
                                [{:op "update_parameter" :parameter_id "p1" :name "Y"}]
                                {})]
      (is (= [{:id "p1" :name "Y" :type "string/="}] parameters)))))

(deftest remove-parameter-strips-mappings-test
  (testing "GHY-4147: remove_parameter drops the parameter, its dashcard mappings, its inline
            placements, and any linked-filter reference to it"
    (let [current {:id 1 :tabs []
                   :parameters [{:id "p1" :name "X" :type "string/="}
                                {:id "p2" :name "Y" :type "string/=" :filteringParameters ["p1"]}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :inline_parameters ["p1" "p2"]
                                :parameter_mappings [{:parameter_id "p1" :card_id 9 :target [:dimension [:field 1 nil]]}
                                                     {:parameter_id "p2" :card_id 9 :target [:dimension [:field 2 nil]]}]}]}
          {:keys [parameters dashcards]} (dashboard-ops/compile-ops
                                          current [{:op "remove_parameter" :parameter_id "p1"}] {})
          dc (first dashcards)]
      (is (= ["p2"] (mapv :id parameters)))
      (is (= [] (:filteringParameters (first parameters))))
      (is (= ["p2"] (:inline_parameters dc)))
      (is (= ["p2"] (mapv :parameter_id (:parameter_mappings dc)))))))

(deftest move-parameter-reorders-header-test
  (testing "GHY-4147: move_parameter with an index reorders the header"
    (let [{:keys [parameters]} (dashboard-ops/compile-ops
                                (assoc empty-dash :parameters [{:id "a"} {:id "b"} {:id "c"}])
                                [{:op "move_parameter" :parameter_id "c" :index 0}]
                                {})]
      (is (= ["c" "a" "b"] (mapv :id parameters))))))

(deftest move-parameter-onto-a-card-test
  (testing "GHY-4147: move_parameter with a dashcard_id makes it an inline filter on that card"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1"}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4}]}
          {:keys [dashcards]} (dashboard-ops/compile-ops
                               current [{:op "move_parameter" :parameter_id "p1" :dashcard_id 7}] {})]
      (is (= ["p1"] (:inline_parameters (first dashcards)))))))

(deftest wire-parameter-by-field-test
  (testing "GHY-4147: wire_parameter writes a parameter mapping using the card's target for the field"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1" :name "Cat" :type "string/="}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :parameter_mappings []}]}
          {:keys [dashcards]} (with-redefs [metabase.parameters.mapping-targets/target-for-field
                                            (fn [_card _param field-id]
                                              [:dimension [:field field-id nil]])]
                                (dashboard-ops/compile-ops
                                 current
                                 [{:op "wire_parameter" :parameter_id "p1" :dashcard_id 7 :target_field 55}]
                                 {9 a-card}))]
      (is (= [{:parameter_id "p1" :card_id 9 :target [:dimension [:field 55 nil]]}]
             (:parameter_mappings (first dashcards)))))))

(deftest wire-parameter-rejects-an-unavailable-field-test
  (testing "GHY-4147: a field the card does not expose is a teaching error naming the op"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1" :name "Cat" :type "string/="}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}]}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"op 0.*wire_parameter"
           (with-redefs [metabase.parameters.mapping-targets/target-for-field (constantly nil)]
             (dashboard-ops/compile-ops
              current
              [{:op "wire_parameter" :parameter_id "p1" :dashcard_id 7 :target_field 55}]
              {9 a-card})))))))

(deftest wire-parameter-unknown-parameter-test
  (testing "GHY-4147: wiring a parameter that does not exist names the op index"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"op 0.*nope"
         (dashboard-ops/compile-ops
          {:id 1 :tabs [] :parameters []
           :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}]}
          [{:op "wire_parameter" :parameter_id "nope" :dashcard_id 7 :target_field 55}]
          {9 a-card})))))

(deftest autowire-maps-every-compatible-card-test
  (testing "GHY-4147: autowire wires every card that exposes a compatible target, skipping those that don't"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1" :name "Cat" :type "string/="}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}
                               {:id 8 :card_id 10 :row 4 :col 0 :size_x 4 :size_y 4 :parameter_mappings []}]}
          {:keys [dashcards]} (with-redefs [metabase.parameters.mapping-targets/target-for-field
                                            (fn [card _param field-id]
                                              (when (= 9 (:id card)) [:dimension [:field field-id nil]]))]
                                (dashboard-ops/compile-ops
                                 current
                                 [{:op "wire_parameter" :parameter_id "p1" :dashcard_id 7
                                   :target_field 55 :autowire true}]
                                 {9 {:id 9} 10 {:id 10}}))]
      (is (= 1 (count (:parameter_mappings (first dashcards)))))
      (is (= [] (:parameter_mappings (second dashcards)))))))

(deftest unwire-parameter-test
  (testing "GHY-4147: unwire_parameter clears one card's mapping, or every card's when dashcard_id is omitted"
    (let [current {:id 1 :tabs [] :parameters [{:id "p1"}]
                   :dashcards [{:id 7 :card_id 9 :row 0 :col 0 :size_x 4 :size_y 4
                                :parameter_mappings [{:parameter_id "p1" :card_id 9 :target [:dimension [:field 1 nil]]}]}
                               {:id 8 :card_id 10 :row 4 :col 0 :size_x 4 :size_y 4
                                :parameter_mappings [{:parameter_id "p1" :card_id 10 :target [:dimension [:field 2 nil]]}]}]}]
      (testing "one card"
        (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                                   current [{:op "unwire_parameter" :parameter_id "p1" :dashcard_id 7}] {})]
          (is (= [] (:parameter_mappings (first dashcards))))
          (is (= 1 (count (:parameter_mappings (second dashcards)))))))
      (testing "all cards"
        (let [{:keys [dashcards]} (dashboard-ops/compile-ops
                                   current [{:op "unwire_parameter" :parameter_id "p1"}] {})]
          (is (every? (comp empty? :parameter_mappings) dashcards)))))))
