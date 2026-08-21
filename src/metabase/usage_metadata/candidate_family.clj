(ns metabase.usage-metadata.candidate-family
  "Deterministic family ordering and display presentation for persisted candidates."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-definitions :as definitions]
   [metabase.usage-metadata.candidate-suggestions :as candidate-suggestions]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.string :as u.str]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private update-batch-size 500)

(defn- candidate-atom-details
  [{:keys [candidate_type semantic_details]}]
  (case candidate_type
    :segment (:atoms semantic_details)
    :measure (:condition-atoms semantic_details)
    nil))

(defn- candidate-family-domain
  [{:keys [table_id candidate_type modeling_status definition]}]
  [table_id
   candidate_type
   (if (= modeling_status :modeled) :modeled :suggested)
   (when (= candidate_type :measure)
     (definitions/measure-base definition))])

(defn- candidate-with-atom-signatures
  [candidate]
  (if (contains? candidate ::atom-signatures)
    candidate
    (assoc candidate ::atom-signatures
           (into #{} (map :signature) (candidate-atom-details candidate)))))

(defn- candidate-primary-parent
  [candidate candidates-by-atom-set]
  (let [candidate-atoms (::atom-signatures candidate)]
    (when (seq candidate-atoms)
      ;; Mining limits definitions to five atoms, so exact subset lookups are bounded.
      (some (fn [parent-atom-count]
              (->> (math.combo/combinations (sort candidate-atoms) parent-atom-count)
                   (mapcat #(get candidates-by-atom-set (set %)))
                   (sort-by definitions/candidate-priority-key)
                   first))
            (range (dec (count candidate-atoms)) -1 -1)))))

(defn candidate-family-parent-index
  "Choose one deterministic largest-subset parent for each related candidate."
  [candidates]
  (let [candidates            (mapv candidate-with-atom-signatures candidates)
        candidates-by-domain  (group-by candidate-family-domain candidates)
        candidates-by-domain-and-atoms
        (update-vals candidates-by-domain #(group-by ::atom-signatures %))]
    (into {}
          (keep (fn [candidate]
                  (when-let [parent (candidate-primary-parent
                                     candidate
                                     (get candidates-by-domain-and-atoms
                                          (candidate-family-domain candidate)))]
                    [(:id candidate) (:id parent)])))
          candidates)))

(defn- candidate-root-id
  [candidate-id parent-index]
  (loop [id candidate-id]
    (if-let [parent-id (parent-index id)]
      (recur parent-id)
      id)))

(defn- ordered-candidate-atoms
  [candidate parent-order]
  (let [atom-signatures (::atom-signatures candidate)
        inherited       (filterv atom-signatures parent-order)
        remaining       (->> atom-signatures (remove (set inherited)) sort vec)]
    (into inherited remaining)))

(defn- family-display-name
  [candidate atom-order]
  (let [details-by-signature (u/index-by :signature (candidate-atom-details candidate))
        atom-names           (mapv (comp :display-name details-by-signature) atom-order)
        condition-name       (when (every? some? atom-names)
                               (i18n/join-strings-with-conjunction (trs "and") atom-names))]
    (u.str/elide
     (or
      (when condition-name
        (case (:candidate_type candidate)
          :segment condition-name
          :measure (when-let [base-name (get-in candidate [:semantic_details :base-name])]
                     (trs "{0} where {1}" base-name condition-name))))
      (:suggested_name candidate))
     candidate-suggestions/candidate-name-max-length)))

(defn- ordered-atom-details
  [candidate atom-order]
  (let [details-by-signature (u/index-by :signature (candidate-atom-details candidate))]
    (mapv details-by-signature atom-order)))

(defn- ordered-family
  [root children-index candidates-by-id]
  (letfn [(walk [candidate parent-order]
            (let [atom-order (ordered-candidate-atoms candidate parent-order)
                  children   (sort-by
                              (fn [child]
                                [(definitions/candidate-priority-key child)
                                 (->> (::atom-signatures child)
                                      (remove (::atom-signatures candidate))
                                      sort
                                      vec)])
                              (map candidates-by-id (children-index (:id candidate))))]
              (into [{:candidate candidate, :atom-order atom-order}]
                    (mapcat #(walk % atom-order))
                    children)))]
    (walk root [])))

(defn candidate-families
  "Return candidates in stable family order with their display presentation."
  [candidates]
  (let [candidates          (mapv candidate-with-atom-signatures candidates)
        candidates-by-id    (u/index-by :id candidates)
        parent-index        (candidate-family-parent-index candidates)
        children-index      (update-vals (group-by val parent-index) #(mapv key %))
        families-by-root-id (group-by #(candidate-root-id (:id %) parent-index) candidates)]
    (->> families-by-root-id
         (map (fn [[root-id members]]
                {:root (candidates-by-id root-id), :members members}))
         (sort-by (fn [{:keys [root members]}]
                    [(definitions/candidate-priority-key
                      (first (sort-by definitions/candidate-priority-key members)))
                     (:signature root)
                     (:id root)]))
         (mapcat (fn [{:keys [root]}]
                   (ordered-family root children-index candidates-by-id)))
         (map-indexed
          (fn [sort-position {:keys [candidate atom-order]}]
            {:candidate-id     (:id candidate)
             :display-name     (family-display-name candidate atom-order)
             :semantic-details (assoc (:semantic_details candidate)
                                      :display-atoms
                                      (ordered-atom-details candidate atom-order))
             :sort-position    sort-position}))
         vec)))

(defn materialize!
  "Persist deterministic family ordering and display presentation for one run."
  [run-id]
  (let [candidates (t2/select [:model/UsageMetadataCandidate
                               :id :table_id :candidate_type :modeling_status
                               :signature_hash :signature :definition :semantic_details
                               :suggested_name :verified_source_count :official_source_count
                               :distinct_source_count :complexity :recent_view_count]
                              :run_id run-id)]
    (doseq [families (partition-all update-batch-size (candidate-families candidates))]
      (let [case-by-id (fn [column value-fn]
                         (into [:case]
                               (concat (mapcat (fn [{:keys [candidate-id] :as family}]
                                                 [[:= :id candidate-id] (value-fn family)])
                                               families)
                                       [:else column])))]
        (t2/query
         {:update (t2/table-name :model/UsageMetadataCandidate)
          :set    {:display_name     (case-by-id :display_name :display-name)
                   :semantic_details (case-by-id :semantic_details (comp mi/json-in :semantic-details))
                   :sort_position    (case-by-id :sort_position :sort-position)}
          :where  [:in :id (mapv :candidate-id families)]})))))
