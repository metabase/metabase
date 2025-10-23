(ns metabase-enterprise.dependencies.calculation
  (:require
   [metabase-enterprise.dependencies.native-validation :as deps.native]
   [metabase-enterprise.dependencies.schema :as deps.schema]
   [metabase-enterprise.documents.prose-mirror :as prose-mirror]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- upstream-deps:mbql-query :- ::deps.schema/upstream-deps
  [query :- ::lib.schema/query]
  {:card  (or (lib/all-source-card-ids query)  #{})
   :table (or (lib/all-source-table-ids query) #{})})

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

(mu/defn upstream-deps:card :- ::deps.schema/upstream-deps
  "Given a Toucan `:model/Card`, return its upstream dependencies as a map from the kind to a set of IDs."
  [{query :dataset_query :as card} :- ::queries.schema/card]
  (let [query-deps (upstream-deps:query query)
        param-cards (keep #(-> % :values_source_config :card_id) (:parameters card))]
    (reduce (fn [deps card-id]
              (update deps :card (fnil conj #{}) card-id))
            query-deps
            param-cards)))

(mu/defn upstream-deps:transform :- ::deps.schema/upstream-deps
  "Given a Transform (in Toucan form), return its upstream dependencies."
  [{{:keys [query], source-type :type} :source :as transform} :-
   [:map
    [:source [:multi {:dispatch (comp keyword :type)}
              [:query
               [:map [:query ::lib.schema/query]]]
              [:python
               [:map]]]]]]
  (if (= (keyword source-type) :query)
    (upstream-deps:query query)
    (do (log/warnf "Don't know how to analyze the deps of Transform %d with source type '%s'" (:id transform) source-type)
        {})))

(mu/defn upstream-deps:snippet :- ::deps.schema/upstream-deps
  "Given a native query snippet, return its upstream dependencies in the usual `{entity-type #{1 2 3}}` format."
  [{:keys [template_tags] :as _snippet}]
  (let [type->id-key {:card :card-id, :snippet :snippet-id}
        dependencies (keep (fn [tag]
                             (let [entity-type (:type tag)]
                               (when-let [id-key (type->id-key entity-type)]
                                 (when-let [entity-id (id-key tag)]
                                   [entity-type entity-id]))))
                           (vals template_tags))]
    (u/group-by first second conj #{} dependencies)))

(mu/defn upstream-deps:dashboard :- ::deps.schema/upstream-deps
  "Given a dashboard, return its upstream dependencies"
  [{:keys [dashcards series-card-ids] :as dashboard}]
  (let [card-ids (into #{} (keep :card_id dashcards))
        parameter-cards (into #{} (keep (comp :card_id :values_source_config) (:parameters dashboard)))
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
                                       parameter-cards
                                       vis-setting-card-ids
                                       column-setting-card-ids])
        all-dashboard-ids (into vis-setting-dashboard-ids column-setting-dashboard-ids)]
    {:card all-card-ids
     :dashboard all-dashboard-ids}))

;; Modified implementation of documents.models.document/document-deps
(defn- document-deps
  [{:keys [content_type] :as document}]
  (when (= content_type prose-mirror/prose-mirror-content-type)
    (prose-mirror/collect-ast document (fn [{:keys [type attrs]}]
                                         (cond
                                           (and (= prose-mirror/smart-link-type type)
                                                (#{"card" "dashboard" "table"} (:model attrs)))
                                           [(keyword (:model attrs)) (:entityId attrs)]

                                           (= prose-mirror/card-embed-type type)
                                           [:card (:id attrs)]

                                           :else
                                           nil)))))

(mu/defn upstream-deps:document :- ::deps.schema/upstream-deps
  "Given a document, return its upstream dependencies"
  [document]
  (reduce (fn [deps [dep-type dep-id]]
            (update deps dep-type (fnil conj #{}) dep-id))
          {}
          (document-deps document)))

(mu/defn upstream-deps:sandbox :- ::deps.schema/upstream-deps
  "Given a sandbox, return its upstream dependencies"
  [sandbox]
  (if-let [card-id (:card_id sandbox)]
    {:card #{card-id}}
    {}))
