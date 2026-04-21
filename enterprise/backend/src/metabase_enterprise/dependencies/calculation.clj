(ns metabase-enterprise.dependencies.calculation
  (:require
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase-enterprise.dependencies.schema :as deps.schema]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmulti calculate-deps*
  "Implementation multimethod for [[calculate-deps]]. Dispatches on entity-type keyword.
  Prefer calling [[calculate-deps]] which validates the return value."
  {:arglists '([entity-type entity])}
  (fn [entity-type _entity] entity-type))

(mu/defn calculate-deps :- ::deps.schema/upstream-deps
  "Calculate upstream dependencies for a single entity.
  Returns a map of dependency-type -> set of entity IDs."
  [entity-type :- keyword?
   entity]
  (calculate-deps* entity-type entity))

;;; ------------------------------------------------ Helpers ------------------------------------------------

(mu/defn- upstream-deps:mbql-query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/query]
  {:card (or (lib/all-source-card-ids query) #{})
   :measure (or (lib/all-measure-ids query) #{})
   :segment (or (lib/all-segment-ids query) #{})
   :table (-> #{}
              (into (lib/all-source-table-ids query))
              (into (lib/all-implicitly-joined-table-ids query)))})

(mu/defn- upstream-deps:native-query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/native-only-query]
  (let [driver (:engine (lib.metadata/database query))
        deps   (deps.native/native-query-deps driver query)]
    ;; The deps are in #{{:table 7} ...} form and need conversion to ::deps.schema/upstream-deps form.
    (u/group-by ffirst (comp second first) conj #{} deps)))

(mu/defn- upstream-deps:query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/query]
  (if (lib/native-only-query? query)
    (upstream-deps:native-query query)
    (upstream-deps:mbql-query query)))

(mu/defn- upstream-deps:python-transform :- ::deps.schema/upstream-deps
  [{{tables :source-tables} :source :as _py-transform}
   :- [:map [:source-tables {:optional true} [:sequential ::transforms-base.u/source-table-entry]]]]
  {:table (into #{} (keep :table_id) tables)})

;; Modified implementation of documents.models.document/document-deps
(defn- document-deps
  [{:keys [content_type] :as document}]
  (when (= content_type prose-mirror/prose-mirror-content-type)
    (prose-mirror/collect-ast document (fn [{:keys [type attrs]}]
                                         (cond
                                           (and (= prose-mirror/smart-link-type type)
                                                (#{"card" "dashboard" "table" "document"} (:model attrs)))
                                           [(keyword (:model attrs)) (:entityId attrs)]

                                           (= prose-mirror/card-embed-type type)
                                           [:card (:id attrs)]

                                           :else
                                           nil)))))

;;; ------------------------------------------------ defmethods ------------------------------------------------

(defmethod calculate-deps* :card
  [_ {query :dataset_query :as card}]
  {:pre [(some? query)]}
  (let [query-deps (upstream-deps:query query)
        param-card-ids (keep #(-> % :values_source_config :card_id) (:parameters card))]
    (reduce (fn [deps card-id]
              (update deps :card (fnil conj #{}) card-id))
            query-deps
            param-card-ids)))

(defmethod calculate-deps* :transform
  [_ {{:keys [query]} :source :as transform}]
  (let [source-type (transforms-base.u/transform-type transform)]
    (case source-type
      :query (upstream-deps:query query)
      :python (upstream-deps:python-transform transform)
      (do (log/warnf "Don't know how to analyze the deps of Transform %d with source type '%s'" (:id transform) source-type)
          {}))))

(defmethod calculate-deps* :snippet
  [_ {:keys [template_tags] :as _snippet}]
  (let [type->id-key {:card :card-id, :snippet :snippet-id}
        dependencies (keep (fn [tag]
                             (let [entity-type (:type tag)]
                               (when-let [id-key (type->id-key entity-type)]
                                 (when-let [entity-id (id-key tag)]
                                   [entity-type entity-id]))))
                           (vals template_tags))]
    (u/group-by first second conj #{} dependencies)))

(defmethod calculate-deps* :dashboard
  [_ {:keys [dashcards] :as dashboard}]
  (let [card-ids (into #{} (keep :card_id dashcards))
        series-card-ids (into #{} (comp (mapcat :series) (map :id)) dashcards)
        param-card-ids (into #{} (keep (comp :card_id :values_source_config) (:parameters dashboard)))
        vis-setting-target-ids (fn [link-type]
                                 (into #{} (keep (fn [dashcard]
                                                   (let [cb (:click_behavior (:visualization_settings dashcard))]
                                                     (when (= (:linkType cb) link-type)
                                                       (:targetId cb))))
                                                 dashcards)))
        vis-setting-card-ids (vis-setting-target-ids "question")
        vis-setting-dashboard-ids (vis-setting-target-ids "dashboard")
        column-setting-target-ids (fn [link-type]
                                    (reduce into #{}
                                            (map (fn [dashcard]
                                                   (keep (fn [[_col col-setting]]
                                                           (let [cb (:click_behavior col-setting)]
                                                             (when (= (:linkType cb) link-type)
                                                               (:targetId cb))))
                                                         (:column_settings (:visualization_settings dashcard))))
                                                 dashcards)))
        column-setting-card-ids (column-setting-target-ids "question")
        column-setting-dashboard-ids (column-setting-target-ids "dashboard")
        all-card-ids (reduce into #{} [card-ids
                                       series-card-ids
                                       param-card-ids
                                       vis-setting-card-ids
                                       column-setting-card-ids])
        all-dashboard-ids (into vis-setting-dashboard-ids column-setting-dashboard-ids)]
    {:card all-card-ids
     :dashboard all-dashboard-ids}))

(defmethod calculate-deps* :document
  [_ document]
  (reduce (fn [deps [dep-type dep-id]]
            (update deps dep-type (fnil conj #{}) dep-id))
          {}
          (document-deps document)))

(defmethod calculate-deps* :sandbox
  [_ sandbox]
  (if-let [card-id (:card_id sandbox)]
    {:card #{card-id}}
    {}))

(defmethod calculate-deps* :segment
  [_ {:keys [table_id definition] :as _segment}]
  {:segment (or (lib/all-segment-ids definition) #{})
   :table (cond-> (into #{} (lib/all-implicitly-joined-table-ids definition))
            table_id (conj table_id))})

(defmethod calculate-deps* :measure
  [_ {:keys [table_id definition] :as _measure}]
  {:measure (or (lib/all-measure-ids definition) #{})
   :segment (or (lib/all-segment-ids definition) #{})
   :table (cond-> (into #{} (lib/all-implicitly-joined-table-ids definition))
            table_id (conj table_id))})
