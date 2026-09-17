(ns metabase.documents.db
  "Application database queries for the documents module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the documents-only section at the bottom
  of this namespace."
  (:require
   [java-time.api :as t]
   [malli.util :as mut]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Documents a query applies to. Keys mirror the columns of `document`: a scalar matches that value and a set
  matches any of its values. A nullable column also takes a `<column>_set` key, matching the rows where that column
  is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id              {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:archived        {:optional true} :boolean]
   [:public_uuid_set {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::documents.schema/document.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::documents.schema/document.column
                                              [:tuple ::documents.schema/document.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private set-columns
  "Maps each `<column>_set` filter key to the column whose nullness it tests."
  {:public_uuid_set :public_uuid})

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Document columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts {:set-columns set-columns}))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns set-columns}))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-documents :- [:sequential ::documents.schema/document.partial]
  "The Documents matching `opts`."
  ([]
   (select-documents nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-document :- [:maybe ::documents.schema/document.partial]
  "The first Document matching `opts`, or nil."
  ([]
   (select-one-document nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-document! :- ms/PositiveInt
  "Insert the Document `row` and return its id."
  [row :- ::documents.schema/document.create]
  (t2/insert-returning-pk! :model/Document row))

(mu/defn update-documents! :- :int
  "Apply `changes` to every Document matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::documents.schema/document.update]
  (apply t2/update! :model/Document (conj (->kv-args opts) changes)))

(mu/defn delete-documents! :- :int
  "Delete every Document matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/Document (->args opts)))

;;; ------------------------------------ Queries used only by the documents module ------------------------------------

(mu/defn select-visible-unarchived-documents
  "The unarchived Documents not attached to an Exploration, in a Collection visible to the current user."
  []
  (t2/select :model/Document {:where [:and
                                      (collection/visible-collection-filter-clause)
                                      [:= :archived false]
                                      [:= :exploration_id nil]]}))

(mu/defn reducible-select-documents-for-serdes
  "A reducible of the Documents to export via serdes: those whose `:collection_id` is in `collection-set` (nil in the
  set counts as the root collection; an empty or nil set means every collection), further restricted to the rows
  whose `filter-column` is one of `filter-ids` when `filter-column` is given, and ordered ascending by
  `order-columns` (unordered when empty).

  Exploration documents are always excluded: such a document is not first-class content, it is reachable only through
  its owning exploration, its body embeds values computed under its creator's data-access lens, and
  `:exploration_id` is in the serdes spec's `:skip` list — so an exported document would import as an ordinary,
  ungated document detached from any exploration."
  [collection-set :- [:maybe [:or [:set [:maybe ::lib.schema.id/collection]] [:sequential [:maybe ::lib.schema.id/collection]]]]
   filter-column  :- [:maybe :keyword]
   filter-ids     :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns  :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select :model/Document
                       (cond-> {:where [:and
                                        (when (seq collection-set)
                                          [:or
                                           [:in :collection_id collection-set]
                                           (when (some nil? collection-set)
                                             [:= :collection_id nil])])
                                        (when filter-column
                                          [:in filter-column filter-ids])
                                        [:= :exploration_id nil]]}
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card card-id))

(mu/defn cards-not-in-document
  "The Cards with `card-ids` that do not belong to the Document with `document-id`."
  [card-ids    :- [:sequential ::lib.schema.id/card]
   document-id :- ms/PositiveInt]
  (t2/select :model/Card {:where [:and [:in :id card-ids]
                                  [:or [:<> :document_id document-id]
                                   [:= :document_id nil]]]}))

(mu/defn cards-for-document
  "The Cards of the Document with `document-id`."
  [document-id :- ms/PositiveInt]
  (t2/select :model/Card :document_id document-id))

(mu/defn unarchived-cards-for-documents
  "The unarchived Cards of the Documents with `document-ids`."
  [document-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Card :document_id [:in document-ids] :archived false))

(mu/defn unarchived-card-in-document-exists?
  "Whether the unarchived Card with `card-id` belongs to the Document with `document-id`."
  [card-id     :- ::lib.schema.id/card
   document-id :- ms/PositiveInt]
  (t2/exists? :model/Card :id card-id :document_id document-id :archived false))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- (mut/select-keys ::queries.schema/card.update [:archived :archived_directly])]
  (t2/update! :model/Card card-id changes))

(mu/defn update-cards-for-document!
  "Apply `changes` to the Cards of the Document with `document-id`, returning the number updated."
  [document-id :- ms/PositiveInt
   changes     :- (mut/select-keys ::queries.schema/card.update [:collection_id :archived :archived_directly])]
  (t2/update! :model/Card :document_id document-id changes))

(mu/defn unarchived-collection-exists?
  "Whether an unarchived Collection with `collection-id` exists."
  [collection-id :- ::lib.schema.id/collection]
  (collections.db/collection-exists? {:id collection-id, :archived false}))

(mu/defn user-columns
  "The id, email, and name of the Users with `user-ids`."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn table
  "The Table with `id`, or nil."
  [id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn dashboard
  "The Dashboard with `id`, or nil."
  [id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id id))

(mu/defn update-documents-last-viewed-at!
  "Move `last_viewed_at` of each Document in `document-id->timestamp` forward to its timestamp, without touching
  `updated_at`, returning the number updated (as a one-element sequence -- `t2/query` on an UPDATE, unlike
  `t2/update!`, does not unwrap it)."
  [document-id->timestamp :- [:map-of ms/PositiveInt ms/TemporalInstant]]
  ;; A raw update rather than `t2/update!` so Toucan 2 model hooks don't fire: the :model/Document after-update
  ;; publishes :event/document-update and syncs card collections, side effects that must not re-run on retry.
  (t2/query {:update (t2/table-name :model/Document)
             :set    {:last_viewed_at (into [:case]
                                            (mapcat (fn [[id timestamp]]
                                                      [[:= :id id] [:greatest [:coalesce :last_viewed_at (t/offset-date-time 0)] timestamp]])
                                                    document-id->timestamp))
                      :updated_at :updated_at}
             :where  [:in :id (keys document-id->timestamp)]}))
