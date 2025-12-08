(ns metabase-enterprise.metabot-v3.models.metabot-use-case
  "Model for Metabot use cases (e.g., nlq, sql, transforms, omnibot, embedding).

  Use cases are predefined configurations that map to AI service profiles.
  Each metabot has a set of available use cases that are initialized on first access."
  (:require
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Default Use Cases ------------------------------------------------

(def ^:private internal-metabot-use-cases
  "Default use cases for the internal metabot."
  [{:name "nlq"}
   {:name "sql"}
   {:name "transforms"}
   {:name "omnibot"}])

(def ^:private embedded-metabot-use-cases
  "Default use cases for the embedded metabot."
  [{:name "embedding"}])

(defn default-use-cases-for-metabot
  "Return the default use cases for a metabot based on its entity_id."
  [metabot-entity-id]
  (cond
    (= metabot-entity-id (get-in metabot-v3.config/metabot-config
                                 [metabot-v3.config/internal-metabot-id :entity-id]))
    internal-metabot-use-cases

    (= metabot-entity-id (get-in metabot-v3.config/metabot-config
                                 [metabot-v3.config/embedded-metabot-id :entity-id]))
    embedded-metabot-use-cases

    :else
    []))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotUseCase [_model] :metabot_use_case)

(doto :model/MetabotUseCase
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;;; -------------------------------------------- Ensure Defaults Exist -----------------------------------------------

(defn- create-missing-use-cases!
  "Create any missing default use cases for a metabot. Returns the use cases that were created."
  [metabot-id metabot-entity-id existing-use-case-names]
  (let [defaults  (default-use-cases-for-metabot metabot-entity-id)
        to-create (remove #(contains? existing-use-case-names (:name %)) defaults)]
    (when (seq to-create)
      (log/infof "Creating %d default use case(s) for metabot %d: %s"
                 (count to-create) metabot-id (pr-str (map :name to-create)))
      (t2/insert-returning-instances! :model/MetabotUseCase
                                      (map #(assoc % :metabot_id metabot-id) to-create)))))

(defn use-cases-for-metabot
  "Return all use cases for a metabot, creating defaults if any are missing."
  [metabot-id]
  (when-let [{:keys [entity_id]} (t2/select-one [:model/Metabot :entity_id] :id metabot-id)]
    (let [existing      (t2/select :model/MetabotUseCase :metabot_id metabot-id {:order-by [[:name :asc]]})
          existing-names (into #{} (map :name) existing)
          defaults      (default-use-cases-for-metabot entity_id)]
      (if (every? #(contains? existing-names (:name %)) defaults)
        ;; All defaults exist, return existing
        existing
        ;; Some defaults missing, create them and combine
        (let [created (create-missing-use-cases! metabot-id entity_id existing-names)]
          (sort-by :name (concat existing created)))))))

(defn use-case-for-metabot
  "Return a specific use case for a metabot by name, creating defaults if missing."
  [metabot-id use-case-name]
  (when-let [{:keys [entity_id]} (t2/select-one [:model/Metabot :entity_id] :id metabot-id)]
    (let [existing (t2/select-one :model/MetabotUseCase :metabot_id metabot-id :name use-case-name)]
      (if existing
        existing
        ;; Use case doesn't exist, create all missing defaults and return the requested one
        (let [existing-names (into #{} (map :name) (t2/select :model/MetabotUseCase :metabot_id metabot-id))
              created        (create-missing-use-cases! metabot-id entity_id existing-names)]
          (some #(when (= (:name %) use-case-name) %) created))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Metabot :use_cases]
  "Hydrate the list of use cases for a collection of metabots, creating defaults if missing."
  [_model hydration-key metabots]
  (let [metabot-ids    (map :id metabots)
        metabot-by-id  (into {} (map (juxt :id identity)) metabots)
        ;; Select all existing use cases in one query
        all-existing   (when (seq metabot-ids)
                         (t2/select :model/MetabotUseCase
                                    {:where    [:in :metabot_id metabot-ids]
                                     :order-by [[:name :asc]]}))
        existing-by-metabot (group-by :metabot_id all-existing)
        ;; Check each metabot for missing defaults and create them
        created-by-metabot
        (into {}
              (for [{:keys [id entity_id]} metabots
                    :let [existing-names (into #{} (map :name) (get existing-by-metabot id))
                          defaults       (default-use-cases-for-metabot entity_id)]
                    :when (not (every? #(contains? existing-names (:name %)) defaults))]
                [id (create-missing-use-cases! id entity_id existing-names)]))
        ;; Combine existing and created
        final-by-metabot
        (into {}
              (for [metabot-id metabot-ids]
                [metabot-id (sort-by :name (concat (get existing-by-metabot metabot-id)
                                                   (get created-by-metabot metabot-id)))]))]
    (mi/instances-with-hydrated-data
     metabots hydration-key
     (constantly final-by-metabot)
     :id
     {:default []})))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/hash-fields :model/MetabotUseCase
  [_table]
  [:metabot_id :name])

(defmethod serdes/generate-path "MetabotUseCase" [_ entity]
  (conj (serdes/generate-path "Metabot" (t2/select-one :model/Metabot (:metabot_id entity)))
        (serdes/infer-self-path "MetabotUseCase" entity)))

(defmethod serdes/make-spec "MetabotUseCase" [_model-name _opts]
  {:copy      [:entity_id :name]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :metabot_id (serdes/parent-ref)}})
