(ns metabase.xrays.api.automagic-dashboards
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.query.permissions :as query-perms]
   [metabase.queries.core :as queries]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.regex :as u.regex]
   [metabase.xrays.automagic-dashboards.comparison :as automagic-dashboards.comparison]
   [metabase.xrays.automagic-dashboards.core :as automagic-dashboards.core]
   [metabase.xrays.automagic-dashboards.dashboard-templates :as automagic-dashboards.dashboard-templates]
   [metabase.xrays.transforms.dashboard :as transforms.dashboard]
   [metabase.xrays.transforms.materialize :as transforms.materialize]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private Show
  (mu/with-api-error-message
   [:maybe [:or [:enum "all"] nat-int?]]
   (deferred-tru "invalid show value")))

(def ^:private Prefix
  [:fn
   {:error/fn  (fn [_ _]
                 (i18n/tru "invalid value for prefix"))
    :api/regex #"[A-Za-z]+"}
   (fn [prefix]
     (some #(not-empty (automagic-dashboards.dashboard-templates/get-dashboard-templates [% prefix])) ["table" "metric" "field"]))])

(def ^:private DashboardTemplate
  (mu/with-api-error-message
   [:fn (fn [dashboard-template]
          (some (fn [toplevel]
                  (some (comp automagic-dashboards.dashboard-templates/get-dashboard-template
                              (fn [prefix]
                                [toplevel prefix dashboard-template])
                              :dashboard-template-name)
                        (automagic-dashboards.dashboard-templates/get-dashboard-templates [toplevel])))
                ["table" "metric" "field"]))]
   (deferred-tru "invalid value for dashboard template name")))

(def ^:private ^{:arglists '([s])} decode-base64-json
  (comp json/decode+kw codecs/bytes->str codec/base64-decode))

(def ^:private Base64EncodedJSON
  [:fn
   {:description "form-encoded base-64-encoded JSON"
    :error/fn    (fn [_ _]
                   (i18n/tru "value couldn''t be parsed as base64 encoded JSON"))}
   decode-base64-json])

(api.macros/defendpoint :get "/database/:id/candidates"
  "Return a list of candidates for automagic dashboards ordered by interestingness."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (-> (t2/select-one :model/Database :id id)
      api/read-check
      automagic-dashboards.core/candidate-tables))

;; ----------------------------------------- API Endpoints for viewing a transient dashboard ----------------

(defn- adhoc-query-read-check
  [query]
  (api/check-403
   (query-perms/check-data-perms (:dataset_query query)
                                 (query-perms/required-perms-for-query (:dataset_query query))
                                 :throw-exceptions? false))
  query)

(defn- ensure-int
  [x]
  (if (string? x)
    (Integer/parseInt x)
    x))

(defmulti ^:private ->entity
  "Parse/decode/coerce string `s` an to an entity of `entity-type`. `s` is something like a unparsed integer row ID,
  encoded query, or transform name."
  {:arglists '([entity-type s])}
  (fn [entity-type _s]
    (keyword entity-type)))

(defmethod ->entity :table
  [_entity-type table-id-str]
  ;; table-id can also be a source query reference like `card__1` so in that case we should pull the ID out and use the
  ;; `:question` method instead
  (if-let [[_ card-id-str] (when (string? table-id-str)
                             (re-matches #"^card__(\d+$)" table-id-str))]
    (->entity :question card-id-str)
    (api/read-check (t2/select-one :model/Table :id (ensure-int table-id-str)))))

(defmethod ->entity :segment
  [_entity-type segment-id-str]
  (api/read-check (t2/select-one :model/Segment :id (ensure-int segment-id-str))))

(defmethod ->entity :model
  [_entity-type card-id-str]
  (api/read-check (t2/select-one :model/Card
                                 :id (ensure-int card-id-str)
                                 :type :model)))

(defmethod ->entity :question
  [_entity-type card-id-str]
  (api/read-check (t2/select-one :model/Card :id (ensure-int card-id-str))))

(mu/defn adhoc-query-instance :- (ms/InstanceOf :model/Query)
  "Wrap query map into a Query object (mostly to facilitate type dispatch)."
  [query :- :map]
  (mi/instance :model/Query
               (merge (queries/query->database-and-table-ids query)
                      {:dataset_query (mi/maybe-normalize-query :out query)})))

(defmethod ->entity :adhoc
  [_entity-type encoded-query]
  (adhoc-query-read-check (adhoc-query-instance (decode-base64-json encoded-query))))

(defmethod ->entity :field
  [_entity-type field-id-str]
  (api/read-check (t2/select-one :model/Field :id (ensure-int field-id-str))))

(defmethod ->entity :transform
  [_entity-type transform-name]
  (api/read-check (t2/select-one :model/Collection :id (transforms.materialize/get-collection transform-name)))
  transform-name)

(def ^:private entities
  (map name (keys (methods ->entity))))

(def ^:private Entity
  (into [:enum {:api/regex (u.regex/re-or entities)
                :error/fn  (fn [_ _]
                             (i18n/tru "Invalid entity type"))}]
        entities))

(def ^:private ComparisonEntity
  (mu/with-api-error-message
   [:enum "segment" "adhoc" "table"]
   (deferred-tru "Invalid comparison entity type. Can only be one of \"table\", \"segment\", or \"adhoc\"")))

(defn- coerce-show
  "Show is either nil, \"all\", or a number. If it's a string it needs to be converted into a keyword."
  [show]
  (cond-> show (= "all" show) keyword))

(defn get-automagic-dashboard
  "Return an automagic dashboard for entity `entity` with id `id`."
  [entity entity-id-or-query show]
  (if (= entity "transform")
    (transforms.dashboard/dashboard (->entity entity entity-id-or-query))
    (-> (->entity entity entity-id-or-query)
        (automagic-dashboards.core/automagic-analysis {:show (coerce-show show)}))))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query"
  "Return an automagic dashboard for entity `entity` with id `id`."
  [{:keys [entity entity-id-or-query]} :- [:map
                                           [:entity Entity]]
   {:keys [show]} :- [:map
                      [:show {:optional true} [:maybe [:or [:= "all"] nat-int?]]]]]
  (get-automagic-dashboard entity entity-id-or-query show))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/query_metadata"
  "Return all metadata for an automagic dashboard for entity `entity` with id `id`."
  [{:keys [entity entity-id-or-query]} :- [:map
                                           [:entity Entity]]]
  (queries/batch-fetch-dashboard-metadata
   [(get-automagic-dashboard entity entity-id-or-query nil)]))

(defn linked-entities
  "Identify the pk field of the model with `pk_ref`, and then find any fks that have that pk as a target."
  [{{field-ref :pk_ref} :model-index {rsmd :result_metadata} :model}]
  (when-let [field-id (:id (some #(when ((comp #{field-ref} :field_ref) %) %) rsmd))]
    (map
     (fn [{:keys [table_id id]}]
       {:linked-table-id table_id
        :linked-field-id id})
     (t2/select 'Field :fk_target_field_id field-id))))

(defn- add-source-model-link
  "Insert a source model link card into the sequence of passed in cards."
  [{model-name :name model-id :id} cards]
  (let [max-width (->> (map (fn [{:keys [col size_x]}] (+ col size_x)) cards)
                       (into [4])
                       (apply max))]
    (cons
     {:id                     (gensym)
      :size_x                 max-width
      :size_y                 1
      :row                    0
      :col                    0
      :visualization_settings {:virtual_card {:display  "link"
                                              :archived false},
                               :link         {:entity {:id          model-id
                                                       :name        model-name
                                                       :model       "dataset"
                                                       :display     "table"
                                                       :description nil}}}}
     cards)))

(defn- create-linked-dashboard
  "For each joinable table from `model`, create an x-ray dashboard as a tab."
  [{{indexed-entity-name :name :keys [model_pk]} :model-index-value
    {model-name :name :as model}                 :model
    :keys                                        [linked-tables]}]
  (if (seq linked-tables)
    (let [child-dashboards (map (fn [{:keys [linked-table-id linked-field-id]}]
                                  (let [table (t2/select-one :model/Table :id linked-table-id)]
                                    (automagic-dashboards.core/automagic-analysis
                                     table
                                     {:show         :all
                                      :query-filter [:= [:field linked-field-id nil] model_pk]})))
                                linked-tables)
          seed-dashboard   (-> (first child-dashboards)
                               (merge
                                {:name         (format "Here's a look at \"%s\" from \"%s\"" indexed-entity-name model-name)
                                 :description  (format "A dashboard focusing on information linked to %s" indexed-entity-name)
                                 :parameters   []
                                 :param_fields {}})
                               (dissoc :transient_name
                                       :transient_filters))]
      (if (second child-dashboards)
        (->> child-dashboards
             (map-indexed (fn [idx {tab-name :name tab-cards :dashcards}]
                            ;; id starts at 0. want our temporary ids to start at -1, -2, ...
                            (let [tab-id (dec (- idx))]
                              {:tab {:id       tab-id
                                     :name     tab-name
                                     :position idx}
                               :dash-cards
                               (map (fn [dc]
                                      (assoc dc :dashboard_tab_id tab-id))
                                    (add-source-model-link model tab-cards))})))
             (reduce (fn [dashboard {:keys [tab dash-cards]}]
                       (-> dashboard
                           (update :dashcards into dash-cards)
                           (update :tabs conj tab)))
                     (merge
                      seed-dashboard
                      {:dashcards []
                       :tabs      []})))
        (update seed-dashboard
                :dashcards (fn [cards] (add-source-model-link model cards)))))
    {:name      (format "Here's a look at \"%s\" from \"%s\"" indexed-entity-name model-name)
     :dashcards (add-source-model-link
                 model
                 [{:row                    0
                   :col                    0
                   :size_x                 18
                   :size_y                 2
                   :visualization_settings {:text                "# Unfortunately, there's not much else to show right now..."
                                            :virtual_card        {:display :text}
                                            :dashcard.background false
                                            :text.align_vertical :bottom}}])}))

(api.macros/defendpoint :get "/model_index/:model-index-id/primary_key/:pk-id"
  "Return an automagic dashboard for an entity detail specified by `entity`
  with id `id` and a primary key of `indexed-value`."
  [{:keys [model-index-id pk-id]} :- [:map
                                      [:model-index-id :int]
                                      [:pk-id          :int]]]
  (api/let-404 [model-index (t2/select-one :model/ModelIndex model-index-id)
                model (t2/select-one :model/Card (:model_id model-index))
                model-index-value (t2/select-one :model/ModelIndexValue
                                                 :model_index_id model-index-id
                                                 :model_pk pk-id)]
               ;; `->entity` does a read check on the model but this is here as well to be extra sure.
    (api/read-check :model/Card (:model_id model-index))
    (let [linked (linked-entities {:model             model
                                   :model-index       model-index
                                   :model-index-value model-index-value})]
      (create-linked-dashboard {:model             model
                                :linked-tables     linked
                                :model-index       model-index
                                :model-index-value model-index-value}))))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/rule/:prefix/:dashboard-template"
  "Return an automagic dashboard for entity `entity` with id `id` using dashboard-template `dashboard-template`."
  [{:keys [entity entity-id-or-query prefix dashboard-template]} :- [:map
                                                                     [:entity             Entity]
                                                                     [:entity-id-or-query ms/NonBlankString]
                                                                     [:prefix             Prefix]
                                                                     [:dashboard-template DashboardTemplate]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (-> (->entity entity entity-id-or-query)
      (automagic-dashboards.core/automagic-analysis {:show               (coerce-show show)
                                                     :dashboard-template ["table" prefix dashboard-template]})))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/cell/:cell-query"
  "Return an automagic dashboard analyzing cell in automagic dashboard for entity `entity` defined by query
  `cell-query`."
  [{:keys [entity entity-id-or-query cell-query]} :- [:map
                                                      [:entity             Entity]
                                                      [:entity-id-or-query ms/NonBlankString]
                                                      [:cell-query         Base64EncodedJSON]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (-> (->entity entity entity-id-or-query)
      (automagic-dashboards.core/automagic-analysis {:show       (coerce-show show)
                                                     :cell-query (decode-base64-json cell-query)})))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:dashboard-template"
  "Return an automagic dashboard analyzing cell in question with id `id` defined by query `cell-query` using
  dashboard-template `dashboard-template`."
  [{:keys [entity entity-id-or-query cell-query prefix dashboard-template]} :- [:map
                                                                                [:entity             Entity]
                                                                                [:entity-id-or-query ms/NonBlankString]
                                                                                [:prefix             Prefix]
                                                                                [:dashboard-template DashboardTemplate]
                                                                                [:cell-query         Base64EncodedJSON]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (-> (->entity entity entity-id-or-query)
      (automagic-dashboards.core/automagic-analysis {:show               (coerce-show show)
                                                     :dashboard-template ["table" prefix dashboard-template]
                                                     :cell-query         (decode-base64-json cell-query)})))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for entity `entity` with id `id` compared with entity `comparison-entity`
  with id `comparison-entity-id-or-query.`"
  [{:keys [entity entity-id-or-query comparison-entity
           comparison-entity-id-or-query]} :- [:map
                                               [:entity-id-or-query ms/NonBlankString]
                                               [:entity             Entity]
                                               [:comparison-entity  ComparisonEntity]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (let [left      (->entity entity entity-id-or-query)
        right     (->entity comparison-entity comparison-entity-id-or-query)
        dashboard (automagic-dashboards.core/automagic-analysis left {:show         (coerce-show show)
                                                                      :query-filter nil
                                                                      :comparison?  true})]
    (automagic-dashboards.comparison/comparison-dashboard dashboard left right {})))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/rule/:prefix/:dashboard-template/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for entity `entity` with id `id` using dashboard-template
  `dashboard-template`; compared with entity `comparison-entity` with id `comparison-entity-id-or-query.`."
  [{:keys [entity entity-id-or-query prefix dashboard-template
           comparison-entity comparison-entity-id-or-query]} :- [:map
                                                                 [:entity             Entity]
                                                                 [:entity-id-or-query ms/NonBlankString]
                                                                 [:prefix             Prefix]
                                                                 [:dashboard-template DashboardTemplate]
                                                                 [:comparison-entity  ComparisonEntity]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (let [left      (->entity entity entity-id-or-query)
        right     (->entity comparison-entity comparison-entity-id-or-query)
        dashboard (automagic-dashboards.core/automagic-analysis left {:show               (coerce-show show)
                                                                      :dashboard-template ["table" prefix dashboard-template]
                                                                      :query-filter       nil
                                                                      :comparison?        true})]
    (automagic-dashboards.comparison/comparison-dashboard dashboard left right {})))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/cell/:cell-query/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `id` defined by query `cell-query`; compared with entity `comparison-entity` with id
   `comparison-entity-id-or-query.`."
  [{:keys [entity entity-id-or-query cell-query
           comparison-entity comparison-entity-id-or-query]} :- [:map
                                                                 [:entity             Entity]
                                                                 [:entity-id-or-query ms/NonBlankString]
                                                                 [:cell-query         Base64EncodedJSON]
                                                                 [:comparison-entity  ComparisonEntity]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (let [left      (->entity entity entity-id-or-query)
        right     (->entity comparison-entity comparison-entity-id-or-query)
        dashboard (automagic-dashboards.core/automagic-analysis left {:show         (coerce-show show)
                                                                      :query-filter nil
                                                                      :comparison?  true})]
    (automagic-dashboards.comparison/comparison-dashboard dashboard left right {:left {:cell-query (decode-base64-json cell-query)}})))

(api.macros/defendpoint :get "/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:dashboard-template/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `id` defined by query `cell-query` using dashboard-template `dashboard-template`; compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`."
  [{:keys [entity entity-id-or-query cell-query prefix dashboard-template
           comparison-entity comparison-entity-id-or-query]} :- [:map
                                                                 [:entity             Entity]
                                                                 [:entity-id-or-query ms/NonBlankString]
                                                                 [:prefix             Prefix]
                                                                 [:dashboard-template DashboardTemplate]
                                                                 [:cell-query         Base64EncodedJSON]
                                                                 [:comparison-entity  ComparisonEntity]]
   {:keys [show]} :- [:map
                      [:show {:optional true} Show]]]
  (let [left      (->entity entity entity-id-or-query)
        right     (->entity comparison-entity comparison-entity-id-or-query)
        dashboard (automagic-dashboards.core/automagic-analysis left {:show               (coerce-show show)
                                                                      :dashboard-template ["table" prefix dashboard-template]
                                                                      :query-filter       nil})]
    (automagic-dashboards.comparison/comparison-dashboard dashboard left right {:left {:cell-query (decode-base64-json cell-query)}})))
