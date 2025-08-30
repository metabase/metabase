(ns dev.branching
  (:require
   [metabase.branching.core :as branching]
   [metabase.test.initialize.test-users :as tu]
   [toucan2.core :as t2]))

(defn create-sample-branch-setup!
  "Creates a development branch setup with cards, copies, and mappings.
   This is a development/testing version that simulates branching functionality
   without requiring the enterprise branching models.

   Returns a map with:
   - :branch - simulated branch data
   - :original-cards - the original card instances
   - :copied-cards - the copied card instances
   - :mappings - simulated branch model mappings
   - :dashboard - dashboard referencing original cards"
  [& {:keys [branch-name card-count copy-ratio collection-id]
      :or {branch-name "dev-branch"
           card-count 5
           copy-ratio 0.6
           collection-id nil}}]
  (tu/init!)
  (let [user (t2/select-one :model/User :email "rasta@metabase.com")
        branch (t2/insert-returning-instance! :model/Branch {:name branch-name})

        ;; Determine collection
        target-collection (if collection-id
                            (t2/select-one :model/Collection :id collection-id)
                            (t2/insert-returning-instance! :model/Collection
                                                           {:name (str "Branch Collection - " branch-name)}))

        ;; Create original cards
        original-cards (vec
                        (for [i (range card-count)]
                          (t2/insert-returning-instance! :model/Card
                                                         {:name (str "Original Card " (inc i))
                                                          :collection_id (:id target-collection)
                                                          :dataset_query {:database 1
                                                                          :type :native
                                                                          :native {:query (str "SELECT " (inc i) " as result")}}
                                                          :display "table"
                                                          :visualization_settings {}
                                                          :creator_id (:id user)})))

        ;; Determine which cards to copy based on ratio
        cards-to-copy-count (int (* card-count copy-ratio))
        cards-to-copy (take cards-to-copy-count original-cards)

        ;; Create copied cards
        copied-cards (vec
                      (for [original-card cards-to-copy]
                        (t2/insert-returning-instance! :model/Card
                                                       {:name (str "Branched " (:name original-card))
                                                        :collection_id (:id target-collection)
                                                        :dataset_query (update (:dataset_query original-card)
                                                                               :native
                                                                               assoc :query "SELECT 420 as result -- BRANCHED VERSION")
                                                        :display (:display original-card)
                                                        :visualization_settings (:visualization_settings original-card)
                                                        :creator_id (:id user)})))

        ;; Simulate branch model mappings (as data, not DB records)
        mappings (vec
                  (for [[original copied] (map vector cards-to-copy copied-cards)]
                    (t2/insert-returning-instance! :model/BranchModelMapping
                                                   {:branch_id (:id branch)
                                                    :model_type "report_card"
                                                    :original_id (:id original)
                                                    :branched_model_id (:id copied)})))

        ;; Create dashboard referencing original cards
        dashboard (t2/insert-returning-instance! :model/Dashboard
                                                 {:name (str "Dashboard for " branch-name)
                                                  :collection_id (:id target-collection)
                                                  :creator_id (:id user)})

        ;; Create dashboard cards linking to original cards
        dashcards (vec
                   (for [[idx original-card] (map-indexed vector original-cards)]
                     (t2/insert-returning-instance! :model/DashboardCard
                                                    {:dashboard_id (:id dashboard)
                                                     :card_id (:id original-card)
                                                     :row (* idx 2)
                                                     :col 0
                                                     :size_x 4
                                                     :size_y 2})))]

    {:branch branch
     :collection target-collection
     :original-cards original-cards
     :copied-cards copied-cards
     :mappings mappings
     :dashboard dashboard
     :dashcards dashcards}))

(defn resolve-branched-id
  "Simulated version of resolve-branched-id that uses in-memory mappings."
  [mappings model-type original-id branch-id]
  (or (->> mappings
           (filter #(and (= (:model_type %) (name model-type))
                         (= (:original_id %) original-id)
                         (= (:branch_id %) branch-id)))
           first
           :branched_model_id)
      original-id))

(defn print-branch-summary
  "Prints a summary of the created branch setup."
  [{:keys [branch collection original-cards copied-cards mappings dashboard]}]
  (println "=== Branch Setup Summary ===")
  (println (format "Branch: %s (ID: %s, Slug: %s)"
                   (:name branch) (:id branch) (:slug branch)))
  (println (format "Collection: %s (ID: %s)"
                   (:name collection) (:id collection)))
  (println (format "Original Cards: %d" (count original-cards)))
  (println (format "Copied Cards: %d" (count copied-cards)))
  (println (format "Mappings: %d" (count mappings)))
  (println (format "Dashboard: %s (ID: %s)"
                   (:name dashboard) (:id dashboard)))
  (println "\n=== Card Mappings ===")
  (doseq [{:keys [original_id branched_model_id]} mappings]
    (let [original-name (:name (t2/select-one :model/Card :id original_id))
          branched-name (:name (t2/select-one :model/Card :id branched_model_id))]
      (println (format "%s -> %s" original-name branched-name))))

  (println "\n=== Example Usage ===")
  (println "To resolve branched IDs:")
  (doseq [card original-cards]
    (let [resolved-id (resolve-branched-id mappings :card (:id card) (:id branch))]
      (if (not= resolved-id (:id card))
        (println (format "Card %d resolves to branched card %d" (:id card) resolved-id))
        (println (format "Card %d has no branch mapping, uses original" (:id card)))))))

(defn cleanup-branch-setup!
  "Cleans up a branch setup by deleting all created entities."
  [{:keys [branch collection original-cards copied-cards mappings dashboard dashcards]}]
  (println "Cleaning up branch setup...")

  ;; Delete in reverse dependency order
  (when dashcards
    (doseq [dashcard dashcards]
      (t2/delete! :model/DashboardCard :id (:id dashcard))))

  (when dashboard
    (t2/delete! :model/Dashboard :id (:id dashboard)))

  ;; Note: mappings are just data, no DB cleanup needed

  (when copied-cards
    (doseq [card copied-cards]
      (t2/delete! :model/Card :id (:id card))))

  (when original-cards
    (doseq [card original-cards]
      (t2/delete! :model/Card :id (:id card))))

  (when collection
    (t2/delete! :model/Collection :id (:id collection)))

  ;; Note: branch is simulated data, no DB cleanup needed

  (println "Cleanup complete."))

(comment
  ;; Example usage:

  ;; Create a branch setup
  (def setup (create-sample-branch-setup!))

  ;; Print summary
  (print-branch-summary setup)

  ;; Test resolving branched IDs
  (resolve-branched-id (:mappings setup) :card
                       (-> setup :original-cards first :id)
                       (-> setup :branch :id))

  ;; Create with custom options
  (def custom-setup (create-sample-branch-setup!
                     :branch-name "feature-xyz"
                     :card-count 8
                     :copy-ratio 0.5))

  ;; Clean up when done
  (cleanup-branch-setup! setup)
  (cleanup-branch-setup! custom-setup))

(comment
  (binding [branching/*enable-branch-hook* true
            branching/*current-branch* (atom (t2/select-one :model/Branch :id 392))]
    (t2/debug
      (time (t2/select-one :model/Card :id 75)))))

(comment
  (let [cards (t2/select :model/Card)]
    (binding [branching/*enable-branch-hook* false]
      (time (count (map #(t2/select-one :model/Card :id %) (map :id (mapcat #(repeat 5 %) cards))))))))
