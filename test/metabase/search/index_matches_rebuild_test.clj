(ns ^:synchronized metabase.search.index-matches-rebuild-test
  "A differential test of the live search index against a fresh ingestion: after random sequences of writes through the
  HTTP API to a dashboard and its cards, the index documents of the entities touched equal the documents that
  ingesting those entities from scratch produces. The rebuild is the oracle, so a write that fails to reindex an
  entity, whichever column it changes, shows up without the test naming the columns that feed the index."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;; The index table is made once for all the trials of the property, rather than for each trial. With no appdb engine,
;; as on MySQL, the macro runs nothing, and there is nothing to compare.
(use-fixtures :each
  (fn [f]
    (mt/test-helpers-set-global-values!
      (binding [search.ingestion/*force-sync* true]
        (search.tu/with-appdb-search-if-available-without-fallback
          (f))))))

;;; The oracle

;; The entry's write time, the usage counters that views feed without reindexing, and `dashboardcard_count`, which no
;; write to a dashcard reindexes. That is an accepted trade-off: the DashboardCard hook stays disabled for performance
;; (see `update-dashboard-card!-call-count-test`), and the hourly reindex refreshes the count.
(def ^:private drifting-columns
  "The index columns that legitimately differ between a live index and a rebuild of it."
  #{:updated_at :view_count :last_viewed_at :dashboardcard_count})

(defn- fresh-entry
  "The index entry that ingesting the `search-model` row with `id` from scratch produces, or nil when it is not indexed.
  Leaves out the columns that the app DB computes from the others."
  [search-model id]
  (when-let [document (->> (#'search.ingestion/spec-index-reducible search-model [:= :this.id id])
                           (#'search.ingestion/query->documents)
                           (into [])
                           first)]
    ;; Those are the `extra-entry-fields` that are not plain values, such as the tsvectors of Postgres, which the live
    ;; row holds as database values and the entry as the expressions that compute them. They derive from the name and
    ;; the searchable text, which the entry compares through `name` and, on H2, through the plain `search_terms`
    ;; columns, whose values are kept.
    (let [computed (for [[k v] (specialization/extra-entry-fields document)
                         :when (not (string? v))]
                     k)]
      (apply dissoc (#'search.index/document->entry document) computed))))

(defn- normalize
  "`entry` without the drifting columns, and with its JSON columns parsed so that key order and whitespace don't count."
  [entry]
  (let [strip  #(apply dissoc % drifting-columns)
        decode #(cond-> % (string? %) json/decode+kw)]
    (some-> entry
            (update :model_id str)
            strip
            (update :legacy_input #(some-> % decode strip))
            (update :display_data decode))))

(defn- mismatch
  "The columns of the live index entry of the `search-model` row with `id` that differ from the fresh one, as
  `{column [fresh live]}`, or nil when they match. A row that only one side has is reported whole."
  [search-model id]
  (let [raw-fresh (fresh-entry search-model id)
        fresh     (normalize raw-fresh)
        live      (some-> (t2/select-one (search.index/active-table) :model search-model :model_id (str id))
                          (select-keys (keys raw-fresh))
                          normalize)]
    (cond
      (= fresh live)         nil
      (not (and fresh live)) {:row [fresh live]}
      :else                  (into {}
                                   (keep (fn [k]
                                           (when (not= (get fresh k) (get live k))
                                             [k [(get fresh k) (get live k)]])))
                                   (keys fresh)))))

;;; The world

(defn- scalar-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(defn- make-card! [n]
  (:id (mt/user-http-request :rasta :post 200 "card"
                             {:name                   (str "Rebuild card " n)
                              :display                "scalar"
                              :visualization_settings {}
                              :dataset_query          (scalar-query)})))

(defn- dashboard [id]
  (mt/user-http-request :crowberto :get 200 (str "dashboard/" id)))

(defn- dashcard-payload [dashcard]
  (-> dashcard
      (select-keys [:id :card_id :row :col :size_x :size_y :dashboard_tab_id :visualization_settings
                    :parameter_mappings])
      (assoc :series (mapv #(select-keys % [:id]) (:series dashcard)))))

(defn- put-dashboard!
  "Replace the dashcards of the dashboard `id` with `dashcards`, and its tabs with `tabs`, which defaults to the tabs
  it has, since a write that omits them while the dashcards name one is refused."
  ([user id dashcards]
   (put-dashboard! user id dashcards (mapv #(select-keys % [:id :name]) (:tabs (dashboard id)))))
  ([user id dashcards tabs]
   (mt/user-http-request user :put 200 (str "dashboard/" id) {:dashcards dashcards, :tabs tabs})))

(defn- nth-mod [xs i] (when (seq xs) (nth xs (mod i (count xs)))))

(defn- next-tmp-id
  "A negative id that no dashcard or tab in `xs` has."
  [xs]
  (dec (apply min 0 (keep :id xs))))

;;; The actions

(defn- op-gen
  "A generator of the action `k` with the arguments that `arg-gens` generate."
  [k & arg-gens]
  (apply gen/tuple (gen/return k) arg-gens))

(def ^:private action-gen
  (let [index (gen/choose 0 5)]
    (gen/tuple (gen/elements [:crowberto :rasta])
               ;; Dashcard and series edits come up more often than the rest, being where most of the writes are.
               (gen/frequency
                [[1 (op-gen :rename (gen/elements ["alpha" "beta" "gamma"]))]
                 [1 (op-gen :describe (gen/elements ["" "about sales" "about orders"]))]
                 [1 (op-gen :width (gen/elements ["fixed" "full"]))]
                 [2 (op-gen :add-dashcard index)]
                 [1 (op-gen :remove-dashcard index)]
                 [1 (op-gen :resize-dashcard index (gen/choose 1 12))]
                 [2 (op-gen :set-series index index)]
                 [1 (op-gen :clear-series index)]
                 [1 (gen/return [:add-tab])]
                 [1 (op-gen :revert index)]
                 [1 (gen/return [:archive])]
                 [1 (gen/return [:unarchive])]
                 [1 (op-gen :move (gen/elements [:root :collection]))]
                 [1 (op-gen :card-display index (gen/elements ["bar" "line" "scalar" "table"]))]
                 [1 (op-gen :card-viz-settings index (gen/elements ["a" "b"]))]]))))

(def ^:private allowed-while-archived
  "The actions that an archived dashboard accepts: it refuses every edit but its restoration."
  #{:unarchive :card-display :card-viz-settings})

(defn- perform!
  "Perform the action `op` as `user` through the API, on the dashboard `dash-id` of `world`."
  [{:keys [dash-id card-ids collection-id]} [user [op a b]]]
  (let [dash          (dashboard dash-id)
        dashcards     (mapv dashcard-payload (sort-by :id (:dashcards dash)))
        tabs          (:tabs dash)
        tab-id        (:id (first tabs))
        edit          (fn [body] (mt/user-http-request user :put 200 (str "dashboard/" dash-id) body))
        edit-dashcard (fn [f]
                        (when-let [target (:id (nth-mod dashcards a))]
                          (put-dashboard! user dash-id (mapv #(if (= target (:id %)) (f %) %) dashcards))))
        edit-card     (fn [body]
                        (mt/user-http-request user :put 200 (str "card/" (nth-mod card-ids a)) body))]
    (when-not (and (:archived dash) (not (allowed-while-archived op)))
      (case op
        :rename            (edit {:name a})
        :describe          (edit {:description a})
        :width             (edit {:width a})
        :add-dashcard      (put-dashboard! user dash-id
                                           (conj dashcards (cond-> {:id      (next-tmp-id dashcards)
                                                                    :card_id (nth-mod card-ids a)
                                                                    :row     (* 4 (count dashcards))
                                                                    :col     0
                                                                    :size_x  4
                                                                    :size_y  4
                                                                    :series  []}
                                                             tab-id (assoc :dashboard_tab_id tab-id))))
        :remove-dashcard   (when-let [target (:id (nth-mod dashcards a))]
                             (put-dashboard! user dash-id (into [] (remove #(= target (:id %))) dashcards)))
        :resize-dashcard   (edit-dashcard #(assoc % :size_x b))
        :set-series        (edit-dashcard #(assoc % :series [{:id (nth-mod card-ids b)}]))
        :clear-series      (edit-dashcard #(assoc % :series []))
        :add-tab           (let [new-id (next-tmp-id tabs)
                                 tabs*  (conj (mapv #(select-keys % [:id :name]) tabs)
                                              {:id new-id, :name (str "Tab " (count tabs))})]
                             ;; The new tab takes the dashcards that are on none, which a dashboard has only until it
                             ;; gets its first tab; with tabs already, every dashcard is on one and this changes none.
                             (put-dashboard! user dash-id
                                             (mapv #(update % :dashboard_tab_id (fnil identity new-id)) dashcards)
                                             tabs*))
        :revert            (when-let [revision-id (nth-mod (t2/select-fn-vec :id :model/Revision
                                                                             :model "Dashboard" :model_id dash-id
                                                                             {:order-by [[:id :asc]]})
                                                           a)]
                             (mt/user-http-request user :post 200 "revision/revert"
                                                   {:entity "dashboard", :id dash-id, :revision_id revision-id}))
        :archive           (edit {:archived true})
        :unarchive         (edit {:archived false})
        :move              (edit {:collection_id (when (= a :collection) collection-id)})
        :card-display      (edit-card {:display b})
        :card-viz-settings (edit-card {:visualization_settings {:table.cell_column b}})))))

;;; The property

;; A run of the property takes about 25 seconds of test time on H2 (24.4, 24.3 and 25.6 in three runs at load averages
;; of 6 to 9), which is why it is 30 trials of at most 8 actions.
(def ^:private trials 30)
(def ^:private max-steps 8)

(defn- run-sequence!
  "Run `actions` against a new dashboard of one dashcard.
  Returns nil when the index matched a rebuild after every action, else
  `{:after <the actions up to the first mismatch>, :diff <what differed>}`."
  [actions]
  (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Collection :model/Revision]
    (let [collection-id (:id (mt/user-http-request :crowberto :post 200 "collection" {:name "Rebuild target"}))
          card-ids      (mapv make-card! (range 3))
          dash-id       (:id (mt/user-http-request :rasta :post 200 "dashboard" {:name "Rebuild dashboard"}))
          _             (put-dashboard! :rasta dash-id
                                        [{:id -1, :card_id (first card-ids), :row 0, :col 0, :size_x 4, :size_y 4
                                          :series []}]
                                        [])
          world         {:dash-id dash-id :card-ids card-ids :collection-id collection-id}
          check         (fn []
                          (into {}
                                (keep (fn [[search-model id]]
                                        (when-let [diff (mismatch search-model id)]
                                          [[search-model id] diff])))
                                (cons ["dashboard" dash-id] (map #(vector "card" %) card-ids))))]
      (or (when-let [diff (not-empty (check))]
            {:after :creation, :diff diff})
          (some (fn [[i action]]
                  (perform! world action)
                  (when-let [diff (not-empty (check))]
                    {:after (subvec actions 0 (inc i)), :diff diff}))
                (map-indexed vector actions))))))

(defspec live-index-matches-a-rebuild-test trials
  (prop/for-all [actions (gen/vector action-gen 1 max-steps)]
    (if-let [failure (run-sequence! actions)]
      ;; The failure goes in the exception, which the report of a failed property shows for the smallest actions, and
      ;; not for each sequence that shrinking tries.
      (throw (ex-info (str "The live index differs from a rebuild: " (pr-str failure)) failure))
      true)))
