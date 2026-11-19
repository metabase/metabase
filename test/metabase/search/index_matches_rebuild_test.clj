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

(def ^:private drifting-columns
  "The index columns that legitimately differ between a live index and a rebuild of it: the time the entry was
  written, the usage counters that views feed without reindexing, and the count of dashcards of a card, a subquery
  attribute that no write to a dashcard reindexes. The
  stale count is an accepted trade-off: the DashboardCard hook stays disabled for performance (see
  `update-dashboard-card!-call-count-test`), and the hourly reindex refreshes the count."
  #{:updated_at :view_count :last_viewed_at :dashboardcard_count})

(defn- fresh-entry
  "The index entry that ingesting the `search-model` row with `id` from scratch produces, or nil when it is not indexed.
  The columns that the app DB computes from the others are left out: the `extra-entry-fields` that are not plain values,
  such as the tsvectors of Postgres, which the live row holds as database values and the entry as the expressions that
  compute them. They derive from the name and the searchable text, which the entry compares through `name` and, on H2,
  through the plain `search_terms` columns, whose values are kept."
  [search-model id]
  (when-let [document (->> (#'search.ingestion/spec-index-reducible search-model [:= :this.id id])
                           (#'search.ingestion/query->documents)
                           (into [])
                           first)]
    (let [computed (for [[k v] (specialization/extra-entry-fields document)
                         :when (not (string? v))]
                     k)]
      (apply dissoc (#'search.index/document->entry document) computed))))

(defn- normalize
  "`entry` without the drifting columns, and with its JSON columns parsed so that key order and whitespace don't count."
  [entry]
  (some-> entry
          (update :model_id str)
          (as-> e (apply dissoc e drifting-columns))
          (update :legacy_input #(cond-> % (string? %) json/decode+kw))
          (update :display_data #(cond-> % (string? %) json/decode+kw))
          (update :legacy_input #(some-> % (as-> li (apply dissoc li drifting-columns)) (dissoc :updated_at)))))

(defn- mismatch
  "The columns of the live index entry of the `search-model` row with `id` that differ from the fresh one, as
  `{column [fresh live]}`, or nil when they match. A row that only one side has is reported whole."
  [search-model id]
  (let [fresh-entry (fresh-entry search-model id)
        fresh       (some-> fresh-entry normalize)
        live        (some-> (t2/select-one (search.index/active-table) :model search-model :model_id (str id))
                            (select-keys (keys fresh-entry))
                            normalize)]
    (cond
      (= fresh live)           nil
      (not (and fresh live))   {:row [fresh live]}
      :else                    (into {}
                                     (keep (fn [k]
                                             (when (not= (get fresh k) (get live k))
                                               [k [(get fresh k) (get live k)]])))
                                     (set (concat (keys fresh) (keys live)))))))

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
      (select-keys [:id :card_id :row :col :size_x :size_y :dashboard_tab_id :visualization_settings :parameter_mappings])
      (assoc :series (mapv #(select-keys % [:id]) (:series dashcard)))))

(defn- put-dashboard!
  "Replace the dashcards of the dashboard `id` with `dashcards`, and its tabs with `tabs`, which defaults to the tabs
  it has, since a write that omits them while the dashcards name one is refused."
  [user id dashcards tabs]
  (mt/user-http-request user :put 200 (str "dashboard/" id)
                        {:dashcards dashcards
                         :tabs      (or tabs (mapv #(select-keys % [:id :name]) (:tabs (dashboard id))))}))

(defn- nth-mod [xs i] (when (seq xs) (nth xs (mod i (count xs)))))

(defn- next-tmp-id
  "A negative id that no dashcard or tab in `xs` has."
  [xs]
  (dec (apply min 0 (keep :id xs))))

;;; The actions

(def ^:private action-gen
  (let [index (gen/choose 0 5)]
    (gen/tuple (gen/elements [:crowberto :rasta])
               ;; Dashcard and series edits come up more often than the rest, being where most of the writes are.
               (gen/frequency
                [[1 (gen/tuple (gen/return :rename) (gen/elements ["alpha" "beta" "gamma"]))]
                 [1 (gen/tuple (gen/return :describe) (gen/elements ["" "about sales" "about orders"]))]
                 [1 (gen/tuple (gen/return :width) (gen/elements ["fixed" "full"]))]
                 [2 (gen/tuple (gen/return :add-dashcard) index)]
                 [1 (gen/tuple (gen/return :remove-dashcard) index)]
                 [1 (gen/tuple (gen/return :resize-dashcard) index (gen/choose 1 12))]
                 [2 (gen/tuple (gen/return :set-series) index index)]
                 [1 (gen/tuple (gen/return :clear-series) index)]
                 [1 (gen/tuple (gen/return :add-tab))]
                 [1 (gen/tuple (gen/return :revert) index)]
                 [1 (gen/tuple (gen/return :archive))]
                 [1 (gen/tuple (gen/return :unarchive))]
                 [1 (gen/tuple (gen/return :move) (gen/elements [:root :collection]))]
                 [1 (gen/tuple (gen/return :card-display) index (gen/elements ["bar" "line" "scalar" "table"]))]
                 [1 (gen/tuple (gen/return :card-viz-settings) index (gen/elements ["a" "b"]))]]))))

(defn- dashcard-at [dash i]
  (nth-mod (sort-by :id (:dashcards dash)) i))

(defn- perform!
  "Perform `action` as `user` through the API, on the dashboard `dash-id` of `world`."
  [{:keys [dash-id card-ids collection-id]} user [op & [a b]]]
  (let [dash      (dashboard dash-id)
        dashcards (mapv dashcard-payload (sort-by :id (:dashcards dash)))
        tabs      (:tabs dash)
        tab-id    (:id (first tabs))
        replace-at (fn [f] (let [target (:id (dashcard-at dash a))]
                             (mapv #(if (= target (:id %)) (f %) %) dashcards)))
        edit      (fn [body] (mt/user-http-request user :put 200 (str "dashboard/" dash-id) body))]
    ;; an archived dashboard refuses every edit but its restoration
    (case (if (and (:archived dash) (not (#{:unarchive :card-display :card-viz-settings} op))) :skip op)
      :skip            nil
      :rename          (edit {:name a})
      :describe        (edit {:description a})
      :width           (edit {:width a})
      :add-dashcard    (put-dashboard! user dash-id
                                       (conj dashcards (cond-> {:id     (next-tmp-id dashcards)
                                                                :card_id (nth-mod card-ids a)
                                                                :row    (* 4 (count dashcards))
                                                                :col    0
                                                                :size_x 4
                                                                :size_y 4
                                                                :series []}
                                                         tab-id (assoc :dashboard_tab_id tab-id)))
                                       nil)
      :remove-dashcard (when-let [target (:id (dashcard-at dash a))]
                         (put-dashboard! user dash-id (into [] (remove #(= target (:id %))) dashcards) nil))
      :resize-dashcard (when (seq dashcards)
                         (put-dashboard! user dash-id (replace-at #(assoc % :size_x b)) nil))
      :set-series      (when (seq dashcards)
                         (put-dashboard! user dash-id
                                         (replace-at #(assoc % :series [{:id (nth-mod card-ids b)}]))
                                         nil))
      :clear-series    (when (seq dashcards)
                         (put-dashboard! user dash-id (replace-at #(assoc % :series [])) nil))
      :add-tab         (let [new-id (next-tmp-id tabs)
                             tabs*  (conj (mapv #(select-keys % [:id :name]) tabs) {:id new-id :name (str "Tab " (count tabs))})]
                         ;; The new tab takes the dashcards that are on none, which a dashboard has only until it gets
                         ;; its first tab; with tabs already, every dashcard is on one and this changes none.
                         (put-dashboard! user dash-id
                                         (mapv #(cond-> % (nil? (:dashboard_tab_id %)) (assoc :dashboard_tab_id new-id))
                                               dashcards)
                                         tabs*))
      :revert          (when-let [revision-id (nth-mod (t2/select-fn-vec :id :model/Revision
                                                                         :model "Dashboard" :model_id dash-id
                                                                         {:order-by [[:id :asc]]})
                                                       a)]
                         (mt/user-http-request user :post 200 "revision/revert"
                                               {:entity "dashboard" :id dash-id :revision_id revision-id}))
      :archive         (edit {:archived true})
      :unarchive       (edit {:archived false})
      :move            (edit {:collection_id (when (= a :collection) collection-id)})
      :card-display    (when-let [card-id (nth-mod card-ids a)]
                         (mt/user-http-request user :put 200 (str "card/" card-id) {:display b}))
      :card-viz-settings (when-let [card-id (nth-mod card-ids a)]
                           (mt/user-http-request user :put 200 (str "card/" card-id)
                                                 {:visualization_settings {:table.cell_column b}})))))

;;; The property

(def ^:private trials 30)
(def ^:private max-steps 8)

(defn- run-sequence!
  "Run `actions` against a new dashboard of one dashcard, returning nil when the index matched a rebuild after every one, or the first
  action after which it did not, with the sequence up to it and what differed."
  [actions]
  (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Collection :model/Revision]
    (let [collection-id (:id (mt/user-http-request :crowberto :post 200 "collection" {:name "Rebuild target"}))
          card-ids      (mapv make-card! (range 3))
          dash-id       (:id (mt/user-http-request :rasta :post 200 "dashboard" {:name "Rebuild dashboard"}))
          _             (put-dashboard! :rasta dash-id
                                        [{:id -1 :card_id (first card-ids) :row 0 :col 0 :size_x 4 :size_y 4 :series []}]
                                        [])
          world         {:dash-id dash-id :card-ids card-ids :collection-id collection-id}
          check         (fn []
                          (into {}
                                (keep (fn [[search-model id]]
                                        (when-let [diff (mismatch search-model id)]
                                          [[search-model id] diff])))
                                (cons ["dashboard" dash-id] (map #(vector "card" %) card-ids))))]
      (or (when-let [diff (not-empty (check))]
            {:after :creation :diff diff})
          (reduce (fn [done [i action]]
                    (perform! world (first action) (second action))
                    (if-let [diff (not-empty (check))]
                      (reduced {:after (subvec (vec actions) 0 (inc i)) :diff diff})
                      done))
                  nil
                  (map-indexed vector actions))))))

(defspec live-index-matches-a-rebuild-test trials
  (prop/for-all [actions (gen/vector action-gen 1 max-steps)]
    (if-let [failure (run-sequence! actions)]
      ;; The failure goes in the exception, which the report of a failed property shows for the smallest actions, and
      ;; not for each sequence that shrinking tries.
      (throw (ex-info (str "The live index differs from a rebuild: " (pr-str failure)) failure))
      true)))
