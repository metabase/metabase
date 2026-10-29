(ns metabase-enterprise.monitor-relay.state
  "The state kinds as Metabase Monitor mirrors them, and the three ways their rows travel. The protocol is
  `libs/contract/PUSH.md` in the Metabase Monitor repository.

  - A delta sends the users and cards whose `updated_at` is at or after the receiver's cursor.
  - A fetch sends the rows the receiver asks for by id, and the fields and tables above the ids it has.
  - A state pass reads every row of a kind and folds the row hashes into buckets of 256 ids. The receiver compares the
    buckets with its mirror, and the relay sends the rows of the buckets that differ.

  A pass's read spans runs, at most [[chunk-rows]] rows per run. This node keeps each pass's bucket list in memory,
  never its rows: no run posts a row that an earlier run read.

  [[deltas!]], [[fetches!]] and [[passes!]] take a `ctx`, which the cycle builds for each run:

  - `:post`: a function of a kind and a body, that posts the body to `state/<kind>`. It never throws. It returns the
    response, `{:status :body}`; a failed one also has its `:outcome` and `:message`, and a network error has an
    `:error` and no `:status`. A `:stale` one is skipped: see [[unless-stale]].
  - `:now`: the run's start, in milliseconds of a monotonic clock, not epoch time. Compare it only with another `:now`.
  - `:page-rows`: the most rows one read or one post holds.
  - `:deadline-passed?`: a function of no arguments, true once the run's 10 s have passed."
  (:require
   [metabase-enterprise.monitor-relay.client :as relay.client]
   [metabase-enterprise.monitor-relay.db :as relay.db]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase-enterprise.monitor-relay.source :as relay.source]
   [metabase-enterprise.monitor-relay.sql :as relay.sql]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.util HexFormat)))

(set! *warn-on-reflection* true)

(def ^:private bucket-size 256)

(def ^:private pass-page-rows
  ;; Above `bucket-size`, the most rows one bucket holds: a full page of one bucket would start again where it started.
  10000)

(def chunk-rows
  "How many rows of one state pass a run reads: it reads pages until it has read this many."
  50000)

(def ^:private buckets-per-part 100000)

(def ^:private ids-per-read 1000)

(def ^:private kinds
  "The state kinds, in the order the relay sends them."
  (sort-by name relay.sql/state-kinds))

;;; ---------------------------------------------------- hashes ----------------------------------------------------

(defn- append-string! [^StringBuilder sb ^String s]
  (.append sb \")
  (dotimes [i (.length s)]
    (let [c (.charAt s i)]
      (case c
        \"         (.append sb "\\\"")
        \\         (.append sb "\\\\")
        \backspace (.append sb "\\b")
        \formfeed  (.append sb "\\f")
        \newline   (.append sb "\\n")
        \return    (.append sb "\\r")
        \tab       (.append sb "\\t")
        (if (< (int c) 0x20)
          (.append sb (format "\\u%04x" (int c)))
          (.append sb c)))))
  (.append sb \"))

(defn- append-value! [^StringBuilder sb v]
  (cond
    (nil? v)     (.append sb "null")
    (boolean? v) (.append sb (if v "true" "false"))
    (integer? v) (.append sb (str v))
    (string? v)  (append-string! sb v)
    :else        (throw (ex-info (str "A state row holds a " (.getName (class v))
                                      ", but the relay hashes only text, integers, booleans and nulls")
                                 {:class (class v)}))))

(defn canonical
  "The canonical JSON of `row` without `:_h` and `:_u`: keys in order, no whitespace, and text as itself, but for the
  quote, the backslash and the control characters. It is Python's `json.dumps(row, sort_keys=True,
  separators=(\",\", \":\"), ensure_ascii=False)`. Throws on a value that is not text, an integer, a boolean or nil."
  ^String [row]
  (let [sb (StringBuilder. "{")]
    (doseq [[i [k v]] (map-indexed vector (sort-by (comp name key) (dissoc row :_h :_u)))]
      (when (pos? i)
        (.append sb \,))
      (append-string! sb (name k))
      (.append sb \:)
      (append-value! sb v))
    (str (.append sb \}))))

(defn- digest
  "The first 16 bytes of the SHA-256 of `s` as UTF-8, as 32 lower-case hex characters."
  ^String [^String s]
  (.formatHex (HexFormat/of) (.digest (MessageDigest/getInstance "SHA-256") (.getBytes s StandardCharsets/UTF_8)) 0 16))

(defn row-hash
  "The hash of `row`, `_h`: the [[digest]] of its [[canonical]] JSON."
  ^String [row]
  (digest (canonical row)))

(defn- bucket ^long [^long id]
  (quot id bucket-size))

(defn bucket-digest
  "The digest of a bucket's rows, given as `[id h]` pairs in any order."
  ^String [pairs]
  (digest (apply str (for [[id h] (sort-by first pairs)] (str id ":" h "\n")))))

(defn root
  "The digest of a kind's buckets, given as `[b n d]` in `b` order: bucket number, row count and digest."
  ^String [buckets]
  (digest (apply str (for [[b n d] buckets] (str b ":" n ":" d "\n")))))

(defn- hashed
  "`rows` of state `kind` as the receiver takes them: encoded, with their hash in `:_h`."
  [kind rows]
  (mapv #(assoc % :_h (row-hash %)) (relay.rows/encode kind rows)))

(defn- fold
  "The `[b n d]` of each bucket of `rows`, hashed rows in id order."
  [rows]
  (for [rows (partition-by #(bucket (:id %)) rows)]
    [(bucket (:id (first rows))) (count rows) (bucket-digest (map (juxt :id :_h) rows))]))

;;; --------------------------------------------------- reading ----------------------------------------------------

(defn read-chunk
  "Reads state `kind` from the id `from`, a bucket's first id, in pages of `page-rows` rows, by whole buckets, until it
  read about [[chunk-rows]] rows. Returns the `[b n d]` of the buckets it read, in `b` order, as `:buckets`, and the id
  the next chunk starts at as `:next`, nil after the kind's last row."
  [kind from page-rows]
  (assert (> page-rows bucket-size))
  (loop [from from, buckets [], read 0]
    (let [rows (vec (relay.db/state-rows kind [:page from page-rows]))
          read (+ read (count rows))]
      (if (< (count rows) page-rows)
        {:buckets (into buckets (fold (hashed kind rows))), :next nil}
        ;; The page may end inside its last bucket: the next page reads that bucket whole.
        (let [next    (* bucket-size (bucket (:id (peek rows))))
              buckets (into buckets (fold (hashed kind (take-while #(< (:id %) next) rows))))]
          (if (>= read chunk-rows)
            {:buckets buckets, :next next}
            (recur next buckets read)))))))

(defn low-water
  "L, in epoch microseconds: every change the next delta could miss has an `updated_at` at or after it. From the
  [[relay.db/clock]] reading `clock`: 5 s before now or the oldest open transaction's start, but at most 1 h before
  now. Without a view of the open transactions, 2 minutes before now."
  ^long [{:keys [r o open-transactions?]}]
  (cond
    (not open-transactions?) (- r 120000000)
    o                        (max (- (min r o) 5000000) (- r 3600000000))
    :else                    (- r 5000000)))

;;; ---------------------------------------------------- posts -----------------------------------------------------

(defn unless-stale
  "`failure`, or nil when it is `:stale`: a 409, the receiver has moved on from that stream, delta, fetch or state
  pass. The run then skips it, and goes on with the rest of its work. Logs a stale failure."
  [failure]
  (if (= :stale (:outcome failure))
    (log/debug (:message failure))
    failure))

(defn- post-all!
  "Posts `bodies` to state `kind` in order, until one fails. Returns the failed response, or nil."
  [post kind bodies]
  (some #(let [response (post kind %)]
           (when-not (relay.client/ok? response)
             response))
        bodies))

;;; ---------------------------------------------------- deltas ----------------------------------------------------

(defn- earlier [a b]
  (if (neg? (compare [(:t a) (:id a)] [(:t b) (:id b)])) a b))

(defn- delta!
  "Sends the delta of `kind` from the cursor `since`, part after part, until a part is the last or the run's deadline
  passes. Each part reads from just after the previous part's last row. Returns the failed response, or nil."
  [{:keys [post page-rows deadline-passed?]} kind since]
  (let [until {:t (low-water (relay.db/clock)), :id 0}]
    (if (nil? since)
      (post-all! post kind [{:step "delta", :since nil, :next_since until, :last true, :rows []}])
      (loop [since since, from [(:t since) (:id since)]]
        (let [read            (relay.db/state-rows kind (conj (into [:changed] from) page-rows))
              rows            (hashed kind read)
              sent            (or (first (relay.source/chunks rows page-rows relay.source/max-body-bytes)) [])
              last?           (and (< (count read) page-rows) (= (count sent) (count rows)))
              {u :_u, id :id} (peek sent)
              response        (post kind {:step       "delta"
                                          :since      since
                                          :next_since (if last? until (earlier until {:t u, :id (inc id)}))
                                          :last       last?
                                          :rows       sent})]
          (cond
            (not (relay.client/ok? response)) response
            (or last? (deadline-passed?))     nil
            :else                             (recur (get-in response [:body :since]) [u (inc id)])))))))

(defn deltas!
  "Sends the deltas of the kinds in `answer`, the `/sync` answer's `state`: `user`, then `card`. Returns the failure
  that ends the run, or nil."
  [{:keys [deadline-passed?] :as ctx} answer]
  (some (fn [kind]
          (when-let [entry (when-not (deadline-passed?) (get answer kind))]
            (unless-stale (delta! ctx kind (:since entry)))))
        relay.sql/delta-kinds))

;;; --------------------------------------------------- fetches ----------------------------------------------------

(defn- fetch-bodies
  "The `fetch` posts of `kind` for the asked `ids` and the rows above the id `above`. Each asked id is in the post that
  holds its row, or in the last post when it was not found."
  [kind ids above page-rows]
  (let [asked (set ids)
        found (mapcat #(hashed kind (relay.db/state-rows kind [:ids %])) (partition-all ids-per-read ids))
        new   (when above
                (remove #(asked (:id %)) (hashed kind (relay.db/state-rows kind [:page (inc above) page-rows]))))
        posts (relay.source/chunks (sort-by :id (concat found new)) page-rows relay.source/max-body-bytes)
        gone  (remove (set (map :id found)) ids)]
    (when (or (seq ids) (seq posts))
      (let [posts (or (seq posts) [[]])
            last  (dec (count posts))]
        (map-indexed (fn [i rows]
                       {:step "fetch"
                        :ids  (into (filterv asked (map :id rows)) (when (= i last) gone))
                        :rows rows})
                     posts)))))

(defn fetches!
  "Sends the rows that `answer`, the `/sync` answer's `state`, asks for by id, kind by kind. Returns the failure that
  ends the run, or nil."
  [{:keys [post page-rows deadline-passed?]} answer]
  (some (fn [kind]
          (when-let [{:keys [ids above]} (when-not (deadline-passed?) (get-in answer [kind :fetch]))]
            (unless-stale (post-all! post kind (fetch-bodies kind ids above page-rows)))))
        kinds))

;;; ---------------------------------------------------- passes ----------------------------------------------------

;; This node keeps each state pass it runs, by kind, through these steps:
;;
;; - `:read`: `:next`, the id the next chunk starts at; `:buckets`, the `[b n d]` read so far; `:read-ms`; `:read-at`,
;;   the `:now` of the run that read the last chunk;
;; - `:buckets`: `:pass`, the receiver's number for it; `:buckets`; `:part`, the next buckets part to send;
;; - `:rows`: `:pass`; `:lists`, the `[id h]` pairs of each bucket handed out and not completed, by bucket.

(def ^:private pass-idle-ms
  ;; The receiver's `PASS_IDLE_S`. A root read that read no chunk for this long has chunks too old to post.
  300000)

(defn- new-pass []
  {:step :read, :next 0, :buckets [], :read-ms 0})

(defn- read-step
  "Reads the next chunk of `pass`, and posts its root after the last chunk."
  [{:keys [post now]} kind {:keys [next read-ms] :as pass}]
  (let [timer   (u/start-timer)
        chunk   (read-chunk kind next pass-page-rows)
        read-ms (+ read-ms (long (u/since-ms timer)))
        buckets (into (:buckets pass) (:buckets chunk))]
    (if (:next chunk)
      {:pass (assoc pass :next (:next chunk), :buckets buckets, :read-ms read-ms, :read-at now), :wait? true}
      (let [response (post kind {:step         "root"
                                 :root         (root buckets)
                                 :row_count    (transduce (map second) + buckets)
                                 :bucket_count (count buckets)
                                 :read_ms      read-ms})
            {:keys [pass done]} (:body response)]
        (cond
          (not (relay.client/ok? response)) {:failure response}
          done                              {}
          :else                             {:pass {:step :buckets, :pass pass, :buckets buckets, :part 0}})))))

(defn- buckets-step
  "Posts the next buckets part of `pass`."
  [{:keys [post]} kind {:keys [pass buckets part] :as state}]
  (let [from     (* part buckets-per-part)
        to       (min (count buckets) (+ from buckets-per-part))
        last?    (= to (count buckets))
        response (post kind {:step "buckets", :pass pass, :part part, :last last?, :buckets (subvec buckets from to)})
        {:keys [done lists]} (:body response)]
    (cond
      (not (relay.client/ok? response)) {:failure response}
      (not last?)                       {:pass (assoc state :part (inc part))}
      done                              {}
      :else                             {:pass {:step :rows, :pass pass, :lists (into (sorted-map) lists)}})))

(defn- id-ranges
  "The id ranges of the runs of consecutive buckets in `buckets`, sorted."
  [buckets]
  (for [[lo hi] (reduce (fn [runs b]
                          (let [[lo hi] (peek runs)]
                            (if (and hi (= b (inc hi)))
                              (conj (pop runs) [lo b])
                              (conj runs [b b]))))
                        []
                        (sort buckets))]
    [(* lo bucket-size) (+ (* hi bucket-size) (dec bucket-size))]))

(defn- rows-bodies
  "The `rows` posts that complete the buckets of `lists`, from `rows`, the rows the bucket read found. A bucket is in
  the post that carries the last of its rows and gone ids."
  [lists rows page-rows]
  (let [by-bucket  (group-by #(bucket (:id %)) rows)
        full?      (fn [{:keys [post size]} row-size]
                     (and (seq (:rows post))
                          (or (>= (count (:rows post)) page-rows)
                              (> (+ size row-size) relay.source/max-body-bytes))))
        flush      (fn [{:keys [post] :as acc}]
                     (cond-> (assoc acc :post {:rows [], :gone [], :buckets []}, :size 0)
                       (some seq (vals post)) (update :posts conj post)))
        add-row    (fn [acc row]
                     (let [row      (relay.client/encoded row)
                           row-size (relay.client/json-size row)]
                       (-> (cond-> acc (full? acc row-size) flush)
                           (update-in [:post :rows] conj row)
                           (update :size + row-size))))
        add-bucket (fn [acc [b pairs]]
                     (let [listed (into {} pairs)
                           found  (get by-bucket b)]
                       (-> (reduce add-row acc (remove #(= (:_h %) (listed (:id %))) found))
                           (update-in [:post :gone] into (sort (remove (set (map :id found)) (keys listed))))
                           (update-in [:post :buckets] conj b))))]
    (:posts (flush (reduce add-bucket (flush {:posts []}) lists)))))

(defn- rows-step
  "Reads the buckets handed out to `pass` again, and posts the rows and gone ids that complete them."
  [{:keys [post page-rows]} kind {:keys [pass lists] :as state}]
  (let [rows (mapcat (fn [[lo hi]] (hashed kind (relay.db/state-rows kind [:range lo hi]))) (id-ranges (keys lists)))]
    (loop [[body & more] (rows-bodies lists rows page-rows), lists lists]
      (if-not body
        (if (seq lists)
          {:pass (assoc state :lists lists)}
          (do (log/debugf "The %s state pass %s has no bucket to read, and is dropped" (name kind) pass)
              {}))
        (let [response (post kind (assoc body :step "rows", :pass pass))
              {:keys [done] new-lists :lists} (:body response)]
          (cond
            (not (relay.client/ok? response)) {:failure response}
            done                              {}
            :else                             (recur more (into (apply dissoc lists (:buckets body)) new-lists))))))))

(defn- step!
  "Runs the next step of `pass` of `kind`. Returns `:pass`, the pass after it, or none once the receiver says it is
  done; `:wait?`, when the pass reads its next chunk in the next run; or the `:failure` that drops it."
  [ctx kind pass]
  (case (:step pass)
    :read    (read-step ctx kind pass)
    :buckets (buckets-step ctx kind pass)
    :rows    (rows-step ctx kind pass)))

(defn- run-pass!
  "Runs the steps of `pass` of `kind` while the run's deadline has not passed. Returns `:pass`, the pass left for the
  next run, and `:failure`, the failed response or the error that dropped it."
  [{:keys [deadline-passed?] :as ctx} kind pass]
  (loop [pass pass]
    (if (deadline-passed?)
      {:pass pass}
      (let [{next-pass :pass, :keys [wait? failure]} (try
                                                       (step! ctx kind pass)
                                                       (catch InterruptedException e
                                                         (throw e))
                                                       (catch Exception e
                                                         ;; The other passes keep what they sent in this run.
                                                         {:failure {:error e}}))]
        (cond
          failure                     (do (log/debugf "The %s state pass stopped at its %s step, and is dropped"
                                                      (name kind) (name (:step pass)))
                                          {:failure failure})
          (or wait? (nil? next-pass)) {:pass next-pass}
          :else                       (recur next-pass))))))

(defn passes!
  "Runs this node's state `passes`, a map of kind to pass, then starts a pass of each kind that `answer`, the `/sync`
  answer's `state`, says is `due`. A pass that has not posted its root yet goes on only while its kind is due, and while
  this node read a chunk of it in the last [[pass-idle-ms]]. A failed step drops its pass: the receiver may have taken
  it, so it is never sent again. Returns the passes left for the next run as `:passes`, and `:failure`, the failure
  that ends the run."
  [{:keys [now] :as ctx} passes answer]
  (let [due?   #(true? (get-in answer [% :due]))
        cut?   (fn [[kind {:keys [step read-at]}]]
                 (and (= :read step)
                      (or (not (due? kind))
                          (and read-at (>= (- now read-at) pass-idle-ms)))))
        passes (into {} (remove cut?) passes)]
    (loop [[kind & more] (concat (filter passes kinds) (remove passes kinds)), passes passes]
      (if-not kind
        {:passes passes}
        (let [pass (or (passes kind) (when (due? kind) (new-pass)))]
          (if-not pass
            (recur more passes)
            (let [{:keys [failure] left :pass} (run-pass! ctx kind pass)
                  passes                       (if left (assoc passes kind left) (dissoc passes kind))]
              (if-let [failure (unless-stale failure)]
                {:passes passes, :failure failure}
                (recur more passes)))))))))
