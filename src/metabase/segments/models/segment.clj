(ns metabase.segments.models.segment
  "A Segment is a saved MBQL 'macro', expanding to a `:filter` subclause. It is passed in as a `:filter` subclause but is
  replaced by the `expand-macros` middleware with the appropriate clauses."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.audit-app.core :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.replacement.spec :as replacement]
   [metabase.revisions.core :as revisions]
   [metabase.search.core :as search]
   [metabase.segments.audit :as segments.audit]
   [metabase.segments.db :as segments.db]
   [metabase.segments.dependencies :as segments.dependencies]
   [metabase.segments.replacement :as segments.replacement]
   [metabase.segments.schema :as segments.schema]
   [metabase.segments.serialization :as segments.serialization]
   [metabase.segments.xrays :as segments.xrays]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.spec :as xrays]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Segment [_model] :segment)
(methodical/defmethod t2/model-for-automagic-hydration [:default :segment] [_original-model _k] :model/Segment)

(t2/deftransforms :model/Segment
  {:definition lib-be/transform-query})

(doto :model/Segment
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defn- definition-table-id
  "The id of the Table `definition`, a full query, is built on, read without the app DB."
  [definition]
  (:source-table (lib-be/query-first-stage definition)))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/Segment
  [{:keys [definition] :as segment}]
  (assoc segment :table_id (definition-table-id definition)))

(t2/define-before-update :model/Segment
  [{:keys [definition] :as segment}]
  (let [changes (t2/changes segment)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a Segment.") {:status-code 400})))
    (when (and (contains? changes :table_id) (not (contains? changes :definition)))
      (throw (ex-info (tru "The table of a Segment follows its definition; change the definition instead.") {:status-code 400})))
    (cond-> segment
      (contains? changes :definition) (assoc :table_id (definition-table-id definition)))))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Segment :can_read]
  "Whether the current user can read each of `segments`, which they can when they read its Table, the Tables answered
  together."
  [_model _k segments]
  (collection/hydrate-table-content-can-read segments))

(methodical/defmethod t2/batched-hydrate [:model/Segment :can_write]
  "Whether the current user can write each of `segments`, which they can when they write Segments of its Table."
  [_model _k segments]
  (collection/hydrate-table-content-can-write segments))

(defn- definition-writable?
  "Whether the current user can write Segments of the Table `definition` is built on."
  [definition]
  (let [table (some-> definition not-empty definition-table-id segments.db/table)]
    (boolean (and table (seq (collection/writable-table-ids [table]))))))

(defmethod mi/can-create? :model/Segment
  [_model {:keys [definition]}]
  (definition-writable? definition))

(defenterprise sandboxes-allow-segment-update?
  "Whether sandboxing lets the current user apply `changes` to `segment`, which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_segment _changes]
  true)

(defmethod mi/can-update? :model/Segment
  [segment changes]
  (and (mi/can-write? segment)
       (or (not (contains? changes :definition))
           (definition-writable? (:definition changes)))
       (sandboxes-allow-segment-update? segment changes)))

(defenterprise delete-segment-tests-for-segments!
  "Delete the tests of the segments with `segment-ids`. No-op in OSS."
  metabase-enterprise.data-testing.models.segment-test
  [_segment-ids]
  nil)

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mu/defn- definition-description :- [:maybe ::lib.schema.common/non-blank-string]
  "Calculate a nice description of a Segment's definition."
  [{:keys [definition], :as _segment} :- (ms/InstanceOf :model/Segment)]
  (when (some? definition)
    (try
      (lib/describe-top-level-key definition :filters)
      (catch Throwable e
        (log/errorf "Error calculating Segment description: %s" (ex-message e))
        nil))))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/Segment :definition_description]
  [_model _key segments]
  (for [segment segments]
    (assoc segment :definition_description (definition-description segment))))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-definitions-of-new-segments
  "Throws unless every Segment that the definition of each of the new Segment `rows` refers to exists."
  [rows]
  (run! #(lib/check-segment-overwrite nil (lib-be/normalize-query (:definition %))) rows))

(mu/defn create-segments! :- [:sequential (ms/InstanceOf :model/Segment)]
  "Insert the Segment `rows` and return the inserted instances, in one transaction, publishing their create event, a
  definition that refers to a Segment that does not exist throwing."
  [rows :- [:sequential ::segments.schema/segment.create]]
  (app-db/create-batched! :model/Segment rows
                          {:before-create check-definitions-of-new-segments
                           :after-create  #(events/publish-event! :event/segment-create (events/create-event %))}))

(defn- check-changed-definition
  "Throws when the new definition in `changes` of one of the Segments with `ids`, `stored` as they are, differs from the
  stored one and refers to the Segment itself or to a Segment that makes a cycle."
  [ids changes stored]
  (when (contains? changes :definition)
    (let [definition (lib-be/normalize-query (:definition changes))]
      (doseq [id    ids
              :when (not= definition (some-> (get stored id) :definition lib-be/normalize-query))]
        (lib/check-segment-overwrite id definition)))))

(defn- check-segment-updates
  "Throw a 400 unless every one of `updates`, over the Segments `id->stored`, satisfies these rules:

  - a new definition does not refer to the Segment itself or make a cycle of Segments"
  [updates id->stored]
  (doseq [{:keys [id] :as row} updates]
    (check-changed-definition [id] (dissoc row :id) id->stored)))

(defn- assoc-segment-tables
  "`updates` of Segments, each with the table its new definition gives, computed once for each distinct definition."
  [updates _id->stored]
  (let [table-ids (into {} (map (fn [definition] [definition (definition-table-id definition)]))
                        (distinct (keep :definition updates)))]
    (mapv #(cond-> % (contains? % :definition) (assoc :table_id (get table-ids (:definition %)))) updates)))

(mu/defn update-segments! :- :nil
  "Apply `updates`, each the `:id` of a Segment with the columns to give it, in one transaction, publishing their update
  event with the `:writer` and `:context` of `opts`."
  ([updates :- [:sequential ::segments.schema/segment.update]]
   (update-segments! updates nil))
  ([updates :- [:sequential ::segments.schema/segment.update]
    opts    :- :metabase.events.schema/write-opts]
   (app-db/update-batched! :model/Segment updates
                           {:before-update (fn [updates id->stored]
                                             (check-segment-updates updates id->stored)
                                             (assoc-segment-tables updates id->stored))
                            :reread?       true
                            :after-update  (fn [updates id->stored id->updated]
                                             (when (seq updates)
                                               (events/publish-event! :event/segment-update
                                                                      (events/update-event id->stored updates
                                                                                           (assoc opts :objects id->updated)))))})))

(defn- delete-tests-and-publish!
  "Delete the tests of the Segments `rows`, with the data testing feature, then publish their delete event."
  [rows]
  (delete-segment-tests-for-segments! (mapv :id rows))
  (events/publish-event! :event/segment-delete (events/delete-event rows)))

(mu/defn delete-segments! :- :nil
  "Delete the Segments with `ids` and, with the data testing feature, their tests, in one transaction, publishing their
  delete event right before the first statement."
  [ids :- [:sequential ::lib.schema.id/segment]]
  (app-db/delete-batched! :model/Segment ids
                          {:before-delete delete-tests-and-publish!}))

(def ^:private revision-columns
  "The columns of a Segment that its Revisions track and a revert restores."
  [:name :description :definition :archived :table_id :caveats :points_of_interest :show_in_getting_started])

(defn- revert-segment!
  "Return the Segment with `id` to the `snapshot` of a Segment that a Revision recorded."
  [id _user-id snapshot]
  (update-segments! [(assoc snapshot :id id)] {:writer :revert}))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Segment [_model]
  {:skip? false})

(defmethod serialization/spec :model/Segment [_]
  {:schema              ::segments.schema/external-segment
   :copy                [:name :points_of_interest :archived :caveats :description :entity_id :show_in_getting_started]
   :skip                [:table_id]
   :transform           {:creator_id serialization/user-transform
                         :definition serialization/mbql-transform}
   :defaults            {:archived false :show_in_getting_started false}
   :import-dependencies segments.serialization/import-dependencies
   :storage-paths       segments.serialization/storage-paths
   :insert!             create-segments!
   :update!             #(do (update-segments! % {:writer :import}) %)
   :delete!             delete-segments!})

(defmethod remote-sync/spec :model/Segment
  [_model]
  {:synced-items         segments.db/synced-segment-items
   :synced-filter-clause segments.db/synced-segments-clause})

(defmethod revisions/spec :model/Segment [_model]
  {:track        revision-columns
   :skip         [:entity_id :creator_id]
   :schema       ::segments.schema/segment.revision
   :same?        {:definition revisions/same-definition?}
   :revert!      revert-segment!
   :diff-columns [:name :description :definition]})

(defmethod audit/spec :model/Segment [_model]
  {:track          [:name :description :table_id]
   :track-redacted [:archived :caveats :creator_id :definition :points_of_interest :show_in_getting_started]
   :skip           [:entity_id]
   :hydrate        segments.audit/hydrate
   :details        segments.audit/details})

(defmethod search/spec :model/Segment
  [_model]
  {"segment"
   {:attrs {:archived true
            :collection-id false
            :creator-id false
            :database-id :table.db_id
            ;; should probably change this, but will break legacy search tests
            :created-at false
            :updated-at true
            ;; A segment on a Library table inherits the table's library ranking boost and curated status.
            :root-collection-type {:fn collection/table-root-collection-type}}
    :search-terms [:name :description]
    :render-terms {:table-id                  :table_id
                   :table_description         :table.description
                   :table_name                :table.name
                   :table_display_name        :table.display_name
                   :table_schema              :table.schema
                   ;; The parent table's collection, for [[collection/table-root-collection-type]].
                   ;; Listing these terms also reindexes a segment when its table moves into or out of the Library.
                   :table-collection-id       :table.collection_id
                   :table-is-published        :table.is_published
                   :table-collection-location :collection.location
                   :table-collection-type     :collection.type}
    ;; Only published tables count as library content, matching the table spec's own collection join.
    :joins {:table      [:model/Table [:= :table.id :this.table_id]]
            :collection [:model/Collection
                         [:and
                          [:= :table.is_published true]
                          [:= :collection.id :table.collection_id]]]}}})

(defmethod dependencies/spec :model/Segment [_model]
  {:type  :segment
   :items segments.db/dependency-segment-items

   :dependencies segments.dependencies/dependencies
   :analysis     segments.dependencies/analysis

   :dependency-columns #{:definition :table_id}
   :analysis-columns   #{:definition :table_id}
   :output-columns     #{:definition :table_id}})

(defmethod replacement/spec :model/Segment [_model]
  {:upgrade-field-refs segments.replacement/upgrade-field-refs
   :swap-source        segments.replacement/swap-source
   :update!            #(do (update-segments! % {:writer :replacement}) %)})

(defmethod eid-translation/spec :model/Segment [_model]
  {:names [:segment]})

(defmethod xrays/spec :model/Segment [_model]
  {:related    segments.xrays/related
   :definition segments.xrays/definition})
