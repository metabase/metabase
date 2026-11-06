(ns metabase-enterprise.monitor-relay.source
  "What the relay reads from this Metabase: the report each `/sync` carries, the history floors, pages of each stream,
  cut to fit the receiver's limits, and pages of each state kind's snapshot. A page of the change log carries the state
  rows its entries touch."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private relay-version
  "The relay's version, which each `/sync` reports. The receiver refuses a relay older than the one it needs."
  "0.4.0")

(def ^:private max-body-bytes
  "The most JSON one request carries, about. The receiver refuses a body over 32 MiB."
  (* 8 1024 1024))

(def ^:private max-gap-reads
  "The most gaps one page re-reads."
  100)

;;; ------------------------------------------------- sync report --------------------------------------------------

(defn- capabilities*
  "The capability flags each `/sync` reports. This Metabase has every table and column the flags name, and the relay's
  queries read them, so each flag is true, but the two `_populated` flags, which check `view_log` and `audit_log` for a
  row from the last 7 days."
  []
  (let [week-ago (t/minus (t/instant) (t/days 7))]
    {:data_sensitivity      true
     :user_data_sensitivity true
     :login_history         true
     :audit_log_populated   (relay.db/recent-row? "audit_log" week-ago)
     :pulse_tables          true
     :snippets              true
     :tenants               true
     :login_attributes      true
     :view_log_populated    (relay.db/recent-row? "view_log" week-ago)
     :notification_tables   true}))

(def ^:private capabilities
  ;; The populated checks read `view_log` and `audit_log`, so they run at most every 300 s per app DB.
  (memoize/ttl (vary-meta capabilities* assoc ::memoize/args-fn (fn [_args] [(mdb/unique-identifier)]))
               :ttl/threshold (* 5 60 1000)))

(defn- tracked-setting? [setting-name]
  (or (#{"enable-public-sharing" "report-timezone" "download-row-limit" "site-url"} setting-name)
      (str/starts-with? setting-name "enable-embedding")))

(defn- tracked-settings
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

(defn- sequences
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

(mu/defn sync-report :- [:map {:closed true}
                         [:relay_version    :string]
                         [:metabase_version :string]
                         [:site_uuid        :string]
                         [:capabilities     [:map-of :keyword :boolean]]
                         [:settings         [:map {:closed true}
                                             [:log_enabled           :boolean]
                                             [:change_log            :boolean]
                                             [:pii_retention         :boolean]
                                             [:source_address_header [:maybe :string]]
                                             [:not_behind_proxy      :boolean]
                                             [:tracked               [:map-of :string :string]]]]
                         [:sequences        [:map-of :keyword :int]]
                         [:change_oldest    [:maybe :int]]
                         [:history          {:optional true} :map]]
  "The body of a `/sync` from this node, without the ids that each post carries. `change-log?` is whether Metabase
  logs its changes now, and `history` is the floors to send, or nil."
  [change-log? :- :boolean
   history     :- [:maybe [:map {:closed true}
                           [:since  :string]
                           [:floors [:map-of (into [:enum] relay.sql/streams) :int]]]]]
  (cond-> {:relay_version    relay-version
           :metabase_version config/mb-version-string
           :site_uuid        (setting/get :site-uuid)
           :capabilities     (capabilities)
           :settings         (settings change-log?)
           :sequences        (sequences)
           :change_oldest    (relay.db/change-oldest)}
    history (assoc :history history)))

;;; ------------------------------------------------ history floors ------------------------------------------------

(defn- floor-search
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

(mu/defn history-floors :- [:map-of :keyword :int]
  "Per stream, the id where its history from `since`, an ISO 8601 instant, starts: the id of the earliest row whose
  time is at or after `since`, and at most the stream's sequence value + 1. A stream whose sequence value is unknown is
  left out."
  [since :- :string]
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

(def ^:private ids-per-read 1000)

(defn- read-state
  "`found` with the rows that the change log `entries` touch read into it now, as the receiver takes them, and the ids
  read by each kind and column. It skips the ids that `found` has read by the same kind and column. For the entry
  `{:table_name \"metabase_table\", :row_id 7}`, `found` gets
  `{:rows {:table {7 ..}, :field {701 .., 702 ..}}, :asked {:table {\"t.id\" #{7}}, :field {\"f.table_id\" #{7}}}}`."
  [found entries]
  (reduce (fn [found [kind column ids]]
            (if-let [ids (seq (remove (get-in found [:asked kind column] #{}) ids))]
              (let [rows (relay.rows/encode kind (relay.db/state-rows kind [:in column ids]))]
                (-> found
                    (update-in [:rows kind] (fnil into (sorted-map)) (map (juxt :id identity)) rows)
                    (update-in [:asked kind column] (fnil into #{}) ids)))
              found))
          found
          (for [[table ids]   (update-vals (group-by :table_name entries) #(distinct (map :row_id %)))
                [kind column] (relay.sql/table-kinds table)
                ids           (partition-all ids-per-read ids)]
            [kind column ids])))

(defn- found-state
  "The `state` of what [[read-state]] found: per state kind, the `:rows` found, and the ids `:gone` from the kind, those
  read by the kind's own key that no row has."
  [{:keys [rows asked]}]
  (into (sorted-map)
        (for [[kind by-id] rows]
          [kind {:rows (vec (vals by-id))
                 :gone (vec (sort (remove by-id (get-in asked [kind (relay.sql/state-id kind)]))))}])))

(defn change-state
  "The `state` of a page of the change log, `entries`: per state kind, the `:rows` of every id the entries touch, read
  now, and the ids `:gone` from the kind. A kind that no entry touches is left out. When card 5 is deleted and group 3
  is renamed:

    (change-state [{:table_name \"report_card\", :row_id 5} {:table_name \"permissions_group\", :row_id 3}])
    ;; => {:card  {:rows [], :gone [5]}
    ;;     :group {:rows [{:id 3, :group_id 3, :name \"Analysts\"}], :gone []}}"
  [entries]
  (found-state (read-state {} entries)))

(defn- byte-size
  "The size of `x` as JSON, in UTF-8 bytes."
  ^long [x]
  (u/string-byte-count (json/encode x)))

(defn- rows-that-fit
  "The longest prefix of `rows` that takes at most [[max-body-bytes]] of JSON, with a separator per row, and at least
  one row."
  [rows]
  (loop [sent [], size 0, rows rows]
    (if-let [[row & more] (seq rows)]
      (let [size (+ size 1 (byte-size row))]
        (if (and (seq sent) (> size max-body-bytes))
          sent
          (recur (conj sent row) size more)))
      sent)))

(defn- with-state
  "A prefix of the change log `entries` whose state fits in one body, and that state. It tries the first 64 entries,
  or all when there are fewer, then twice as many each time, the last try all of them, and keeps the longest whose
  state fits, in UTF-8 bytes of JSON. When the state of the first try does not fit, it tries the first 1, 2, 4, ...
  entries instead. Each try reads the state of the entries that the last one did not, so a page reads the state of at
  most twice the entries it sends, and of the first try's again when it falls back. One entry goes with its state,
  whatever its size."
  [entries]
  (loop [n     (min 64 (count entries))
         found (read-state {} (subvec entries 0 n))
         fit   nil]
    (let [tried [(subvec entries 0 n) (found-state found)]
          more  (min (* 2 n) (count entries))]
      (cond
        (<= (byte-size (second tried)) max-body-bytes)
        (if (= n more) tried (recur more (read-state found (subvec entries n more)) tried))

        (or fit (= 1 n))
        (or fit tried)

        :else
        (recur 1 (read-state {} (subvec entries 0 1)) nil)))))

(defn- ranges-through
  "The parts of `ranges` up to `id`."
  [ranges id]
  (vec (for [[lo hi] ranges :when (<= lo id)]
         [lo (min hi id)])))

(defn- read-gaps
  "Re-reads `gaps` of `stream`, up to `limit` rows in all, in one statement. Returns `[ranges rows]`: when the read
  stops at the limit, the gaps cover only up to the last id it read."
  [stream gaps limit]
  (let [gaps (vec (take max-gap-reads (sort-by first gaps)))
        rows (if (seq gaps) (vec (relay.db/stream-ranges stream gaps limit)) [])]
    (if (< (count rows) limit)
      [gaps rows]
      [(ranges-through gaps ((relay.sql/row-id stream) (peek rows))) rows])))

(mu/defn page :- [:map {:closed true}
                  [:rows      [:sequential :map]]
                  [:gap_reads [:sequential [:tuple :int :int]]]
                  [:sequence  [:maybe :int]]
                  [:state     {:optional true} [:map-of :keyword [:map {:closed true}
                                                                  [:rows [:sequential :map]]
                                                                  [:gone [:sequential :int]]]]]
                  [:more?     :boolean]]
  "The next page of `stream` for the cursor `{:next_from :gaps}` that the receiver answered: the re-read gaps (when
  `gaps?`), then the rows above `next_from`, at most `limit` rows and about `max-body-bytes` in all. Returns `:rows`,
  `:gap_reads` and `:sequence`, read after the rows, `:state` for the change log, read after `:sequence`
  ([[change-state]]), and `:more?`, whether rows may remain above the page. Every key but `:more?` is a `/rows` body
  field. A page with neither rows nor gap reads, which the relay does not send, reads no sequence: its `:sequence` is
  nil."
  [stream                   :- (into [:enum] relay.sql/streams)
   {:keys [next_from gaps]} :- [:map {::mr/deliberately-open true, :description "the receiver's answer"}
                                [:next_from {:optional true} [:maybe :int]]
                                [:gaps      {:optional true} [:maybe [:sequential [:tuple :int :int]]]]]
   gaps?                    :- :boolean
   limit                    :- pos-int?]
  (let [row-id            (relay.sql/row-id stream)
        [ranges gap-rows] (if gaps? (read-gaps stream gaps limit) [[] []])
        remaining         (- limit (count gap-rows))
        new-rows          (if (pos? remaining) (vec (relay.db/stream-page stream (or next_from 0) remaining)) [])
        ;; A gap the receiver reports above next_from would read some rows twice.
        by-id             (into (sorted-map) (map (juxt row-id identity)) (concat gap-rows new-rows))
        rows              (relay.rows/encode stream (vals by-id))
        sequence          (when (or (seq rows) (seq ranges)) (get (sequences [stream]) stream))
        sent              (rows-that-fit rows)
        [sent state]      (if (= :change stream) (with-state sent) [sent nil])
        cut?              (< (count sent) (count rows))]
    (cond-> {:rows      sent
             :gap_reads (if cut? (ranges-through ranges (row-id (peek sent))) ranges)
             :sequence  sequence
             :more?     (or cut? (= (count new-rows) remaining))}
      state (assoc :state state))))

(mu/defn snapshot-page :- [:map {:closed true}
                           [:at   [:maybe :int]]
                           [:rows [:sequential :map]]
                           [:to   [:maybe :int]]
                           [:last :boolean]]
  "The page of state `kind` from the id `from`, as `/state/<kind>` takes it: `:at`, the change log's sequence value read
  before the rows; `:rows`, at most `limit` rows and about [[max-body-bytes]]; `:to`, the page's last id, nil on the
  last page; and `:last`."
  [kind  :- (into [:enum] relay.sql/state-kinds)
   from  :- :int
   limit :- pos-int?]
  (let [at    (:change (sequences [:change]))
        read  (relay.db/state-rows kind [:page from limit])
        rows  (relay.rows/encode kind read)
        sent  (rows-that-fit rows)
        last? (and (< (count read) limit) (= (count sent) (count rows)))]
    {:at at, :rows sent, :to (when-not last? (:id (peek sent))), :last last?}))
