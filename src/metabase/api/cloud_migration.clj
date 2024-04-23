(ns metabase.api.cloud-migration
  "/api/cloud-migration endpoints.
  Only one migration should be happening at any given time.
  But if something weird happens with concurrency, /cancel will
  cancel all of them. "
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [compojure.core :refer [GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.config :as config]
   [metabase.models.cloud-migration :refer [CloudMigration]]
   [metabase.models.setting :refer [defsetting]]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   [java.io File InputStream]))

(set! *warn-on-reflection* true)

(defsetting metabase-store-migration-url
  (deferred-tru "Store URL for migrations. Internal test use only.")
  :visibility :internal
  :default    "https://store-api.metabase.com/api/v2/migration"
  :doc        false
  :export?    false)

;; Read-Only mode

(defsetting read-only-mode
  (deferred-tru
    (str "Boolean indicating whether a Metabase's is in read-only mode with regards to its app db. "
         "Will take up to 1m to propagate to other Metabase instances in a cluster."
         "Audit tables are excluded from read-only-mode mode."))
  :type       :boolean
  :visibility :admin
  :default    false
  :doc        false
  :export?    false)

(def ^:private read-only-mode-exceptions
  #{;; Migrations need to update their own state
    (t2/table-name :model/CloudMigration)
    (t2/table-name :model/Setting)

    ;; Users need to login, make queries, and we need need to audit them.
    (t2/table-name :model/Session)
    (t2/table-name :model/LoginHistory)
    (t2/table-name :model/AuditLog)
    (t2/table-name :model/QueryExecution)
    (t2/table-name :model/ViewLog)})

(def ^:private ^:dynamic
  *ignore-read-only-mode*
  "Used during dump-to-h2, since rotate-encryption-key! over the dump will hit read-only-mode."
  nil)

;; Block write calls to most tables in read-only mode.
(methodical/defmethod t2.pipeline/build :before [#_query-type     :toucan.statement-type/DML
                                                 #_model          :default
                                                 #_resolved-query :default]
  [_query-type model _parsed-args resolved-query]
  (when (and (read-only-mode)
             (not (read-only-mode-exceptions (t2/table-name model)))
             (not *ignore-read-only-mode*))
    (throw (ex-info (tru "Metabase is in read-only-mode mode!")
                    {:status-code 403})))
  resolved-query)


;; Helpers

(def ^:private terminal-states
  #{:done :error :cancelled})

(defn- cluster?
  []
  (>= (t2/count 'QRTZ_SCHEDULER_STATE) 2))

(defn- progress-file-input-stream
  "File input stream that calls on-percent-progress with current read progress as int from 0 to 100.
  Does not call on-percent-progress for the same value twice. "
  [^File file on-percent-progress]
  (let [input-stream             (io/input-stream file)
        length                   (.length file)
        *bytes                   (atom 0)
        on-percent-progress-memo (memoize on-percent-progress) ;; memoize so we don't repeat calls
        add-bytes                #(on-percent-progress-memo (int (* 100 (/ (swap! *bytes + %) length))))
        f                        (fn [ret]
                                   (cond
                                     ;; -1 is end of stream
                                     (= -1 ret)  (on-percent-progress-memo 100)
                                     (char? ret) (add-bytes 1)
                                     (int? ret)  (add-bytes ret))
                                   ret)]
    (proxy [InputStream] []
      (read
       ([]
        (f (.read input-stream)))
        ([^bytes b]
         (f (.read input-stream b)))
        ([^bytes b off len]
         (f (.read input-stream b off len))))
      (close [] (.close input-stream)))))

(defn- set-progress
  "Attempt to set id to state and progress.
  Throws if the migration has already reached a terminal state (e.g. cancelled).
  This is the main cluster coordination mechanism for migrations, since any instance
  can cancel the migration, not just the one that initiated it."
  [id state progress]
  (when (= 0 (t2/update! CloudMigration :id id :state [:not-in terminal-states]
                         {:state state :progress progress}))
    (throw (ex-info "Cannot update migration in terminal state" {:terminal true}))))

(defn- migrate!
  "Migrate this instance to Metabase Cloud.
  Will exit early if migration has been cancelled in any cluster instance."
  [{:keys [id upload_url]} & {:keys [retry?]}]
  ;; dump-to-h2 starts behaving oddly if you try to dump repeatly to the same file
  ;; in the same process.
  (let [dump-file (io/file (str "cloud_migration_dump_" (random-uuid) ".mv.db"))
        ;; Note: this will still set progress up to twice for each percent
        ;; because e.g. 70 and 71 upload percent both map to 50+35 migration percent.
        on-upload-progress #(set-progress id :upload (int (+ 50 (* 50 (/ % 100)))))]
    (try
      (when retry?
        (t2/update! CloudMigration :id id {:state :init}))

      (log/info "Setting read-only mode")
      (set-progress id :setup 1)
      (read-only-mode! true)
      (when (cluster?)
        (log/info "Cluster detected, waiting for read-only mode to propagate")
        (Thread/sleep (int (* 1.5 setting.cache/cache-update-check-interval-ms))))

      (log/info "Dumping h2 backup to" (.getAbsolutePath dump-file))
      (set-progress id :dump 20)
      (binding [*ignore-read-only-mode* true]
        (dump-to-h2/dump-to-h2! (.getAbsolutePath dump-file) {:dump-plaintext? true}))
      (read-only-mode! false)

      (log/info "Uploading dump to store")
      (set-progress id :upload 50)
      (http/put upload_url {:headers {"x-amz-server-side-encryption" "aws:kms"}
                            :length  (.length dump-file)
                            :body    (progress-file-input-stream
                                      dump-file on-upload-progress)})

      (log/info "Notifying store that upload is done")
      (http/put (str (metabase-store-migration-url) "/" id "/uploaded"))

      (log/info "Migration finished")
      (set-progress id :done 100)
      (catch Exception e
        ;; See set-progress for when :terminal is set.
        (if (-> e ex-data :terminal)
          (log/info "Migration interruped due to terminal state")
          (do
            (t2/update! CloudMigration id {:state :error})
            (log/info "Migration failed")
            (throw (ex-info "Error performing migration" {:error e})))))
      (finally
        (read-only-mode! false)
        (io/delete-file dump-file :silently)))))

(defn- get-store-migration
  "Calls Store and returns {:external_id ,,, :upload_url ,,,}."
  [from-version]
  (-> (metabase-store-migration-url)
      (http/post {:form-params  {:local_mb_version from-version}
                  :content-type :json})
      :body
      (json/parse-string keyword)
      (select-keys [:id :upload_url])
      (set/rename-keys {:id :external_id})))


;; Endpoints

(api/defendpoint POST "/"
  "Initiate a new cloud migration."
  [_]
  (api/check-superuser)
  (if (t2/select-one CloudMigration :state [:not-in terminal-states])
    {:status 409 :body "There's an ongoing migration already."}
    (try
      (let [cloud-migration (->> (config/mb-version-info :tag)
                                 get-store-migration
                                 (t2/insert-returning-instance! CloudMigration))]
        (future (migrate! cloud-migration))
        cloud-migration)
      (catch Exception e
        (condp = (-> e ex-data :status)
          404 {:status 404 :body "Could not establish a connection to Metabase Cloud."}
          400 {:status 400 :body "Cannot migrate this Metabase version."}
          {:status 500})))))

(api/defendpoint GET "/"
  "Get the latest cloud migration, if any."
  [_]
  (api/check-superuser)
  (t2/select-one CloudMigration {:order-by [[:created_at :desc]]}))

(api/defendpoint PUT "/cancel"
  "Cancel any ongoing cloud migrations, if any."
  [_]
  (api/check-superuser)
  (read-only-mode! false)
  (t2/update! CloudMigration {:state [:not-in terminal-states]} {:state :cancelled}))

(api/define-routes)

(comment
  ;; are we in read-only-mode ?
  (read-only-mode)

  ;; use staging for testing.
  (metabase-store-migration-url! "https://store-api.staging.metabase.com/api/v2/migration")

  ;; make sure to use a version that store supports.
  (get-store-migration "v0.45.0")

  ;; add new
  (t2/insert-returning-instance! CloudMigration (get-store-migration "v0.45.0"))

  ;; get latest
  @(def latest (t2/select-one CloudMigration {:order-by [[:created_at :desc]]}))

  ;; migrate latest
  (migrate! latest)

  ;; retry failed migration
  (migrate! latest :retry? true)

  ;; cancel all
  (t2/update! CloudMigration {:state [:not-in terminal-states]} {:state :cancelled}))
