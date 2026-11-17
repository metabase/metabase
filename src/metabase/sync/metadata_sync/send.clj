(ns metabase.sync.metadata-sync.send
  "The sender's side of `POST /api/warehouse/metadata/changes`: finds the Database a request names and answers with
  the next page of its metadata.

  Request and response bodies hold warehouse metadata, so nothing here logs them."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.metadata-sync.document :as document]
   [metabase.sync.metadata-sync.links :as links]
   [metabase.sync.metadata-sync.pages :as pages]
   [metabase.sync.metadata-sync.stats :as stats]
   [metabase.sync.metadata-sync.wire :as wire]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]))

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
  "For each kind, the `tables` it pages and the weight of each, from grouped counts that read no values. Links page
  only the Tables with an FK, and stats only the Tables with a row count or `:full` FieldValues, so a Database with
  none of them costs no answer for that kind."
  [database-id tables]
  (let [field-counts (counts-by-table (sync.db/described-field-counts database-id) :field_count)
        fk-counts    (counts-by-table (sync.db/described-fk-counts database-id) :fk_count)
        value-counts (counts-by-table (sync.db/described-full-field-values-counts database-id) :field_values_count)]
    {"objects" {:tables tables
                :weight #(inc (field-counts (:id %) 0))
                :limit  pages/object-field-limit}
     "links"   {:tables (filterv (comp fk-counts :id) tables)
                :weight (comp fk-counts :id)
                :limit  pages/link-limit}
     "stats"   {:tables (filterv #(or (:estimated_row_count %) (value-counts (:id %))) tables)
                :weight #(max 1 (value-counts (:id %) 0))
                :limit  pages/stats-field-values-limit}}))

(defn- objects-batch [taken _tables]
  (when (seq taken)
    {:type "objects" :tables (document/table-documents taken)}))

(defn- links-batch
  "The links batch of the Tables `taken`, with link targets in `tables`. A Table whose FKs all point out of the
  selection has no links, and is not in the batch."
  [taken tables]
  (let [table-links (links/table-links taken tables)]
    (when-let [entries (seq (for [{table-id :id :as table} taken
                                  :let  [table-links (table-links table-id)]
                                  :when table-links]
                              {:schema (:schema table) :name (:name table) :links table-links}))]
      {:type "links" :tables (vec entries)})))

(defn- stats-batch [taken _tables]
  (let [table-stats (stats/table-stats taken)]
    (when-let [entries (seq (for [{table-id :id :as table} taken
                                  :let  [entry (table-stats table-id)]
                                  :when entry]
                              (merge {:schema (:schema table) :name (:name table)} entry)))]
      {:type "stats" :tables (vec entries)})))

(defn- cut-by-size
  "`[batch taken cut?]`: a stats `batch` and its page's Tables `taken`, cut after the Table where the size of the
  stats passes [[pages/stats-byte-limit]], and whether it was cut. Other batches are returned as they are."
  [batch taken]
  (if (not= "stats" (:type batch))
    [batch taken false]
    (let [{kept :tables cut :more} (pages/page (:tables batch) stats/stats-size nil pages/stats-byte-limit)
          last-kept                (document/table-key (peek kept))]
      [(assoc batch :tables kept)
       (if cut
         (filterv #(not (pos? (compare (document/table-key %) last-kept))) taken)
         taken)
       cut])))

(def ^:private build-batch
  {"objects" objects-batch
   "links"   links-batch
   "stats"   stats-batch})

(defn- page
  "The page of `kind` after the key `after`: its batch, or nil when its Tables have nothing to send, the key of the
  last Table it covered, and whether Tables of `kind` are left."
  [{:keys [tables weight limit]} kind after all-tables]
  (let [{taken :tables more :more} (pages/page tables weight after limit)
        [batch taken cut]          (cut-by-size ((build-batch kind) taken all-tables) taken)]
    {:batch batch
     :last  (some-> (peek taken) document/table-key)
     :more  (or more cut)}))

(defn- past-empty-kinds
  "`cursor`, or, when it is the start of a kind with no Tables to page, the start of the next kind that has some, or
  nil."
  [cursor by-kind]
  (loop [cursor cursor]
    (if (and cursor (nil? (:key cursor)) (empty? (get-in by-kind [(:kind cursor) :tables])))
      (recur (pages/next-cursor (:kind cursor) nil false))
      cursor)))

(mu/defn- next-page :- [:map {:closed true}
                        [:batch [:maybe ::wire/batch]]
                        [:next  [:maybe ::pages/cursor]]]
  "The first page from the cursor `after` that has something to send, and the cursor after it, past the kinds that
  have no Tables to page."
  [database-id :- ::lib.schema.id/database
   tables      :- [:sequential ::warehouse-schema.schema/table]
   after       :- [:maybe ::pages/cursor]]
  (let [by-kind (candidates database-id tables)]
    (loop [cursor (past-empty-kinds (or after {:kind (first pages/kinds)}) by-kind)]
      (if (nil? cursor)
        {:batch nil :next nil}
        (let [{:keys [kind key]}        cursor
              {:keys [batch last more]} (page (by-kind kind) kind key tables)
              next-cursor               (past-empty-kinds (pages/next-cursor kind last more) by-kind)]
          (if (or batch (nil? next-cursor))
            {:batch batch :next next-cursor}
            (recur next-cursor)))))))

(mu/defn changes-response :- ::wire/response
  "The answer to `request`: the next page of the metadata of the Database it names, and the cursor of the page after
  it, when there is one. The first answer, with no `after`, also holds the database values first."
  [{database-name :database :keys [engine schema_filters after]} :- ::wire/request]
  (let [{database-id :id :as database} (served-database database-name engine)
        tables                         (document/described-tables database-id schema_filters)
        {:keys [batch next]}           (next-page database-id tables after)]
    (cond-> {:format_version document/format-version
             :batches        (cond-> []
                               (nil? after) (conj (merge {:type "database"} (document/database-document database)))
                               batch        (conj batch))}
      next (assoc :next next))))
