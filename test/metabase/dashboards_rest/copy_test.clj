(ns metabase.dashboards-rest.copy-test
  "DB-free unit tests for the dashboard-copy orchestrator. The whole point of the biff.fx-inspired `fx`-injection
  design is that [[metabase.dashboards-rest.copy/copy-dashboard!]] can be exercised with in-memory stub effects -
  no `with-temp`, no `with-current-user`, no database. These tests assert both the returned data (`:dashboard`,
  `:effects`) and the exact sequence of write effects, including the insert -> new-id -> dashcards feedback chain."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.analytics.core :as analytics]
   [metabase.dashboards-rest.copy :as copy]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- pure helpers ---------------------------------------------------

(deftest ^:parallel dashboard-data-test
  (testing "request values win over the original; falls back to original when absent"
    (is (= {:name "New" :description "orig-desc" :parameters [] :creator_id 7
            :collection_id 3 :collection_position 2 :width "fixed"}
           (copy/dashboard-data {:name "New" :collection_id 3 :collection_position 2}
                                {:name "Orig" :description "orig-desc" :width "fixed"}
                                7))))
  (testing "nil parameters fall back to an empty vector"
    (is (= [] (:parameters (copy/dashboard-data {} {} 1))))))

(deftest ^:parallel card-copy-specs-test
  (testing "every copied card is re-pointed at the destination collection"
    (is (= [[1 {:id 1 :name "A" :collection_id 99}]]
           (copy/card-copy-specs {1 {:id 1 :name "A"}} 100 false 99))))
  (testing "copying within the same collection renames with ' - Duplicate'"
    (is (= "A - Duplicate"
           (-> (copy/card-copy-specs {1 {:id 1 :name "A"}} 100 true 99) first second :name))))
  (testing "Dashboard Questions are re-parented to the new dashboard id"
    (is (= 100
           (-> (copy/card-copy-specs {1 {:id 1 :name "A" :dashboard_id 5}} 100 false 99)
               first second :dashboard_id)))))

(deftest ^:parallel tab-copy-specs-test
  (testing "db-managed keys are stripped and the tab is re-parented"
    (is (= [{:name "T1" :dashboard_id 100}]
           (copy/tab-copy-specs 100 [{:id 9 :entity_id "x" :created_at :t :updated_at :t :name "T1"}])))))

;;; ------------------------------------------- fx stubbing harness ------------------------------------------------

(defn- recording-fx
  "Returns `[fx calls]` where `fx` is a stub effect map that records every call into the `calls` atom as
  `[handler-key & args]` and returns deterministic fakes, and `calls` is the atom holding the call log."
  []
  (let [calls (atom [])
        record (fn [k ret-fn]
                 (fn [& args]
                   (swap! calls conj (into [k] args))
                   (ret-fn args)))]
    [{:reconcile-position! (record :reconcile-position! (constantly nil))
      ;; insert returns a fixed new dashboard id -> drives the feedback chain
      :insert-dashboard!   (record :insert-dashboard! (constantly {:id 100 :name "copy"}))
      ;; each created card gets id = old-id + 1000, so we can assert the id remapping
      :create-card!        (record :create-card! (fn [[card-data]] {:id (+ 1000 (:id card-data)) :name (:name card-data)}))
      :insert-tabs!        (record :insert-tabs! (fn [[specs]] (map-indexed (fn [i _] (+ 200 i)) specs)))
      :add-dashcards!      (record :add-dashcards! (constantly true))
      :check-remote-sync!  (record :check-remote-sync! (constantly nil))}
     calls]))

(defn- calls-of [calls k] (filter #(= k (first %)) @calls))

;;; ------------------------------------------- orchestrator tests -------------------------------------------------

;; not ^:parallel — kondo flags copy-dashboard! as destructive (it is not, but the ! suffix triggers the linter)
(deftest copy-dashboard!-minimal-test
  (testing "a dashboard with no cards/tabs: inserts the dashboard, adds no dashcards, returns events"
    (let [[fx calls] (recording-fx)
          ctx {:request {:name "My copy" :collection_id 3 :is_deep_copy false}
               :existing-dashboard {:name "Orig" :dashcards [] :tabs []}
               :creator-id 7}
          {:keys [dashboard effects]} (copy/copy-dashboard! ctx fx)]
      (testing "returns the inserted dashboard"
        (is (= {:id 100 :name "copy"} dashboard)))
      (testing "inserts exactly one dashboard with merged data"
        (is (= 1 (count (calls-of calls :insert-dashboard!))))
        (is (= "My copy" (-> (calls-of calls :insert-dashboard!) first second :name))))
      (testing "no cards copied, no tabs inserted, no dashcards added"
        (is (empty? (calls-of calls :create-card!)))
        (is (empty? (calls-of calls :insert-tabs!)))
        (is (empty? (calls-of calls :add-dashcards!))))
      (testing "tail effects are returned as data: analytics + dashboard-create only"
        (is (= [[:analytics :snowplow/dashboard {:event :dashboard-created :dashboard-id 100}]
                [:event :event/dashboard-create {:object {:id 100 :name "copy"} :user-id 7}]]
               effects))))))

;; NOTE: not ^:parallel — these tests with-redef the global mi/can-read? var, which is not thread-safe.
(deftest copy-dashboard!-deep-copy-feedback-chain-test
  (testing "deep copy: card is copied (effect), its NEW id flows into the inserted dashcard (feedback chain)"
    ;; cards-to-copy reads ambient permission state via mi/can-read?; stub it readable for a DB-free test.
    (with-redefs [mi/can-read? (constantly true)
                  mi/model (constantly :model/Card)]
      (let [card {:id 1 :name "Q1" :type :question}
            ctx {:request {:is_deep_copy true :collection_id 3}
                 :existing-dashboard {:name "Orig"
                                      :collection_id 99 ;; different dest -> no rename
                                      :dashcards [{:card_id 1 :card card}]
                                      :tabs []}
                 :creator-id 7}
            [fx calls] (recording-fx)
            {:keys [effects]} (copy/copy-dashboard! ctx fx)]
        (testing "the readable question gets created"
          (is (= 1 (count (calls-of calls :create-card!)))))
        (testing "the dashcard added points at the NEW card id (1 -> 1001), proving the feedback chain"
          (let [[[_ _dash [dashcard]]] (calls-of calls :add-dashcards!)]
            (is (= 1001 (:card_id dashcard)))))
        (testing "a :card-create event is emitted for the new card, before the dashboard-create event"
          (is (= [[:analytics :snowplow/dashboard {:event :dashboard-created :dashboard-id 100}]
                  [:event :event/card-create {:object {:id 1001 :name "Q1"} :user-id 7}]
                  [:event :event/dashboard-create {:object {:id 100 :name "copy"} :user-id 7}]]
                 effects)))))))

;; not ^:parallel — kondo flags copy-dashboard! as destructive (it is not, but the ! suffix triggers the linter)
(deftest copy-dashboard!-discard-test
  (testing "unreadable cards are discarded and surfaced as :uncopied on the result dashboard"
    ;; a plain map card has no model (mi/model -> nil), so cards-to-copy treats it as unreadable -> :discard.
    ;; This exercises the discard branch with zero redefs, so it stays parallel-safe.
    (let [ctx {:request {:is_deep_copy true :collection_id 3}
               :existing-dashboard {:name "Orig" :collection_id 99
                                    :dashcards [{:card_id 1 :card {:id 1 :type :question}}]
                                    :tabs []}
               :creator-id 7}
          [fx calls] (recording-fx)
          {:keys [dashboard]} (copy/copy-dashboard! ctx fx)]
      (testing "nothing gets created and no dashcards are added"
        (is (empty? (calls-of calls :create-card!)))
        (is (empty? (calls-of calls :add-dashcards!))))
      (testing "the discarded card is attached as :uncopied"
        (is (= [{:id 1 :type :question}] (:uncopied dashboard)))))))

;; NOTE: not ^:parallel — with-redefs of the global mi/can-read? var is not thread-safe.
(deftest copy-dashboard!-tabs-test
  (testing "tabs are inserted and the dashcard's tab id is remapped old -> new"
    (with-redefs [mi/can-read? (constantly true)
                  mi/model (constantly :model/Card)]
      (let [ctx {:request {:is_deep_copy true :collection_id 99}
                 :existing-dashboard {:name "Orig" :collection_id 99
                                      :tabs [{:id 9 :name "T"}]
                                      :dashcards [{:card_id 1 :card {:id 1 :type :question} :dashboard_tab_id 9}]}
                 :creator-id 7}
            [fx calls] (recording-fx)]
        (copy/copy-dashboard! ctx fx)
        (testing "one tab insert happened"
          (is (= 1 (count (calls-of calls :insert-tabs!)))))
        (testing "the dashcard's tab id is remapped from old 9 to the new 200"
          (let [[[_ _dash [dashcard]]] (calls-of calls :add-dashcards!)]
            (is (= 200 (:dashboard_tab_id dashcard)))))))))

;; not ^:parallel — with-redefs of global event/analytics vars is not thread-safe.
(deftest run-effects!-test
  (testing "run-effects! dispatches tuples to the right side-effecting fn"
    (let [fired (atom [])]
      (with-redefs [events/publish-event! (fn [& a] (swap! fired conj (into [:event] a)))
                    analytics/track-event! (fn [& a] (swap! fired conj (into [:analytics] a)))]
        (copy/run-effects! [[:analytics :snowplow/dashboard {:dashboard-id 100}]
                            [:event :event/dashboard-create {:object {:id 100}}]])
        (is (= [[:analytics :snowplow/dashboard {:dashboard-id 100}]
                [:event :event/dashboard-create {:object {:id 100}}]]
               @fired))))))
