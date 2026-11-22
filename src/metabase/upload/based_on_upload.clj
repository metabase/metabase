(ns metabase.upload.based-on-upload
  "Which models are based on an uploaded table the user can upload to, and what the user may upload to a table. This
  namespace does not require `metabase.queries.core`, which `metabase.upload.impl` does, so that the queries module can
  list the models that are based on an upload."
  (:require
   [clojure.string :as str]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.upload.db :as upload.db]
   [metabase.upload.settings :as upload.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- uploads-enabled? []
  (some? (:db_id (upload.settings/uploads-settings))))

(defn can-use-uploads-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database for the subset of reasons common to all uploads
  entry points. Returns nil otherwise."
  [db]
  (let [driver (driver.u/database->driver db)]
    (cond
      (not (uploads-enabled?))
      (ex-info (tru "Uploads are not enabled.")
               {:status-code 422})

      (perms/sandboxed-user?)
      (ex-info (tru "Uploads are not permitted for sandboxed users.")
               {:status-code 403})

      (not (driver.u/supports? driver :uploads db))
      (ex-info (tru "Uploads are not supported on {0} databases." (str/capitalize (name driver)))
               {:status-code 422}))))

(defn- mbql? [model]
  (= "query" (name (:query_type model "query"))))

(defn- no-joins?
  "Returns true if `query` has no explicit joins in it, otherwise false."
  [query]
  ;; TODO while it's unlikely (at the time of writing this) that uploaded tables have FKs, we should probably check
  ;;      for implicit joins as well.
  (->> (range (lib/stage-count query))
       (not-any? (fn [stage-idx]
                   (lib/joins query stage-idx)))))

(defn only-table-id
  "For models that depend on only one table, return its id, otherwise return nil. Doesn't support native queries."
  [{query :dataset_query, :as model}]
  ; dataset_query can be empty in tests
  (when-let [query (not-empty query)]
    (when (and (mbql? model) (no-joins? query))
      (lib/primary-source-table-id query))))

(defn can-update-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database and schema. Returns nil otherwise."
  [db table]
  (or (can-use-uploads-error db)
      (cond
        (not (:is_upload table))
        (ex-info (tru "The table must be an uploaded table.")
                 {:status-code 422})

        (not (mi/can-query? (t2/hydrate table :can_query)))
        (ex-info (tru "You don''t have permissions to do that.")
                 {:status-code 403}))))

(defn- can-upload-to-table?
  "Returns true if the user can upload to the given database and table, and false otherwise."
  [db table]
  (nil? (can-update-error db table)))

(defn- uploadable-table-ids
  "Returns the subset of table ids where the user can upload to the table."
  [table-ids]
  (set (when (seq table-ids)
         (->> (t2/hydrate (upload.db/tables table-ids) :db :can_query)
              (filter #(can-upload-to-table? (:db %) %))
              (map :id)))))

(mr/def ::based-on-upload-input
  "The columns of a model Card that decide its `:based_on_upload`."
  [:map {:closed true}
   [:id            ms/PositiveInt]
   ;; query_type and dataset_query can be null in tests, so we make them nullable here.
   ;; they should never be null in production
   [:dataset_query [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]
   [:query_type    [:maybe [:or :string :keyword]]]
   [:table_id      [:maybe ms/PositiveInt]]
   ;; is_upload can be provided for an optional optimization
   [:is_upload {:optional true} [:maybe :boolean]]])

(def based-on-upload-input-keys
  "The keys of a model that [[models-based-on-upload]] reads."
  [:id :dataset_query :query_type :table_id :is_upload])

(mu/defn models-based-on-upload
  "The `:based_on_upload` table id of each of `models` that has one, keyed by model id. Assumes each item of `models`
  represents a model."
  [models :- [:sequential ::based-on-upload-input]]
  (let [table-ids             (->> models
                                   ;; as an optimization when listing collection items (GET /api/collection/items),
                                   ;; we might already know that the table is not an upload if is_upload=false. We
                                   ;; can skip making more queries if so
                                   (remove #(false? (:is_upload %)))
                                   (keep :table_id)
                                   set)
        has-uploadable-table? (comp (uploadable-table-ids table-ids) :table_id)]
    (into {}
          (keep (fn [model]
                  ;; NOTE: It is important that this logic is kept in sync with `invalidate-cached-models!`
                  ;; If not, it will mean that the user could modify the table via a given model's page without seeing it update.
                  (when-let [table-id (when (has-uploadable-table? model)
                                        (only-table-id model))]
                    [(:id model) table-id])))
          models)))
