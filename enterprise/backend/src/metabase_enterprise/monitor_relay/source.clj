(ns metabase-enterprise.monitor-relay.source
  "What the relay reads from this Metabase: the report each `/sync` carries, the history floors, pages of each stream,
  cut to fit the receiver's limits, and pages of each state kind's snapshot. A page of the change log carries the state
  rows its entries touch."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util.json :as json])
  (:import
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(def relay-version
  "The relay's version, which each `/sync` reports. The receiver refuses a relay older than the one it needs (its
  `MIN_RELAY`)."
  "0.4.0")

(def max-body-bytes
  "The most JSON one request carries, about. The receiver refuses a body over 32 MiB."
  (* 8 1024 1024))

(def ^:private max-gap-reads
  "The most gaps one page re-reads."
  100)

;;; ------------------------------------------------- sync report --------------------------------------------------

(defn- columns-by-table []
  (reduce (fn [m {:keys [table_name column_name]}]
            (update m table_name (fnil conj []) column_name))
          {}
          (relay.db/table-columns relay.sql/capability-tables)))

(defn capabilities*
  "The capability flags each `/sync` reports, with the keys and meanings of `capabilities` in
  `spec/data/ingestion/rows.yaml` in the Metabase Monitor repository. `pii_retention` goes in the settings."
  []
  (let [columns (columns-by-table)
        has?    #(contains? columns %)
        column? #(boolean (some #{%2} (get columns %1)))]
    {:data_sensitivity      (column? "metabase_field" "data_sensitivity")
     :user_data_sensitivity (column? "metabase_field_user_settings" "data_sensitivity")
     :login_history         (has? "login_history")
     :audit_log_populated   (and (has? "audit_log") (relay.db/recent-row? "audit_log"))
     :pulse_tables          (and (has? "pulse") (has? "pulse_channel_recipient"))
     :snippets              (has? "native_query_snippet")
     :tenants               (and (has? "tenant") (column? "core_user" "tenant_id"))
     :login_attributes      (column? "core_user" "login_attributes")
     :view_log_populated    (and (has? "view_log") (relay.db/recent-row? "view_log"))
     :notification_tables   (every? has? relay.sql/notification-tables)}))

(def ^:private capabilities
  ;; The populated checks can scan `audit_log`, so they run at most every 300 s.
  (memoize/ttl capabilities* :ttl/threshold (* 5 60 1000)))

(defn- tracked-setting? [setting-name]
  (or (#{"enable-public-sharing" "report-timezone" "download-row-limit" "site-url"} setting-name)
      (str/starts-with? setting-name "enable-embedding")))

(defn tracked-settings
  "The value of each setting the Monitor tracks that the environment or the app DB sets, as Metabase applies it: the
  environment wins, and the value is decrypted. A string, by setting name."
  []
  (into (sorted-map)
        (for [setting-name (filter tracked-setting? (map name (keys @setting/registered-settings)))
              :when        (#{:env :database} (setting/get-raw-value-source setting-name))]
          [setting-name (str (setting/get-raw-value setting-name))])))

(defn- settings [change-log?]
  {:log_enabled           (premium-features/log-enabled?)
   :change_log            change-log?
   :pii_retention         (boolean (setting/get :analytics-pii-retention-enabled))
   :source_address_header (setting/get :source-address-header)
   :not_behind_proxy      (boolean (setting/get :not-behind-proxy))
   :tracked               (tracked-settings)})

(defn sequences
  "Per stream of `streams`, all of them by default, the highest id its table's id sequence has given out."
  ([]
   (sequences relay.sql/streams))

  ([streams]
   (case (relay.db/engine)
     :postgres (update-vals (relay.db/postgres-sequences streams) long)
     :mysql    (let [next-ids (into {}
                                    (map (juxt :table_name :auto_increment))
                                    (relay.db/mysql-auto-increments streams))]
                 (into {} (for [stream streams
                                :let [next-id (next-ids (relay.sql/stream-table stream))]
                                :when next-id]
                            [stream (dec (long next-id))]))))))

(defn sync-report
  "The body of a `/sync` from this node, in the relay run `boot-id`. `change-log?` is whether Metabase logs its changes
  now. `history` is the floors to send, or nil."
  [boot-id change-log? history]
  (cond-> {:node_id          config/local-process-uuid
           :boot_id          boot-id
           :relay_version    relay-version
           :metabase_version config/mb-version-string
           :site_uuid        (setting/get :site-uuid)
           :capabilities     (capabilities)
           :settings         (settings change-log?)
           :sequences        (sequences)
           :change_oldest    (relay.db/change-oldest)}
    history (assoc :history history)))

(defn log-enabled?
  "Whether Metabase writes `view_log` and `audit_log` rows. When it does not, the relay sends neither stream."
  []
  (premium-features/log-enabled?))

;;; ------------------------------------------------ history floors ------------------------------------------------

(defn floor-search
  "The id of the first row whose time is at or after a cutoff, found by a binary search on id from 1 to `top`, for a
  table whose times grow with its ids. `first-row` takes an id and returns the first row at or above it as
  `{:id n, :after? b}`, where `:after?` says whether the row's time is at or after the cutoff, or nil when there is
  none. Returns nil when no row up to `top` is at or after the cutoff."
  [first-row top]
  ;; `found` is the id of the first row at or above `hi`, when that row is at or after the cutoff.
  (loop [lo 1, hi (inc top), found nil]
    (if (< lo hi)
      (let [mid                         (quot (+ lo hi) 2)
            {:keys [id after?] :as row} (first-row mid)]
        (if (or (nil? row) after?)
          (recur lo mid (:id row))
          (recur (inc id) hi found)))
      found)))

(defn history-floors
  "Per stream, the id where its history from `since`, an ISO 8601 instant, starts: the id of the earliest row whose
  time is at or after `since`, and at most the stream's sequence value + 1. A stream whose sequence value is unknown is
  left out."
  [since]
  (let [since     (t/instant since)
        ;; Read before the rows: a row that gets its id after this read is above the floor. The change log has no
        ;; history: a snapshot covers what changed before it.
        sequences (dissoc (sequences) :change)]
    (into {} (for [[stream top] sequences
                   :let [found (if (= :audit stream)
                                 ;; audit_log has no index on its time
                                 (floor-search #(relay.db/first-row stream % since) top)
                                 (relay.db/time-floor stream since))]]
               [stream (if found (min found (inc top)) (inc top))]))))

;;; ----------------------------------------------- pages and parts ------------------------------------------------

(defn chunks
  "`rows` in order, [[relay.client/encoded]], in chunks of at most `max-rows` rows and about `max-bytes` of JSON. A
  chunk always holds at least one row."
  [rows max-rows max-bytes]
  (loop [rows rows, chunk [], size 0, out []]
    (if-let [[row & more] (seq rows)]
      (let [row      (relay.client/encoded row)
            row-size (relay.client/json-size row)]
        (if (and (seq chunk) (or (>= (count chunk) max-rows) (> (+ size row-size) max-bytes)))
          (recur (cons row more) [] 0 (conj out chunk))
          (recur more (conj chunk row) (+ size row-size) out)))
      (cond-> out (seq chunk) (conj chunk)))))

(def ^:private ids-per-read 1000)

(defn- read-state
  "`found` with the rows that the change log `entries` touch read into it now, as the receiver takes them: in `:rows`,
  per state kind, the rows by id, and in `:asked`, per state kind, the ids asked by the kind's own key."
  [found entries]
  (reduce (fn [found [kind column ids]]
            (let [rows (relay.rows/encode kind (relay.db/state-rows kind [:in column ids]))]
              (cond-> (update-in found [:rows kind] (fnil into (sorted-map)) (map (juxt :id identity)) rows)
                (= column (relay.sql/state-id kind))
                (update-in [:asked kind] (fnil into #{}) ids))))
          found
          (for [[table ids]   (update-vals (group-by :table_name entries) #(distinct (map :row_id %)))
                [kind column] (relay.sql/table-kinds table)
                ids           (partition-all ids-per-read ids)]
            [kind column ids])))

(defn- found-state
  "The `state` of what [[read-state]] found: per state kind, the `:rows` found, and the ids `:gone` from the kind, those
  in `:asked` that no row has."
  [{:keys [rows asked]}]
  (into (sorted-map)
        (for [[kind by-id] rows]
          [kind {:rows (vec (vals by-id))
                 :gone (vec (sort (remove by-id (get asked kind))))}])))

(defn change-state
  "The `state` of a page of the change log, `entries`: per state kind, the `:rows` of every id the entries touch, read
  now, and the ids `:gone` from the kind. A kind that no entry touches is left out."
  [entries]
  (found-state (read-state {} entries)))

(defn- byte-size
  "The size of `x` as JSON, in UTF-8 bytes."
  ^long [x]
  (alength (.getBytes (json/encode x) StandardCharsets/UTF_8)))

(defn- with-state
  "A prefix of the change log `entries` whose state fits in one body, and that state. It tries the first 1, 2, 4, ...
  entries, the last try all of them, and keeps the longest whose state fits, in UTF-8 bytes of JSON. It reads each
  entry's state once, so a page reads the state of at most twice the entries it sends. One entry goes with its state,
  whatever its size."
  [entries]
  (loop [n     (min 1 (count entries))
         found (read-state {} (subvec entries 0 n))
         fit   nil]
    (let [tried [(subvec entries 0 n) (found-state found)]
          more  (min (* 2 n) (count entries))]
      (cond
        (> (byte-size (second tried)) max-body-bytes) (or fit tried)
        (= n more)                                    tried
        :else                                         (recur more (read-state found (subvec entries n more)) tried)))))

(defn- read-gaps
  "Re-reads `gaps` of `stream`, up to `limit` rows in all. Returns `[ranges rows]`: a gap whose read stopped at the
  limit covers only up to the last id it read."
  [stream gaps limit]
  (reduce (fn [[ranges rows] [lo hi]]
            (let [remaining (- limit (count rows))]
              (if (pos? remaining)
                (let [found (vec (relay.db/stream-range stream lo hi remaining))
                      hi    (if (= (count found) remaining) ((relay.sql/row-id stream) (peek found)) hi)]
                  [(conj ranges [lo hi]) (into rows found)])
                (reduced [ranges rows]))))
          [[] []]
          (take max-gap-reads (sort-by first gaps))))

(defn page
  "The next page of `stream` for the cursor `{:next_from :gaps}` that the receiver answered: the re-read gaps (when
  `gaps?`), then the rows above `next_from`, at most `limit` rows and about `max-body-bytes` in all. Returns `:rows`,
  `:gap_reads` and `:sequence`, read after the rows, `:state` for the change log, read after `:sequence`
  ([[change-state]]), and `:more?`, whether rows may remain above the page. Every key but `:more?` is a `/rows` body
  field."
  [stream {:keys [next_from gaps]} gaps? limit]
  (let [row-id            (relay.sql/row-id stream)
        [ranges gap-rows] (if gaps? (read-gaps stream gaps limit) [[] []])
        remaining         (- limit (count gap-rows))
        new-rows          (if (pos? remaining) (vec (relay.db/stream-page stream (or next_from 0) remaining)) [])
        ;; A gap the receiver reports above next_from would read some rows twice.
        by-id             (into (sorted-map) (map (juxt row-id identity)) (concat gap-rows new-rows))
        rows              (relay.rows/encode stream (vals by-id))
        sequence          (get (sequences [stream]) stream)
        sent              (or (first (chunks rows limit max-body-bytes)) [])
        [sent state]      (if (= :change stream) (with-state sent) [sent nil])
        cut?              (< (count sent) (count rows))
        last-id           (row-id (peek sent))]
    (cond-> {:rows      sent
             :gap_reads (if cut?
                          (vec (for [[lo hi] ranges :when (and last-id (<= lo last-id))]
                                 [lo (min hi last-id)]))
                          ranges)
             :sequence  sequence
             :more?     (or cut? (= (count new-rows) remaining))}
      state (assoc :state state))))

(defn snapshot-page
  "The page of state `kind` from the id `from`, as `/state/<kind>` takes it: `:at`, the change log's sequence value read
  before the rows; `:rows`, at most `limit` rows and about [[max-body-bytes]]; `:to`, the page's last id, nil on the
  last page; and `:last`."
  [kind from limit]
  (let [at    (:change (sequences [:change]))
        read  (relay.db/state-rows kind [:page from limit])
        rows  (relay.rows/encode kind read)
        sent  (or (first (chunks rows limit max-body-bytes)) [])
        last? (and (< (count read) limit) (= (count sent) (count rows)))]
    {:at at, :rows sent, :to (when-not last? (:id (peek sent))), :last last?}))
