(ns metabase-enterprise.data-sensitivity.models.metadata-generation-run
  "A `metadata_generation_run` is one LLM metadata generation run over a database, a list of schemas or a list of
  tables. Its suggestions are `metadata_generation_suggestion` rows. `is_active` is true while the run is pending,
  running or canceling and NULL after, so the unique (database_id, is_active) constraint allows one active run per
  database."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/MetadataGenerationRun [_model] :metadata_generation_run)

(derive :model/MetadataGenerationRun :metabase/model)
(derive :model/MetadataGenerationRun :hook/timestamped?)

(mr/def ::attribute
  [:enum :data_sensitivity :semantic_type :description])

(mr/def ::status
  [:enum :pending :running :canceling :succeeded :failed :canceled :timeout :usage_limit])

(def active-statuses
  "Statuses of a run that has not ended. A `:canceling` run stays active until its worker stops."
  #{:pending :running :canceling})

(mr/def ::scope
  [:multi {:dispatch :type}
   [:database [:map {:closed true} [:type [:= :database]]]]
   [:schemas  [:map {:closed true} [:type [:= :schemas]] [:schemas [:sequential {:min 1} :string]]]]
   [:tables   [:map {:closed true} [:type [:= :tables]] [:table_ids [:sequential {:min 1} ms/PositiveInt]]]]])

(mr/def ::table-error
  [:map {:closed true}
   [:table_id   ms/PositiveInt]
   [:table_name {:optional true} [:maybe :string]]
   [:schema     {:optional true} [:maybe :string]]
   [:message    :string]
   [:error_code {:optional true} [:maybe :string]]
   [:elapsed_ms {:optional true} [:maybe :int]]])

(mr/def ::usage
  [:map {:closed true}
   [:input_tokens          :int]
   [:output_tokens         :int]
   [:cache_read_tokens     {:optional true} :int]
   [:cache_creation_tokens {:optional true} :int]
   [:total_tokens          :int]
   [:cost_usd              {:optional true} [:maybe number?]]
   [:max_table_ms          {:optional true} :int]
   [:slow_calls            {:optional true} :int]])

(mr/def ::metadata-generation-run
  [:map
   [:id             ms/PositiveInt]
   [:database_id    ms/PositiveInt]
   [:scope          ::scope]
   [:attributes     [:sequential {:min 1} ::attribute]]
   [:status         ::status]
   [:is_active      [:maybe [:= true]]]
   [:total_tables   ms/IntGreaterThanOrEqualToZero]
   [:done_tables    ms/IntGreaterThanOrEqualToZero]
   [:failed_tables  ms/IntGreaterThanOrEqualToZero]
   [:table_errors   [:maybe [:sequential ::table-error]]]
   [:message        [:maybe :string]]
   [:usage          [:maybe ::usage]]
   [:creator_id     [:maybe ms/PositiveInt]]
   [:created_at     some?]
   [:updated_at     some?]
   [:started_at     [:maybe some?]]
   [:ended_at       [:maybe some?]]
   [:last_heartbeat [:maybe some?]]])

(mr/def ::new-run
  "The columns a caller sets when it inserts a run."
  [:map {:closed true}
   [:database_id    ms/PositiveInt]
   [:scope          ::scope]
   [:attributes     [:sequential {:min 1} ::attribute]]
   [:total_tables   ms/IntGreaterThanOrEqualToZero]
   [:creator_id     [:maybe ms/PositiveInt]]
   [:last_heartbeat {:optional true} (ms/InstanceOfClass java.time.OffsetDateTime)]])

(mr/def ::changes
  "The columns a caller updates on a run."
  [:map {:closed true}
   [:status         {:optional true} ::status]
   [:started_at     {:optional true} (ms/InstanceOfClass java.time.OffsetDateTime)]
   [:last_heartbeat {:optional true} (ms/InstanceOfClass java.time.OffsetDateTime)]
   [:done_tables    {:optional true} ms/IntGreaterThanOrEqualToZero]
   [:failed_tables  {:optional true} ms/IntGreaterThanOrEqualToZero]
   [:table_errors   {:optional true} [:maybe [:sequential ::table-error]]]
   [:usage          {:optional true} [:maybe ::usage]]
   [:message        {:optional true} [:maybe :string]]])

(def ^:private transform-scope
  {:in  mi/json-in
   :out (comp #(cond-> % (map? %) (update :type keyword)) mi/json-out-with-keywordization)})

(def ^:private transform-attributes
  {:in  (comp mi/json-in #(mapv name %))
   :out (comp #(cond->> % (sequential? %) (mapv keyword)) mi/json-out-with-keywordization)})

(t2/deftransforms :model/MetadataGenerationRun
  {:status       mi/transform-keyword
   :is_active    mi/transform-boolean
   :scope        transform-scope
   :attributes   transform-attributes
   :table_errors mi/transform-json
   :usage        mi/transform-json})

(defn- terminal-status-changes
  "Changes to apply when `status` moves the run out of [[active-statuses]]."
  [run changes]
  (when-let [status (some-> (:status changes) keyword)]
    (when-not (active-statuses status)
      (cond-> {:is_active nil}
        (and (nil? (:ended_at run)) (not (contains? changes :ended_at)))
        (assoc :ended_at (mi/now))))))

(t2/define-before-insert :model/MetadataGenerationRun
  [run]
  (merge {:status :pending :is_active true} run))

(t2/define-before-update :model/MetadataGenerationRun
  [run]
  (merge run (terminal-status-changes run (t2/changes run))))
