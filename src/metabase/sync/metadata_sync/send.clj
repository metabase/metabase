(ns metabase.sync.metadata-sync.send
  "The sender's side of `POST /api/warehouse/metadata/changes`: finds the Database a request names and answers with
  the next page of its metadata.

  Request and response bodies hold warehouse metadata, so nothing here logs them."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.sync.metadata-sync.tables :as tables]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- served-database
  "The Database named `database-name` with the engine `engine`, ready to send. Throws an API error with its own code
  when there is no such Database, when there are several, or when its first sync is not complete. The name is
  compared again here: the app DB's collation can ignore case and trailing spaces."
  [database-name engine]
  (let [[database & others] (filter #(and (= database-name (:name %))
                                          (= engine (u/qualified-name (:engine %))))
                                    (sync.db/databases-named database-name))]
    (cond
      (nil? database)
      (throw (ex-info (tru "This Metabase has no {0} Database named {1}." engine (pr-str database-name))
                      {:status-code 404 :error-code wire/database-not-found}))

      (seq others)
      (throw (ex-info (tru "This Metabase has {0} {1} Databases named {2}."
                           (inc (count others)) engine (pr-str database-name))
                      {:status-code 409 :error-code wire/database-ambiguous}))

      (not= "complete" (:initial_sync_status database))
      (throw (ex-info (tru "The first sync of the Database named {0} is not complete." (pr-str database-name))
                      {:status-code 422 :error-code wire/database-not-ready}))

      :else
      database)))

(defn- counts-by-table [rows count-key]
  (into {} (map (juxt :table_id count-key)) rows))

(defn- candidates
  "For each kind, the Tables of `selected` it pages and the weight of each, from grouped counts that read no values.
  Links page only the Tables with an FK, and stats only the Tables with a row count or `:full` FieldValues, so a
  Database with none of them costs no answer for that kind."
  [database-id selected]
  (let [field-counts (counts-by-table (sync.db/described-field-counts database-id) :field_count)
        fk-counts    (counts-by-table (sync.db/described-fk-counts database-id) :fk_count)
        value-counts (counts-by-table (sync.db/described-full-field-values-counts database-id) :field_values_count)]
    {"tables"  {:candidates selected
                :weight #(inc (field-counts (:id %) 0))
                :limit  pages/table-field-limit}
     "links"   {:candidates (filterv (comp fk-counts :id) selected)
                :weight (comp fk-counts :id)
                :limit  pages/link-limit}
     "stats"   {:candidates (filterv #(or (:estimated_row_count %) (value-counts (:id %))) selected)
                :weight #(max 1 (value-counts (:id %) 0))
                :limit  pages/stats-field-values-limit}}))

(defn- tables-batch
  "`[batch covered cut?]`: the tables batch of the Tables `taken`, all of which it covers."
  [taken _selected]
  [(when (seq taken)
     {:type "tables" :tables (tables/entries taken)})
   taken
   false])

(defn- links-batch
  "`[batch covered cut?]`: the links batch of the Tables `taken`, with link targets in `selected`, which covers all of
  `taken`. A Table whose FKs all point out of the selection has no links, and is not in the batch."
  [taken selected]
  (let [table-links (links/table-links taken selected)
        entries     (vec (for [{table-id :id :as table} taken
                               :let  [table-links (table-links table-id)]
                               :when table-links]
                           {:schema (:schema table) :name (:name table) :links table-links}))]
    [(when (seq entries) {:type "links" :tables entries}) taken false]))

(defn- add-stats
  "`acc` with the stats of the Tables of `group`, in order, while their size fits in [[pages/stats-byte-limit]], and
  `:cut` when one did not fit. The first entry of a batch always fits, so each page moves on."
  [acc group]
  (let [table-stats (stats/table-stats group)]
    (reduce (fn [{:keys [entries size covered] :as acc} {table-id :id :as table}]
              (if-let [entry (some->> (table-stats table-id) (merge {:schema (:schema table) :name (:name table)}))]
                (let [size (+ size (stats/stats-size entry))]
                  (if (and (seq entries) (> size pages/stats-byte-limit))
                    (reduced (assoc acc :cut true))
                    (assoc acc :entries (conj entries entry) :size size :covered (conj covered table))))
                (assoc acc :covered (conj covered table))))
            acc
            group)))

(defn- stats-batch
  "`[batch covered cut?]`: the stats batch of the first of the Tables `taken` whose stats fit in
  [[pages/stats-byte-limit]], the Tables it covers, and whether it stopped before the end of `taken`. The stats are
  read [[pages/stats-read-tables]] Tables at a time, so a page reads at most one group of Tables that it does not
  send."
  [taken _selected]
  (let [{:keys [entries covered cut]} (reduce (fn [acc group]
                                                (let [acc (add-stats acc group)]
                                                  (cond-> acc (:cut acc) reduced)))
                                              {:entries [] :size 0 :covered []}
                                              (partition-all pages/stats-read-tables taken))]
    [(when (seq entries) {:type "stats" :tables entries}) covered (boolean cut)]))

(def ^:private build-batch
  {"tables"  tables-batch
   "links"   links-batch
   "stats"   stats-batch})

(defn- page
  "The page of `kind` after the key `after`: its batch, or nil when its Tables have nothing to send, the key of the
  last Table it covered, and whether Tables of `kind` are left."
  [{:keys [candidates weight limit]} kind after selected]
  (let [{taken :tables more :more} (pages/page candidates weight after limit)
        [batch covered cut]        ((build-batch kind) (vec taken) selected)]
    {:batch batch
     :last  (some-> (peek covered) pages/table-key)
     :more  (or more cut)}))

(defn- past-empty-kinds
  "`cursor`, or, when it is the start of a kind with no Tables to page, the start of the next kind that has some, or
  nil."
  [cursor by-kind]
  (loop [cursor cursor]
    (if (and cursor (nil? (:key cursor)) (empty? (get-in by-kind [(:kind cursor) :candidates])))
      (recur (pages/next-cursor (:kind cursor) nil false))
      cursor)))

(mu/defn- next-page :- [:map {:closed true}
                        [:batch [:maybe ::wire/batch]]
                        [:next  [:maybe ::pages/cursor]]]
  "The first page from the cursor `after` that has something to send, and the cursor after it, past the kinds that
  have no Tables to page."
  [database-id :- ::lib.schema.id/database
   selected    :- [:sequential ::sync.db/described-table]
   after       :- [:maybe ::pages/cursor]]
  (let [by-kind (candidates database-id selected)]
    (loop [cursor (past-empty-kinds (or after {:kind (first pages/kinds)}) by-kind)]
      (if (nil? cursor)
        {:batch nil :next nil}
        (let [{:keys [kind key]}        cursor
              {:keys [batch last more]} (page (by-kind kind) kind key selected)
              next-cursor               (past-empty-kinds (pages/next-cursor kind last more) by-kind)]
          (if (or batch (nil? next-cursor))
            {:batch batch :next next-cursor}
            (recur next-cursor)))))))

(mu/defn changes-response :- ::wire/response
  "The answer to `request`: the next page of the metadata of the Database it names, and the cursor of the page after
  it, when there is one. The first answer, with no `after`, also holds the database values first."
  [{database-name :database :keys [engine schema_filters after]} :- ::wire/request]
  (let [{database-id :id :as database} (served-database database-name engine)
        selected                       (tables/selection database-id schema_filters)
        {:keys [batch next]}           (next-page database-id selected after)]
    (cond-> {:format_version wire/format-version
             :batches        (cond-> []
                               (nil? after) (conj (merge {:type "database"} (wire/database-values database)))
                               batch        (conj batch))}
      next (assoc :next next))))
