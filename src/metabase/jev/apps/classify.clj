(ns metabase.jev.apps.classify
  "A Jev *classify* step for query transforms: judge every row of a transform's source with Jev and write
  the answers into the target table as ordinary columns.

  A query transform opts in by adding `:jev-classify` to its source:

    {:type         \"query\"
     :query        <the rows to enrich>
     :jev-classify [{:input    \"BODY\"
                     :question \"What is this review complaining about?\"
                     :answers  {:shipping \"late, lost or damaged delivery\"
                                :quality  \"broke, defective, poorly made\"
                                :none     \"no complaint\"}
                     :output   {:mode \"new-column\" :name \"complaint_topic\"}
                     :min-confidence 0.6}
                    {:input    \"BODY\"
                     :kind     \"noul\"
                     :question \"Is the reviewer angry?\"
                     :output   {:mode \"new-column\" :name \"anger\"}}]}

  Such a transform dispatches as `:jev` (see [[metabase.transforms-base.interface/transform->transform-type]]).
  Everything except writing the target is delegated to the `:query` methods, so permissions, run tracking
  and target sync behave like a normal query transform. Only plain `table` targets are supported.

  Also serves `POST /api/jev/classify/preview`, which runs the same step over the first few rows of a
  query and returns them without writing anything — the fast edit-and-preview loop for the demo.

  Prototype scaffolding under `metabase.jev.*`, like the rest of `apps/`."
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.jev.client :as jev]
   [metabase.query-processor :as qp]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.interface :as transforms.i]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ExecutionException Executors ExecutorService Future)))

(set! *warn-on-reflection* true)

(def ^:private max-rows
  "Most source rows one classify run will judge. A prototype guard against runaway Jev spend."
  5000)

(def ^:private parallelism
  "Concurrent Jev calls per run."
  16)

(def ^:private unsure
  "The value written for a `choice` answer below its `:min-confidence`."
  "unsure")

;;; ------------------------------------------------ Spec ------------------------------------------------

(mr/def ::classification
  [:map {:closed true}
   [:input          [:or :string [:sequential :string]]]
   [:question       :string]
   [:kind           {:optional true} [:enum "choice" "noul" :choice :noul]]
   [:answers        {:optional true} [:map-of :string :string]]
   [:output         [:map {:closed true}
                     [:mode [:enum "new-column" "fill-empty" "overwrite" :new-column :fill-empty :overwrite]]
                     [:name :string]]]
   [:min-confidence {:optional true} [:maybe number?]]])

(mr/def ::raw-classifications
  "Classify specs as they arrive — from a transform's stored source or a JSON body, where answer keys may be
  keywords. Each is validated as a [[::classification]] once its answer keys are strings. Empty is allowed:
  the preview then just returns the source rows, which is how the editor learns the source columns."
  [:sequential [:map {:closed false, ::mr/deliberately-open true}]])

(defn- canonicalize-keys
  "Keyword keys on a spec and its `:output`, string keys on its `:answers`. A preview request arrives with
  keyword keys, but a spec read back from a stored transform source keeps its JSON string keys."
  [spec]
  (let [spec (update-keys spec keyword)]
    (cond-> spec
      (map? (:output spec)) (update :output update-keys keyword)
      (:answers spec)       (update :answers update-keys #(if (keyword? %) (name %) (str %))))))

(mu/defn- normalize-spec
  [{:keys [input kind answers output] :as spec} :- ::classification]
  (let [kind (keyword (or kind :choice))]
    (when (and (= kind :choice) (< (count answers) 2))
      (throw (ex-info (format "Jev classification %s needs at least two answers" (pr-str (:name output)))
                      {:status-code 400, :spec spec})))
    (assoc spec
           :kind   kind
           :inputs (if (string? input) [input] (vec input))
           :mode   (keyword (:mode output))
           :column (:name output))))

(defn- output-columns
  "The columns a spec adds to the target, as `{:name :type}`. `fill-empty`/`overwrite` add none."
  [{:keys [kind mode column]}]
  (when (= mode :new-column)
    (if (= kind :choice)
      [{:name column :type :type/Text}
       {:name (str column "_confidence") :type :type/Float}]
      [{:name column :type :type/Float}])))

;;; ------------------------------------------------ Jev --------------------------------------------------

(defn- question [{:keys [kind question answers]}]
  (if (= kind :choice)
    (jev/choice question answers)
    (jev/noul question)))

;; Keyed on everything that shapes the answer, so re-running a transform or re-previewing after editing one
;; answer's description only calls Jev for what changed. Unbounded growth is capped by a blunt reset.
(defonce ^:private answer-cache (atom {}))

(defn- cache-key [spec state]
  [(select-keys spec [:kind :question :answers]) state])

(defn- cache! [k answer]
  (swap! answer-cache (fn [m] (assoc (if (> (count m) 100000) {} m) k answer))))

(defn- row-state
  "The facts Jev judges a row by: the spec's input columns, by name. Nil when every input is blank."
  [{:keys [inputs]} row-map]
  (let [state (into {} (keep (fn [col]
                               (let [v (get row-map col)]
                                 (when-not (or (nil? v) (and (string? v) (str/blank? v)))
                                   [col v]))))
                    inputs)]
    (not-empty state)))

(defn- needs-answer? [{:keys [mode column]} row-map]
  (case mode
    :fill-empty (let [v (get row-map column)]
                  (or (nil? v) (and (string? v) (str/blank? v))))
    true))

(defn- judge-row
  "Answers for one row: a vector parallel to `specs` of Jev answers (nil when not asked or on failure).
  Specs whose inputs are the same share one Jev call — one state, several questions."
  [specs row-map failures]
  (let [asks    (for [[i spec] (map-indexed vector specs)
                      :when    (needs-answer? spec row-map)
                      :let     [state (row-state spec row-map)]
                      :when    state]
                  {:i i :spec spec :state state :k (cache-key spec state)})
        cached  (into {} (keep (fn [{:keys [i k]}]
                                 (when-let [a (get @answer-cache k)] [i a])))
                      asks)
        pending (remove (comp cached :i) asks)
        fresh   (into {}
                      (mapcat (fn [[state group]]
                                (let [qs  (into {} (map (fn [{:keys [i spec]}]
                                                          [(keyword (str "q" i)) (question spec)]))
                                                group)
                                      res (jev/ask state qs)]
                                  (if (:ok res)
                                    (keep (fn [{:keys [i k]}]
                                            (when-let [a (get-in res [:answers (keyword (str "q" i))])]
                                              (cache! k a)
                                              [i a]))
                                          group)
                                    (do (swap! failures conj (:error res))
                                        nil)))))
                      (group-by :state pending))
        answers (merge cached fresh)]
    (mapv #(get answers %) (range (count specs)))))

(defn- pmap-bounded
  "Like `mapv` of `f` over `coll`, running at most `n` at once. Rethrows the first failure."
  [n f coll]
  (let [^ExecutorService pool (Executors/newFixedThreadPool n)]
    (try
      (let [futures (mapv (fn [x] (.submit pool ^Callable (fn [] (f x)))) coll)]
        (mapv (fn [^Future fut]
                (try
                  (.get fut)
                  (catch ExecutionException e
                    (throw (or (.getCause e) e)))))
              futures))
      (finally
        (.shutdownNow pool)))))

;;; ------------------------------------------------ Rows --------------------------------------------------

(defn- apply-answer
  "Write one spec's `answer` into the output `row-map`."
  [row-map {:keys [kind mode column min-confidence]} answer]
  (let [confidence (:confidence answer)
        confident? (or (nil? min-confidence) (and confidence (>= confidence min-confidence)))
        value      (if (= kind :choice) (:choice answer) (:noul answer))]
    (case mode
      :new-column
      (if (= kind :choice)
        (assoc row-map
               column                      (when answer (if confident? value unsure))
               (str column "_confidence")  confidence)
        (assoc row-map column value))

      ;; Rewriting data the user already has: keep the original rather than write a guess.
      (:fill-empty :overwrite)
      (if (and answer confident? (some? value))
        (assoc row-map column (str value))
        row-map))))

(defn- insert-type
  "A column type every transform target can create, from a source column's `base_type`."
  [base-type]
  (let [base-type (keyword base-type)]
    (or (some #(when (isa? base-type %) %)
              [:type/Boolean :type/BigInteger :type/Integer :type/Float :type/Decimal
               :type/DateTimeWithTZ :type/DateTime :type/Date :type/Text])
        :type/Text)))

(defn- output-schema
  "The target's columns: the source columns (retyped to Text where a spec rewrites them) plus each spec's
  new columns."
  [specs cols]
  (let [rewritten (into #{} (comp (remove (comp #{:new-column} :mode)) (map :column)) specs)
        existing  (into #{} (map :name) cols)
        _         (doseq [{:keys [mode column]} specs]
                    (when (and (not= mode :new-column) (not (existing column)))
                      (throw (ex-info (format "Jev classify: column %s does not exist in the source" column)
                                      {:status-code 400, :column column}))))
        added     (mapcat output-columns specs)
        clash     (some (comp existing :name) added)]
    (when clash
      (throw (ex-info (format "Jev classify: column %s already exists in the source" clash)
                      {:status-code 400, :column clash})))
    (into (mapv (fn [{col-name :name :keys [base_type]}]
                  {:name col-name
                   :type (if (rewritten col-name) :type/Text (insert-type base_type))})
                cols)
          added)))

(defn- run-source-query
  "Run `query` capped at `limit` rows. Returns `{:cols :rows}`."
  [query limit]
  (let [{{:keys [cols rows]} :data :as result}
        (qp/process-query (assoc query :constraints {:max-results limit, :max-results-bare-rows limit}))]
    (when (= :failed (:status result))
      (throw (ex-info (str "Jev classify: source query failed: " (:error result)) {:result result})))
    {:cols cols :rows rows}))

(mu/defn classify
  "Run the classify `specs` over `query`'s first `limit` rows. Returns `{:columns [{:name :type}] :rows [[...]]
  :stats {...}}`, with `rows` parallel to `columns`. Throws when every Jev call failed (e.g. no token).
  `cancelled?` is polled before each row."
  [query      :- [:map {:closed false, ::mr/deliberately-open true}]
   specs      :- ::raw-classifications
   limit      :- pos-int?
   cancelled? :- [:maybe ifn?]]
  (let [specs      (mapv (comp normalize-spec canonicalize-keys) specs)
        {:keys [cols rows]} (run-source-query query (min limit max-rows))
        columns    (output-schema specs cols)
        col-names  (mapv :name cols)
        failures   (atom [])
        started    (System/nanoTime)
        out-rows   (pmap-bounded
                    parallelism
                    (fn [row]
                      (when (and cancelled? (cancelled?))
                        (throw (ex-info "Transform cancelled during Jev classify" {:status :cancelled})))
                      (let [row-map (zipmap col-names row)
                            answers (judge-row specs row-map failures)
                            out     (reduce (fn [m [spec answer]] (apply-answer m spec answer))
                                            row-map
                                            (map vector specs answers))]
                        (mapv (comp out :name) columns)))
                    rows)
        failed     @failures]
    (when (and (seq rows) (seq failed) (= (count failed) (count rows)))
      (throw (ex-info (str "Jev classify: every Jev call failed: " (first failed)) {:errors (take 5 failed)})))
    (when (seq failed)
      (log/warnf "Jev classify: %d of %d Jev calls failed, e.g. %s" (count failed) (count rows) (first failed)))
    {:columns columns
     :rows    out-rows
     :stats   {:rows        (count rows)
               :jev-failures (count failed)
               :elapsed-ms  (quot (- (System/nanoTime) started) 1000000)}}))

;;; ------------------------------------------------ Target ------------------------------------------------

(defn- write-table!
  "Replace `target`'s table with `columns`/`rows`: build a temp table, then swap it in."
  [driver database target columns rows]
  (let [db-id      (:id database)
        table-name (transforms-base.u/qualified-table-name driver target)
        table-def  (fn [table-name] {:name    (if (keyword? table-name) table-name (keyword table-name))
                                     :columns (mapv #(assoc % :nullable? true) columns)})
        exists?    (driver/table-exists? driver database target)
        insert!    (fn [table-name]
                     (transforms-base.u/create-table-from-schema! driver db-id (table-def table-name))
                     (driver/insert-from-source! driver db-id (table-def table-name) {:type :rows :data rows}))]
    (when (and (not (str/blank? (:schema target)))
               (not (driver/schema-exists? driver db-id (:schema target))))
      (driver/create-schema-if-needed! driver (driver/connection-spec driver database) (:schema target)))
    (cond
      (not exists?)
      (insert! table-name)

      (driver.u/supports? driver :rename database)
      (let [temp (transforms-base.u/temp-table-name driver (namespace table-name))]
        (try
          (insert! temp)
          (transforms-base.u/drop-table! driver db-id table-name)
          (driver/rename-table! driver db-id temp table-name)
          (catch Exception e
            (try (transforms-base.u/drop-table! driver db-id temp) (catch Exception _))
            (throw e))))

      :else
      (do (transforms-base.u/drop-table! driver db-id table-name)
          (insert! table-name)))))

(defn- run-classify-transform!
  [{:keys [source target] :as transform} {:keys [cancelled?]}]
  (try
    (when (and cancelled? (cancelled?))
      (throw (ex-info "Transform cancelled before start" {:status :cancelled})))
    (when-not (= "table" (some-> (:type target) name))
      (throw (ex-info "Jev classify transforms only support plain table targets" {:target target})))
    (let [db-id                         (transforms-base.i/source-db-id transform)
          {driver :engine :as database} (t2/select-one :model/Database :id db-id)
          _                             (when-not database
                                          (throw (ex-info "Source database for this transform has been deleted."
                                                          {:transform-id (:id transform)})))
          _                             (transforms-base.u/throw-if-db-routing-enabled! transform database)
          {:keys [columns rows stats]}  (classify (:query source) (:jev-classify source) max-rows cancelled?)]
      (log/infof "Jev classify transform %s: judged %s" (:id transform) (pr-str stats))
      (write-table! driver database target columns rows)
      {:status :succeeded
       :result {:rows-affected (count rows) :jev stats}})
    (catch Exception e
      (if (= :cancelled (:status (ex-data e)))
        {:status :cancelled :error e}
        (do (log/errorf e "Error executing Jev classify transform: %s" (ex-message e))
            {:status :failed :error e})))))

;;; A classify transform is a query transform in every respect but how its target is written.

(defmethod transforms-base.i/source-db-id :jev [transform]
  ((get-method transforms-base.i/source-db-id :query) transform))

(defmethod transforms-base.i/target-db-id :jev [transform]
  ((get-method transforms-base.i/target-db-id :query) transform))

(defmethod transforms-base.i/table-dependencies :jev [transform]
  ((get-method transforms-base.i/table-dependencies :query) transform))

(defmethod transforms-base.i/execute-base! :jev [transform opts]
  (run-classify-transform! transform opts))

(defmethod transforms.i/execute! :jev [transform opts]
  ((get-method transforms.i/execute! :query) transform opts))

;;; ------------------------------------------------ API ---------------------------------------------------

(api.macros/defendpoint :post "/classify/preview" :- :any
  "Run a Jev classify step over the first `limit` rows (default 20) of `query` and return them, without
  writing anything. Same `classify` shape as a transform's `:jev-classify`."
  [_route-params
   _query-params
   {query :query, specs :classify, limit :limit}
   :- [:map {:closed true}
       [:query    [:map {:closed false, ::mr/deliberately-open true}]]
       [:classify ::raw-classifications]
       [:limit    {:optional true} [:maybe [:int {:min 1, :max 200}]]]]]
  (classify query specs (or limit 20) nil))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/classify/*` routes."
  (api.macros/ns-handler *ns*))
