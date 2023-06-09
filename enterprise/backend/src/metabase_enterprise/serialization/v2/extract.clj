(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models :refer [Card Collection Dashboard DashboardCard]]
   [metabase.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- model-set
  "Returns a set of models to export based on export opts"
  [opts]
  (cond-> #{}
    (:include-field-values opts)
    (conj "FieldValues")

    (not (:no-collections opts))
    (into serdes.models/content)

    (not (:no-data-model opts))
    (into serdes.models/data-model)

    (not (:no-settings opts))
    (conj "Setting")))

(defn targets-of-type
  "Returns target seq filtered on given model name"
  [targets model-name]
  (filter #(= (first %) model-name) targets))

(defn make-targets-of-type
  "Returns a targets seq with model type and given ids"
  [model-name ids]
  (mapv vector (repeat model-name) ids))

(defn- collection-set-for-user
  "Returns a set of collection IDs to export for the provided user, if any.
   If user-id is nil, do not include any personally-owned collections."
  [user-id]
  (let [roots (t2/select Collection {:where [:and [:= :location "/"]
                                                  [:or [:= :personal_owner_id nil]
                                                       [:= :personal_owner_id user-id]]]})]
    ;; start with the special "nil" root collection ID
    (-> #{nil}
        (into (map :id) roots)
        (into (mapcat collection/descendant-ids) roots))))

(defn- extract-metabase
  "Returns reducible stream of serializable entity maps, with `:serdes/meta` keys.
   Takes an options map which is passed on to [[serdes/extract-all]] for each model."
  [{:keys [user-id] :as opts}]
  (log/tracef "Extracting Metabase with options: %s" (pr-str opts))
  (let [extract-opts (assoc opts :collection-set (collection-set-for-user user-id))]
    (eduction (map #(serdes/extract-all % extract-opts)) cat (model-set opts))))

;; TODO Properly support "continue" - it should be contagious. Eg. a Dashboard with an illegal Card gets excluded too.
(defn- descendants-closure [targets]
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
  "Given a target seq, explore the contents of any collections looking for \"leaks\". For example, a
  Dashboard that contains Cards which are not (transitively) in the given set of collections, or a Card that depends on
  a Card as a model, which is not in the given collections.

  Returns a data structure detailing the gaps. Use [[escape-report]] to output this data in a human-friendly format.
  Returns nil if there are no escaped values, which is useful for a test."
  [targets]
  (let [collection-ids (into #{} (map second) (targets-of-type targets "Collection"))
        collection-set (into collection-ids (mapcat collection/descendant-ids) (t2/select Collection :id [:in collection-ids]))
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
    (let [collection (t2/hydrate (t2/select-one Collection :id coll-id) :ancestors)
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

(defn- extract-subtrees
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
  (if-let [analysis (escape-analysis targets)]
    ;; If that is non-nil, emit the report.
    (escape-report analysis)
    ;; If it's nil, there are no errors, and we can proceed to do the dump.
    (let [closure     (descendants-closure targets)
          models      (model-set opts)
          ;; filter the selected models based on user options
          by-model    (-> (group-by first closure)
                          (select-keys models)
                          (update-vals #(set (map second %))))
          extract-ids (fn [[model ids]]
                        (eduction (map #(serdes/extract-one model opts %))
                                  (db/select-reducible (symbol model) :id [:in ids])))]
      (eduction cat
                [(eduction (map extract-ids) cat by-model)
                 ;; extract all non-content entities like data model and settings if necessary
                 (eduction (map #(serdes/extract-all % opts)) cat (remove (set serdes.models/content) models))]))))

(defn extract
  "Returns a reducible stream of entities to serialize"
  [{:keys [targets] :as opts}]
  (serdes.backfill/backfill-ids)
  (if (seq targets)
    (extract-subtrees opts)
    (extract-metabase opts)))
