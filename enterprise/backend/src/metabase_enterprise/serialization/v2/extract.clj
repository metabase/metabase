(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models :refer [Card Collection Dashboard DashboardCard]]
   [metabase.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn collection-set-for-user
  "Given an optional user ID, find the transitive set of all Collection IDs which are either:
  (a) global (ie. no one's personal collection);
  (b) owned by this user (when user ID is non-nil); or
  (c) descended from one of the above."
  [user-or-nil]
  (let [roots    (t2/select ['Collection :id :location :personal_owner_id] :location "/")
        unowned  (remove :personal_owner_id roots)
        owned    (when user-or-nil
                   (filter #(= user-or-nil (:personal_owner_id %)) roots))
        top-ids  (->> (concat owned unowned)
                      (map :id)
                      set)]
    (->> (concat unowned owned)
         (map collection/descendant-ids)
         (reduce set/union top-ids)
         (set/union #{nil}))))

(defn extract-metabase
  "Extracts the appdb into a reducible stream of serializable maps, with `:serdes/meta` keys.

  This is the first step in serialization; see [[metabase-enterprise.serialization.v2.storage]] for actually writing to
  files. Only the models listed in [[serdes.models/exported-models]] get exported.

  Takes an options map which is passed on to [[serdes/extract-all]] for each model. The options are documented
  there."
  [opts]
  (log/tracef "Extracting Metabase with options: %s" (pr-str opts))
  (serdes.backfill/backfill-ids)
  ;; TODO document and test data-model-only if we want to keep this feature...
  (let [model-pred (cond
                     (:data-model-only opts)
                     #{"Database" "Dimension" "Field" "FieldValues" "Metric" "Segment" "Table"}

                     (:include-field-values opts)
                     (constantly true)

                     :else
                     (complement #{"FieldValues"}))
        ;; This set of unowned top-level collections is used in several `extract-query` implementations.
        opts       (assoc opts :collection-set (collection-set-for-user (:user opts)))]
    (eduction cat (for [model serdes.models/exported-models
                        :when (model-pred model)]
                    (serdes/extract-all model opts)))))

;; TODO Properly support "continue" - it should be contagious. Eg. a Dashboard with an illegal Card gets excluded too.
(defn- descendants-closure [_opts targets]
  (loop [to-chase (set targets)
         chased   #{}]
    (let [[m i :as item] (first to-chase)
          desc           (serdes/descendants m i)
          chased         (conj chased item)
          to-chase       (set/union (disj to-chase item) (set/difference desc chased))]
      (if (empty? to-chase)
        chased
        (recur to-chase chased)))))

(defn- escape-analysis
  "Given a seq of collection IDs, explore the contents of these collections looking for \"leaks\". For example, a
  Dashboard that contains Cards which are not (transitively) in the given set of collections, or a Card that depends on
  a Card as a model, which is not in the given collections.

  Returns a data structure detailing the gaps. Use [[escape-report]] to output this data in a human-friendly format.
  Returns nil if there are no escaped values, which is useful for a test."
  [collection-ids]
  (let [collection-set (->> (t2/select Collection :id [:in (set collection-ids)])
                            (mapcat metabase.models.collection/descendant-ids)
                            set
                            (set/union (set collection-ids)))
        dashboards     (t2/select Dashboard :collection_id [:in collection-set])
        ;; All cards that are in this collection set.
        cards          (reduce set/union (for [coll-id collection-set]
                                           (t2/select-pks-set Card :collection_id coll-id)))

        ;; Map of {dashboard-id #{DashboardCard}} for dashcards whose cards OR parameter-bound cards are outside the
        ;; transitive collection set.
        escaped-dashcards  (into {}
                                 (for [dash  dashboards
                                       :let [dcs (t2/select DashboardCard :dashboard_id (:id dash))
                                             escapees (->> dcs
                                                           (keep :card_id) ; Text cards have a nil card_id
                                                           set)
                                             params   (->> dcs
                                                           (mapcat :parameter_mappings)
                                                           (keep :card_id)
                                                           set)
                                             combined (set/difference (set/union escapees params) cards)]
                                       :when (seq combined)]
                                   [(:id dash) combined]))
        ;; {source-card-id target-card-id} the key is in the curated set, the value is not.
        all-cards          (for [id cards]
                             (t2/select-one [Card :id :collection_id :dataset_query] :id id))
        bad-source         (for [card all-cards
                                 :let [^String src (some-> card :dataset_query :query :source-table)]
                                 :when (and (string? src) (.startsWith src "card__"))
                                 :let [card-id (Integer/parseInt (.substring src 6))]
                                 :when (not (cards card-id))]
                             [(:id card) card-id])
        bad-template-tags  (for [card all-cards
                                 :let [card-ids (some->> card :dataset_query :native
                                                         :template-tags vals (keep :card-id))]
                                 card-id card-ids
                                 :when   (not (cards card-id))]
                             [(:id card) card-id])
        escaped-questions  (into {} (concat bad-source bad-template-tags))
        problem-cards      (reduce set/union (set (vals escaped-questions)) (vals escaped-dashcards))]
    (cond-> nil
      (seq escaped-dashcards) (assoc :escaped-dashcards escaped-dashcards)
      (seq escaped-questions) (assoc :escaped-questions escaped-questions)
      (seq problem-cards)     (assoc :problem-cards     problem-cards))))

(defn- collection-label [coll-id]
  (if coll-id
    (let [collection (hydrate (t2/select-one Collection :id coll-id) :ancestors)
          names      (->> (conj (:ancestors collection) collection)
                          (map :name)
                          (str/join " > "))]
      (format "%d: %s" coll-id names))
    "[no collection]"))

(defn- escape-report
  "Given the analysis map from [[escape-analysis]], report the results in a human-readable format with Card titles etc."
  [{:keys [escaped-dashcards escaped-questions]}]
  (when-not (empty? escaped-dashcards)
    (log/info "Dashboard cards outside the collection")
    (log/info "======================================")
    (doseq [[dash-id card-ids] escaped-dashcards
            :let [dash-name (t2/select-one-fn :name Dashboard :id dash-id)]]
      (log/infof "Dashboard %d: %s\n" dash-id dash-name)
      (doseq [card_id card-ids
              :let [card (t2/select-one [Card :collection_id :name] :id card_id)]]
        (log/infof "          \tCard %d: %s\n"    card_id (:name card))
        (log/infof "        from collection %s\n" (collection-label (:collection_id card))))))

  (when-not (empty? escaped-questions)
    (log/info "Questions based on outside questions")
    (log/info "====================================")
    (doseq [[curated-id alien-id] escaped-questions
            :let [curated-card (t2/select-one [Card :collection_id :name] :id curated-id)
                  alien-card   (t2/select-one [Card :collection_id :name] :id alien-id)]]
      (log/infof "%-4d      %s    (%s)\n  -> %-4d %s    (%s)\n"
                 curated-id (:name curated-card) (collection-label (:collection_id curated-card))
                 alien-id   (:name alien-card)   (collection-label (:collection_id alien-card))))))

(defn extract-subtrees
  "Extracts the targeted entities and all their descendants into a reducible stream of extracted maps.

  The targeted entities are specified as a list of `[\"SomeModel\" database-id]` pairs.

  [[serdes/descendants]] is recursively called on these entities and all their descendants, until the
  complete transitive closure of all descendants is found. This produces a set of `[\"ModelName\" id]` pairs, which
  entities are then extracted the same way as [[extract-metabase]].
Eg. if Dashboard B includes a Card A that is derived from a
  Card C that's in an alien collection, warnings will be emitted for C, A and B, and all three will be excluded from the
  serialized output."
  [{:keys [targets] :as opts}]
  (log/tracef "Extracting subtrees with options: %s" (pr-str opts))
  (serdes.backfill/backfill-ids)
  (if-let [analysis (escape-analysis (set (for [[model id] targets :when (= model "Collection")] id)))]
      ;; If that is non-nil, emit the report.
    (escape-report analysis)
      ;; If it's nil, there are no errors, and we can proceed to do the dump.
    (let [closure  (descendants-closure opts targets)
          by-model (->> closure
                        (group-by first)
                        (m/map-vals #(set (map second %))))]
      (eduction cat (for [[model ids] by-model]
                      (eduction (map #(serdes/extract-one model opts %))
                                (db/select-reducible (symbol model) :id [:in ids])))))))
