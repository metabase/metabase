(ns metabase-enterprise.semantic-search.duplicates
  "Persistence and small pure helpers for semantic duplicate question snapshots."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.settings.core :as setting]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(def ^:const similarity-threshold
  "Initial normalized semantic similarity threshold for potential duplicates. This is not a confidence score."
  0.82)

(def ^:const cosine-distance-threshold
  "The pgvector cosine-distance equivalent of [[similarity-threshold]]."
  0.36)

(def ^:private default-status
  {:state                       "pending"
   :processed_questions        0
   :total_questions             0
   :last_successful_completion nil
   :last_error                 nil
   :snapshot_revision           nil})

(defn question-search-text
  "Build the exact source text used by the duplicate matcher."
  [title description]
  (->> [title description]
       (remove str/blank?)
       (str/join "\n")
       str/trim))

(defn similarity-from-cosine-distance
  "Map pgvector cosine distance to Metabase's normalized semantic similarity score."
  [distance]
  (- 1 (/ distance 2)))

(defn qualifies-distance?
  "Whether an exact pgvector cosine distance meets the duplicate threshold."
  [distance]
  (<= distance cosine-distance-threshold))

(defn canonical-pair
  "Return a canonical, non-self pair or nil."
  [question-id-1 question-id-2]
  (let [question-id-1 (some-> question-id-1 long)
        question-id-2 (some-> question-id-2 long)]
    (when (and question-id-1 question-id-2 (not= question-id-1 question-id-2))
      (if (< question-id-1 question-id-2)
        [question-id-1 question-id-2]
        [question-id-2 question-id-1]))))

(defn- normalize-status
  [status]
  (merge default-status
         (into {} (map (fn [[key value]] [(keyword key) value])) status)))

(defn backfill-status
  "Read the internal backfill status with stable keyword keys."
  []
  (normalize-status (semantic.settings/semantic-duplicates-backfill-status)))

(defn- set-status!
  "Merge and persist the current backfill status."
  [updates]
  (let [status (merge (backfill-status) updates)]
    (setting/set-value-of-type! :json :semantic-duplicates-backfill-status status)
    status))

(defn recover-stale-status!
  "Make an interrupted run visible as pending when the application starts again."
  []
  (when (= "running" (:state (backfill-status)))
    (set-status! {:state "pending" :last_error "The previous duplicate scan was interrupted."})))

(defn mark-running!
  "Record the start of a complete duplicate scan."
  [total-questions]
  (set-status! {:state "running"
                :processed_questions 0
                :total_questions total-questions
                :last_error nil}))

(defn mark-progress!
  "Persist progress after a completed source batch."
  [processed-questions]
  (set-status! {:state "running" :processed_questions processed-questions}))

(defn mark-failed!
  "Record a failed scan while leaving the last successful snapshot untouched."
  [^Throwable error]
  (set-status! {:state "failed" :last_error (ex-message error)}))

(defn mark-succeeded!
  "Persist successful completion and return the new opaque snapshot revision."
  [processed-questions total-questions pair-count]
  (let [revision (str (UUID/randomUUID))]
    (set-status! {:state "succeeded"
                  :processed_questions processed-questions
                  :total_questions total-questions
                  :last_successful_completion (str (Instant/now))
                  :last_error nil
                  :snapshot_revision revision
                  :pair_count pair-count})
    revision))

(defn eligible-question-where
  "The live, non-archived saved-question predicate used for both scan sources and target revalidation."
  [table-prefix]
  (let [name        (keyword (str table-prefix ".name"))
        description (keyword (str table-prefix ".description"))]
    [:and
     [:= (keyword (str table-prefix ".type")) "question"]
     [:= (keyword (str table-prefix ".archived")) false]
     [:or
      [:and [:not= name nil] [:not= [:trim name] ""]]
      [:and [:not= description nil] [:not= [:trim description] ""]]]]))

(defn eligible-question-count
  "Count live saved questions that have nonblank title or description text."
  []
  (-> (t2/query {:select [[:%count.* :count]]
                 :from   [:report_card]
                 :where  (eligible-question-where "report_card")})
      first
      :count))

(defn eligible-questions
  "Fetch a keyset-paged batch of source questions. Blank title/description rows are excluded in Clojure as well as SQL
  so whitespace-only values do not trigger an embedding call."
  [last-id batch-size]
  (let [where (cond-> (eligible-question-where "report_card")
                last-id (conj [:> :report_card.id last-id]))
        rows  (t2/query {:select   [:report_card.id :report_card.name :report_card.description]
                         :from     [:report_card]
                         :where    where
                         :order-by [[:report_card.id :asc]]
                         :limit    batch-size})]
    {:questions (filter (fn [{:keys [name description]}]
                          (not (str/blank? (question-search-text name description))))
                        rows)
     :last-id  (some-> rows last :id)}))

(defn live-eligible-question-ids
  "Revalidate vector-index IDs against the application database in one query."
  [ids]
  (if (seq ids)
    (->> (t2/query {:select [:report_card.id]
                    :from   [:report_card]
                    :where  [:and
                             (eligible-question-where "report_card")
                             [:in :report_card.id ids]]})
         (map :id)
         set)
    #{}))

(defn- visible-question-where
  [{:keys [user-id is-superuser?]}]
  [:and
   [:= :rc.type "question"]
   [:= :rc.archived false]
   (collection/visible-collection-filter-clause
    :rc.collection_id
    {:include-trash-collection? false}
    {:current-user-id user-id :is-superuser? is-superuser?})])

(defn- visible-question-ids-subquery
  [visibility]
  ^:allow-subquery
  {:select [:rc.id]
   :from   [[:report_card :rc]]
   :where  (visible-question-where visibility)})

(defn- visible-pairs-where
  [visibility]
  (let [ids (visible-question-ids-subquery visibility)]
    [:and
     [:in :question_id_1 ids]
     [:in :question_id_2 ids]]))

(defn- hydrate-questions
  [ids visibility]
  (if (seq ids)
    (into {}
          (map (juxt :id #(select-keys % [:id :name :display_type])))
          (t2/query {:select [:rc.id :rc.name [:rc.display :display_type]]
                     :from   [[:report_card :rc]]
                     :where  [:and
                              (visible-question-where visibility)
                              [:in :rc.id ids]]}))
    {}))

(defn list-page
  "Return a visible pair page and its bidirectional in-memory expansion from one app-DB read transaction."
  [{:keys [limit offset] :as page} visibility]
  (t2/with-transaction [_]
    (let [where       (visible-pairs-where visibility)
          pairs       (t2/query {:select   [:question_id_1 :question_id_2]
                                 :from     [:semantic_duplicates]
                                 :where    where
                                 :order-by [[:question_id_1 :asc] [:question_id_2 :asc]]
                                 :limit    limit
                                 :offset   offset})
          total       (-> (t2/query {:select [[:%count.* :total]]
                                     :from   [:semantic_duplicates]
                                     :where  where})
                          first
                          :total)
          adjacency   (reduce (fn [result {:keys [question_id_1 question_id_2]}]
                                (-> result
                                    (update question_id_1 (fnil conj #{}) question_id_2)
                                    (update question_id_2 (fnil conj #{}) question_id_1)))
                              {}
                              pairs)
          questions   (hydrate-questions (keys adjacency) visibility)
          data        (->> adjacency
                           (sort-by key)
                           (keep (fn [[question-id duplicate-ids]]
                                   (when-let [question (get questions question-id)]
                                     {:question   question
                                      :duplicates (->> duplicate-ids
                                                       sort
                                                       (keep questions)
                                                       vec)})))
                           vec)]
      (merge page
             {:data              data
              :total             total
              :pair_count        (count pairs)
              :snapshot_revision (:snapshot_revision (backfill-status))}))))

(defn publish-pairs!
  "Replace the complete duplicate snapshot in one short app-DB transaction."
  [pairs processed-questions total-questions]
  (t2/with-transaction [_]
    (t2/query ["DELETE FROM semantic_duplicates"])
    (doseq [batch (partition-all 500 pairs)]
      (when (seq batch)
        (t2/query {:insert-into :semantic_duplicates
                   :columns     [:question_id_1 :question_id_2]
                   :values      batch})))
    (mark-succeeded! processed-questions total-questions (count pairs))))
