(ns metabase-enterprise.workspaces.types
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::appdb-id ms/PositiveInt)

(mr/def ::ref-id [:string {:min 1 :api/regex #".+"}])

(mr/def ::flag
  "Boolean flag that accepts true, false, or 1 (for query param compatibility)."
  [:or [:= 1] :boolean])

(def entity-types
  "The kinds of entities we can store within a Workspace."
  [{:name  "Transform"
    :key   :transform
    :group :transforms
    :model :model/Transform}])

(mr/def ::entity-type (into [:enum] (map :key) entity-types))

(mr/def ::entity-grouping (into [:enum] (map :group) entity-types))

;; Map like {:transforms [1 2 3]}
(mr/def ::entity-map
  [:map-of ::entity-grouping [:sequential ms/PositiveInt]])

(mr/def ::ancestors-result
  "Result of running stale ancestor transforms."
  [:map
   [:succeeded [:sequential ::ref-id]]
   [:failed [:sequential ::ref-id]]
   [:not_run [:sequential ::ref-id]]])

(mr/def ::execution-result
  [:map
   [:status [:enum :succeeded :failed]]
   [:start_time {:optional true} [:maybe some?]]
   [:end_time {:optional true} [:maybe some?]]
   [:message {:optional true} [:maybe :string]]
   [:table [:map
            [:name :string]
            [:schema {:optional true} [:maybe :string]]]]
   [:ancestors {:optional true} ::ancestors-result]])

(mr/def ::query-result
  "Result of a query preview (dry-run or ad-hoc query).
   Data is nested under :data to match /api/dataset response format."
  [:map
   [:status [:enum :succeeded :failed]]
   [:message {:optional true} [:maybe :string]]
   [:running_time {:optional true} [:maybe :int]]
   [:started_at {:optional true} [:maybe :any]]
   [:data {:optional true}
    [:map
     [:rows {:optional true} [:sequential :any]]
     [:cols {:optional true} [:sequential :map]]
     [:results_metadata {:optional true} [:map
                                          [:columns {:optional true} [:sequential :map]]]]]]
   [:ancestors {:optional true} ::ancestors-result]])

;;; ---------------------------------------- Graph/Problem Types ----------------------------------------

;; Node types used in workspace graphs and problem detection
(mr/def ::node-type [:enum :input-table :external-transform :workspace-transform])

(mr/def ::table-coord
  "Logical reference to a table by database, schema, and name."
  [:map
   [:db_id ::appdb-id]
   [:schema [:maybe :string]]
   [:table :string]])

(mr/def ::node-ref
  "Reference to a node in the graph or a related entity."
  [:map
   [:type ::node-type]
   [:id [:or ::appdb-id ::ref-id]]
   [:name {:optional true} :string]])

;;; ---------------------------------------- Problem Types ----------------------------------------

;; Problem type definitions with metadata for FE display and merge-blocking behavior
;; See validation.clj docstring for full documentation table

(def problem-types
  "All problem types with their metadata.

   Each entry has:
   - :description - human-readable explanation
   - :severity - :error, :warning, or :info
   - :block-merge - whether this problem should prevent merging
   - :static? - true if determinable from metadata alone, false if requires runtime info

   ## Categories

   Dependency-based (about output state) - prefix indicates who depends on the output:
   - unused-*              : nothing depends on this output
   - internal-downstream-* : transforms within the workspace graph depend on this
   - external-downstream-* : transforms outside the workspace depend on this

   Structural (about graph shape) - prefix indicates scope of the issue:
   - internal-* : between workspace transforms only
   - external-* : involves global transforms (upstream or downstream)"
  {;; No dependents (informational)
   :unused/not-run {:description   "Output hasn't been created yet, but nothing depends on it"
                    :severity      :info
                    :block-merge false
                    :static?       true}
   :unused/stale   {:description   "Output is stale (needs re-run), but nothing depends on it"
                    :severity      :info
                    :block-merge false
                    :static?       true}
   :unused/failed  {:description   "Transform failed on last run, but nothing depends on it"
                    :severity      :error
                    :block-merge false
                    :static?       false}

   ;; Internal dependents (blocks workspace progress)
   :internal-downstream/not-run {:description   "Output hasn't been created yet, other workspace transforms need it"
                                 :severity      :warning
                                 :block-merge true
                                 :static?       true}
   :internal-downstream/stale   {:description   "Output is stale, other workspace transforms need fresh data"
                                 :severity      :warning
                                 :block-merge true
                                 :static?       true}
   :internal-downstream/failed  {:description   "Transform failed on last run, other workspace transforms need it"
                                 :severity      :error
                                 :block-merge true
                                 :static?       false}

   ;; External dependents (would affect things after merge)
   :external-downstream/not-run       {:description   "Output hasn't been created yet, external transforms depend on it"
                                       :severity      :warning
                                       :block-merge true
                                       :static?       true}
   :external-downstream/stale         {:description   "Output is stale, external transforms are using outdated data"
                                       :severity      :warning
                                       :block-merge true
                                       :static?       true}
   :external-downstream/removed-field {:description   "Field was removed that external transforms reference"
                                       :severity      :error
                                       :block-merge true
                                       :static?       true}
   :external-downstream/removed-table {:description   "Table was removed, external transforms will stop receiving updates"
                                       :severity      :warning
                                       :block-merge false
                                       :static?       true}

   ;; Structural issues (conflicts/cycles)
   :internal/target-conflict {:description   "Multiple workspace transforms target the same table"
                              :severity      :error
                              :block-merge true
                              :static?       true}
   :internal/cycle           {:description   "Circular dependency between workspace transforms"
                              :severity      :error
                              :block-merge true
                              :static?       true}
   :external/target-conflict {:description   "Workspace transform conflicts with an existing global transform's target"
                              :severity      :error
                              :block-merge true
                              :static?       true}
   :external/cycle           {:description   "Workspace changes would create a circular dependency with global transforms"
                              :severity      :error
                              :block-merge true
                              :static?       true}})

(mr/def ::problem-type (into [:enum] (keys problem-types)))

(mr/def ::severity [:enum :error :warning :info])

;; Categories derived from problem-type namespaces
(mr/def ::problem-category
  (into [:enum] (distinct (map (comp keyword namespace) (keys problem-types)))))

;; Problem names derived from problem-type names
(mr/def ::problem-name
  (into [:enum] (distinct (map (comp keyword name) (keys problem-types)))))

(mr/def ::problem
  "A problem detected during workspace validation."
  [:map
   [:category ::problem-category]
   [:problem ::problem-name]
   [:severity ::severity]
   [:block_merge :boolean]
   [:data :map]])
