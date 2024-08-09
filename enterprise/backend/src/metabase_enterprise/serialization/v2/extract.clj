(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.models :refer [Card Collection Dashboard DashboardCard]]
   [metabase.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
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
   If user-id is nil, do not include any personally-owned collections.

  Does not export ee-only analytics collections."
  [user-id]
  (let [roots (t2/select Collection {:where [:and [:= :location "/"]
                                                  [:or [:= :personal_owner_id nil]
                                                       [:= :personal_owner_id user-id]]
                                                  [:or [:= :namespace nil]
                                                       [:!= :namespace "analytics"]]]})]
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
        cards          (reduce set/union #{} (for [coll-id collection-set]
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

(defn- card-label [card-id]
  (let [card (t2/select-one [Card :collection_id :name] :id card-id)]
    (format "Card %d (%s from collection %s)" card-id (:name card) (collection-label (:collection_id card)))))

(defn- escape-report
  "Given the analysis map from [[escape-analysis]], report the results in a human-readable format with Card titles etc."
  [{:keys [escaped-dashcards escaped-questions]}]
  (when-not (empty? escaped-dashcards)
    (doseq [[dash-id card-ids] escaped-dashcards
            :let [dash-name (t2/select-one-fn :name Dashboard :id dash-id)]]
      (log/warnf "Failed to export Dashboard %d (%s) containing Cards saved outside requested collections: %s"
                 dash-id dash-name (str/join ", " (map card-label card-ids)))))

  (when-not (empty? escaped-questions)
    (log/warnf "Failed to export Cards based on questions outside requested collections: %s"
               (str/join ", " (for [[curated-id alien-id] escaped-questions]
                                (str (card-label curated-id) " -> " (card-label alien-id)))))))

(defn- extract-subtrees
  "Extracts the targeted entities and all their descendants into a reducible stream of extracted maps.

  The targeted entities are specified as a list of `[\"SomeModel\" pk-or-entity-id]` pairs.

  [[serdes/descendants]] is recursively called on these entities and all their descendants, until the
  complete transitive closure of all descendants is found. This produces a set of `[\"ModelName\" id]` pairs, which
  entities are then extracted the same way as [[extract-metabase]].
Eg. if Dashboard B includes a Card A that is derived from a
  Card C that's in an alien collection, warnings will be emitted for C, A and B, and all three will be excluded from the
  serialized output."
  [{:keys [targets] :as opts}]
  (log/tracef "Extracting subtrees with options: %s" (pr-str opts))
  (let [targets  (->> targets
                      (mapv (fn [[model-name id :as target]]
                              (if (number? id)
                                target
                                [model-name (serdes/eid->id model-name id)]))))
        analysis (escape-analysis targets)]
    (if analysis
      ;; If that is non-nil, emit the report.
      (escape-report analysis)
      ;; If it's nil, there are no errors, and we can proceed to do the dump.
      ;; TODO This is not handled at all, but we should be able to exclude illegal data - and it should be
      ;; contagious. Eg. a Dashboard with an illegal Card gets excluded too.
      (let [nodes       (set/union
                         (u/traverse targets #(serdes/ascendants (first %) (second %)))
                         (u/traverse targets #(serdes/descendants (first %) (second %))))
            models      (model-set opts)
            ;; filter the selected models based on user options
            by-model    (-> (group-by first nodes)
                            (select-keys models)
                            (update-vals #(set (map second %))))
            extract-ids (fn [[model ids]]
                          (eduction (map #(serdes/log-and-extract-one model opts %))
                                    (t2/reducible-select (symbol model) :id [:in ids])))]
        (eduction cat
                  [(eduction (map extract-ids) cat by-model)
                   ;; extract all non-content entities like data model and settings if necessary
                   (eduction (map #(serdes/extract-all % opts)) cat (remove (set serdes.models/content) models))])))))

(defn extract
  "Returns a reducible stream of entities to serialize"
  [{:keys [targets] :as opts}]
  (serdes.backfill/backfill-ids!)
  (if (seq targets)
    (extract-subtrees opts)
    (extract-metabase opts)))
