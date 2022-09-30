(ns metabase-enterprise.serialization.v2.extract
  "Extraction is the first step in serializing a Metabase appdb so it can be eg. written to disk.

  See the detailed descriptions of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require
    [clojure.set :as set]
    [clojure.string :as str]
    [clojure.tools.logging :as log]
    [medley.core :as m]
    [metabase-enterprise.serialization.v2.models :as serdes.models]
    [metabase.models.collection :as collection]
    [metabase.models.serialization.base :as serdes.base]
    [metabase.util.i18n :refer [trs]]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(defn extract-metabase
  "Extracts the appdb into a reducible stream of serializable maps, with `:serdes/meta` keys.

  This is the first step in serialization; see [[metabase-enterprise.serialization.v2.storage]] for actually writing to
  files. Only the models listed in [[serdes.models/exported-models]] get exported.

  Takes an options map which is passed on to [[serdes.base/extract-all]] for each model. The options are documented
  there."
  [opts]
  (log/tracef "Extracting Metabase with options: %s" (pr-str opts))
  (let [model-pred (if (:data-model-only opts)
                     #{"Database" "Dimension" "Field" "FieldValues" "Metric" "Segment" "Table"}
                     (constantly true))]
    (eduction cat (for [model serdes.models/exported-models
                        :when (model-pred model)]
                    (serdes.base/extract-all model opts)))))

(defn- descendant-legal
  [{:keys [on-error] :or {on-error "abort"}} legal-collections [model id :as desc]]
  (letfn [(abort [coll-id]
            (throw (ex-info
                     (trs (str "{0} {1} belongs to Collection {2}, but that Collection is not being serialized. "
                               "Selective serialization requires that all transitive contents belong to the serialized "
                               "collections. Watch for Dashboards that include alien Cards, or Cards that are derived "
                               "from alien Cards.")
                          model id coll-id)
                     {:model             model
                      :id                id
                      :collection_id     coll-id
                      :legal-collections legal-collections})))
          ;; Returns false so that this entity will get skipped.
          (continue [] false)
          (err-fn [coll-id]
            (if (= on-error "continue")
              (continue)
              (abort coll-id)))]
    (cond
      ;; Cards and Dashboards have collection_id parameters.
      (#{"Card" "Dashboard"} model)
      (let [coll-id (db/select-one-field :collection_id (symbol model) :id id)]
        (if (or (nil? coll-id)
                (legal-collections coll-id))
          desc
          (err-fn coll-id)))

      ;; Collections themselves are checked against the set.
      (= model "Collection") (if (legal-collections id)
                               desc
                               (err-fn id))

      ;; DashCards are always included - they don't belong directly to Collections, just their Cards and Dashboards do.
      (= model "DashboardCard") desc)))

;; TODO Properly support "continue" - it should be contagious. Eg. a Dashboard with an illegal Card gets excluded too.
(defn- descendants-closure [opts targets]
  (loop [to-chase (set targets)
         chased   #{}]
    (let [[m i :as item] (first to-chase)
          desc           (serdes.base/serdes-descendants m i)
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
  (let [collection-set (->> (toucan.db/select 'Collection :id [:in collection-ids])
                            (mapcat metabase.models.collection/descendant-ids)
                            set
                            (set/union (set collection-ids)))
        dashboards     (db/select 'Dashboard :collection_id [:in collection-set])
        ;; All cards that are in this collection set.
        cards          (reduce set/union (for [coll-id collection-set]
                                           (db/select-ids 'Card :collection_id coll-id)))

        ;; Map of {dashboard-id #{DashboardCard}} for dashcards whose cards are outside the transitive collection set.
        escaped-dashcards  (into {}
                                 (for [dash  dashboards
                                       :let [dcs (db/select 'DashboardCard :dashboard_id (:id dash))
                                             escapees (->> dcs
                                                           (filter :card_id) ; Text cards have a nil card_id
                                                           (filter (comp not cards :card_id))
                                                           set)]
                                       :when (not (empty? escapees))]
                                   [(:id dash) escapees]))
        ;; {source-card-id target-card-id} the key is in the curated set, the value is not.
        all-cards          (for [id cards]
                             (db/select-one ['Card :id :collection_id :dataset_query] :id id))
        bad-source         (for [card all-cards
                                 :let [src (some-> card :dataset_query :query :source-table)]
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
        problem-cards      (set/union (set (vals escaped-questions))
                                      (set (for [[_ dashcards] escaped-dashcards
                                                 dc            dashcards]
                                             (:card_id dc))))]
    (cond-> nil
      (not (empty? escaped-dashcards)) (assoc :escaped-dashcards escaped-dashcards)
      (not (empty? escaped-questions)) (assoc :escaped-questions escaped-questions)
      (not (empty? problem-cards))     (assoc :problem-cards     problem-cards))))

(defn- collection-label [coll-id]
  (if coll-id
    (let [collection (hydrate (db/select-one 'Collection :id coll-id) :ancestors)
          names      (->> (conj (:ancestors collection) collection)
                          (map :name)
                          (str/join " > "))]
      (format "%d: %s" coll-id names))
    "[no collection]"))

(defn- escape-report
  "Given the analysis map from [[escape-analysis]], report the results in a human-readable format with Card titles etc."
  [{:keys [escaped-dashcards escaped-questions]}]
  (when-not (empty? escaped-dashcards)
    (println "Dashboard cards outside the collection")
    (println "======================================")
    (doseq [[dash-id dashcards] escaped-dashcards
            :let [dash-name (db/select-one-field :name 'Dashboard :id dash-id)]]
      (printf "Dashboard %d: %s\n" dash-id dash-name)
      (doseq [{:keys [card_id col row]} dashcards
              :let [card (db/select-one ['Card :collection_id :name] :id card_id)]]
        (printf "    %dx%d \tCard %d: %s\n"    col row card_id (:name card))
        (printf "        from collection %s\n" (collection-label (:collection_id card))))))

  (when-not (empty? escaped-questions)
    (println "Questions based on outside questions")
    (println "====================================")
    (doseq [[curated-id alien-id] escaped-questions
            :let [curated-card (db/select-one ['Card :collection_id :name] :id curated-id)
                  alien-card   (db/select-one ['Card :collection_id :name] :id alien-id)]]
      (printf "%-4d      %s    (%s)\n  -> %-4d %s    (%s)\n"
              curated-id (:name curated-card) (collection-label (:collection_id curated-card))
              alien-id   (:name alien-card)   (collection-label (:collection_id alien-card))))))

(defn extract-subtrees
  "Extracts the targeted entities and all their descendants into a reducible stream of extracted maps.

  The targeted entities are specified as a list of `[\"SomeModel\" database-id]` pairs.

  [[serdes.base/serdes-descendants]] is recursively called on these entities and all their descendants, until the
  complete transitive closure of all descendants is found. This produces a set of `[\"ModelName\" id]` pairs, which
  entities are then extracted the same way as [[extract-metabase]].

  If the `:selected-collections` option is set, this function will emit warnings if any transitive descendants belong to
  Collections not in the `:selected-collections` set. If `:on-error` is `\"abort\"` (the default) this will throw an
  exception that stops the serialization process. If `:on-error` is `\"continue\"` it will keep emitting warnings, and
  simply skip over the offending entities (recursively). Eg. if Dashboard B includes a Card A that is derived from a
  Card C that's in an alien collection, warnings will be emitted for C, A and B, and all three will be excluded from the
  serialized output."
  [{:keys [selected-collections targets] :as opts}]
  (log/tracef "Extracting subtrees with options: %s" (pr-str opts))
  (if-let [analysis (escape-analysis selected-collections)]
    ;; If that is non-nil, emit the report.
    (escape-report analysis)
    ;; If it's nil, there are no errors, and we can proceed to do the dump.
    (let [closure  (descendants-closure opts targets)
          by-model (->> closure
                        (group-by first)
                        (m/map-vals #(set (map second %))))]
      (eduction cat (for [[model ids] by-model]
                      (eduction (map #(serdes.base/extract-one model opts %))
                                (serdes.base/raw-reducible-query model {:where [:in :id ids]})))))))

(comment
  (extract-metabase {:data-model-only true})

  (escape-report (escape-analysis [200 359]))
  (db/update! 'Card 4318 {:collection_id 200})
  (db/select-one 'Collection :id 441)

  (require '[metabase-enterprise.serialization.v2.storage.yaml])
  (require '[metabase-enterprise.serialization.v2.load])
  (require '[metabase-enterprise.serialization.v2.ingest.yaml])

  ; Complete storage of the selected chunk.
  (let [tmpdir     (clojure.java.io/file "/tmp/stats-export")]
    ; Data model + collections 200,359
    (metabase-enterprise.serialization.v2.storage.yaml/store!
      (extract-metabase {:data-model-only true
                         :database/secrets :reveal})
      tmpdir)
    (metabase-enterprise.serialization.v2.storage.yaml/store!
      (extract-subtrees {:targets [["Collection" 200]
                                   ["Collection" 358]]
                         :selected-collections [200 358]
                         :database/secrets :reveal})
      tmpdir))

  (toucan.db/select-one 'Table :id 7767)
  (toucan.db/select-one 'Collection :name "Trash")
  (metabase.models.serialization.hash/identity-hash (toucan.db/select-one 'Card :id 84))
  (toucan.db/select-one 'Field :id 284674)

  (toucan.db/select-one 'Database :name "Metabase GA") ; Database 5 - it exists
  (toucan.db/select-one 'Table    :id 1135)            ; events__data__object__currencies_supported table, DB 3
  (toucan.db/select-one 'Database :id   5)             ; StitchData-GitHub?
  (toucan.db/select-one 'Dashboard :id   5)
  (toucan.db/select 'DashboardCard :dashboard_id   7)  ; Total DB Creation Events is card 35
  (toucan.db/select 'Card :id 35)                      ; Source table 1135? Also the :segment didn't get decoded.
  (toucan.db/select 'Card :name "Total Downloads")
  (toucan.db/select 'Metric :id 2)
  (metabase.models.serialization.base/serdes-descendants "Card" 4)
  (toucan.db/select 'Table :name "99395697")
  (->> (serdes.base/raw-reducible-query "Card" {:where [:= :id 4]})
       (into [])
       (map #(serdes.base/extract-one "Card" {} %))
       (map serdes.base/serdes-dependencies)
       #_(map #(update % :definition cheshire.core/parse-string true))
       #_(map (juxt :id :archived :definition))
       #_(serdes.base/load-xform))

  (doseq [id [11 8 13 2 3 10 5 6]]
    (toucan.db/update! 'Metric id {:archived true}))

  (-> (metabase-enterprise.serialization.v2.ingest.yaml/ingest-yaml "/tmp/stats-export")
      (metabase-enterprise.serialization.v2.ingest/ingest-one [{:model "Metric" :id "c5b22c5c"}])
      )

  (let [collection-ids #{200 359}
        collection-set (->> (toucan.db/select 'Collection :id [:in collection-ids])
                            (mapcat metabase.models.collection/descendant-ids)
                            set
                            (set/union (set collection-ids)))
        ;; All cards that are in this collection set.
        cards          (reduce set/union (for [coll-id collection-set]
                                           (db/select-ids 'Card :collection_id coll-id)))]
    (for [id cards
          :let [card (toucan.db/select-one 'Card :id id)
                agg  (some-> card :dataset_query :query :aggregation)]
          :when agg]
      [id agg]))

  ; Metrics 2 and 20
  (toucan.db/update! 'Metric 2 :archived false)
  (toucan.db/select-one 'Metric :id 2)

  ; Complete load into an in-memory H2
  (metabase-enterprise.serialization.test-util/with-empty-h2-app-db
    (-> "/tmp/stats-export"
        clojure.java.io/file
        metabase-enterprise.serialization.v2.ingest.yaml/ingest-yaml
        metabase-enterprise.serialization.v2.load/load-metabase))

  (count (into [] ))

  )
