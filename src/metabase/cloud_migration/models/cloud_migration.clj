(ns metabase.cloud-migration.models.cloud-migration
  "A model representing a migration to cloud."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [metabase.app-db.core :as mdb]
   [metabase.cloud-migration.settings :as cloud-migration.settings]
   [metabase.cmd.copy :as copy]
   [metabase.cmd.dump-to-h2 :as dump-to-h2]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.settings.core :as setting]
   [metabase.store-api.core :as store-api]
   [metabase.task.bootstrap :as task.bootstrap]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (java.io File InputStream)
   (org.apache.commons.io.input BoundedInputStream)))

(set! *warn-on-reflection* true)

(doto :model/CloudMigration
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/CloudMigration [_model] :cloud_migration)

(t2/deftransforms :model/CloudMigration
  {:state mi/transform-keyword})

(def ^:private read-only-mode-inclusions
  (->> copy/entities (map t2/table-name) (into #{})))

(def ^:private read-only-mode-exceptions
  (update-keys {;; Migrations need to update their own state
                :model/CloudMigration :all :model/Setting :all
                ;; Users need to login, make queries, and we need need to audit them.
                :model/User :all :model/Session :all :model/LoginHistory :all
                :model/UserParameterValue :all
                :model/AuditLog :all :model/ViewLog :all
                ;; Cards need to able to update their last used at timestamp, but we don't want to create
                ;; new cards or update other fields.
                :model/Card #{:id :last_used_at :updated_at}}
               ;; These exceptions use table name instead of model name because you can actually bypass the model
               ;; and write toucan2 functions that interact with table directly.
               t2/table-name))

(defn- update-exempted?
  [table-name {:keys [changes]}]
  (or (=  (read-only-mode-exceptions table-name) :all)
      (set/subset? (read-only-mode-exceptions table-name)
                   (->> changes keys (into #{})))))

;; Block write calls to most tables in read-only mode.
(methodical/defmethod t2.pipeline/build :before [#_query-type     :toucan.statement-type/DML
                                                 #_model          :default
                                                 #_resolved-query :default]
  [_query-type model parsed-args resolved-query]
  (let [table-name (t2/table-name model)]
    (when (and (cloud-migration.settings/read-only-mode)
               (read-only-mode-inclusions table-name)
               (not (update-exempted? table-name parsed-args)))
      (throw (ex-info (tru "Metabase is in read-only-mode mode!")
                      {:status-code 403}))))
  resolved-query)

;; Helpers

(defn migration-url
  "Store API URL for migrations."
  ([]
   (str (store-api/store-api-url) "/api/v2/migration"))
  ([external-id path]
   (str (migration-url) "/" external-id path)))

(def terminal-states
  "Cloud migration states that are terminal."
  #{:done :error :cancelled})

(defn cluster?
  "EXPERIMENTAL Returns true if this metabase instance is part of a cluster.
  Works by checking how many Quartz nodes there are.
  See https://github.com/quartz-scheduler/quartz/issues/733"
  []
  (>= (t2/count (if (= (mdb/db-type) :postgres)
                  "qrtz_scheduler_state"
                  "QRTZ_SCHEDULER_STATE"))
      2))

(defn- progress-file-input-stream
  "File input stream that calls on-percent-progress with current read progress as int from 0 to 100."
  ^InputStream [^File file on-percent-progress]
  (let [input-stream             (io/input-stream file)
        length                   (.length file)
        *bytes                   (atom 0)
        add-bytes                #(on-percent-progress (int (* 100 (/ (swap! *bytes + %) length))))
        f                        (fn [ret & single?]
                                   (cond
                                     ;; -1 is end of stream
                                     (= -1 ret)  (on-percent-progress 100)
                                     single?     (add-bytes 1)
                                     (int? ret)  (add-bytes ret))
                                   ret)]
    (proxy [InputStream] []
      (read
        ([]
         (f (.read input-stream) true))
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
  (when (= 0 (t2/update! :model/CloudMigration :id id :state [:not-in terminal-states]
                         {:state state :progress progress}))
    (throw (ex-info "Cannot update migration in terminal state" {:terminal true}))))

(defn abs-progress
  "Returns absolute progress from a relative progress.
  E.g. if you're at relative 50 from 51 to 99, that's absolute 75."
  [relative-progress from to]
  (int (+ from (* (- to from) (/ relative-progress 100)))))

(defn sub-stream
  "Like subs, but for input-streams.
  Returns a sub-stream that should be used inside with-open."
  [^InputStream stream start end]
  (.skip stream start)
  (BoundedInputStream. stream (- end start)))

(defn- put-file
  "Put file, whole or from start to end, on url, reporting on-progress. Retries up to 3 times."
  [url ^File file on-progress & {:keys [headers start end]}]
  (u/auto-retry 3
    (with-open [file-stream (progress-file-input-stream file on-progress)]
      (let [[stream length] (if (and start end)
                              [(sub-stream file-stream start end) (- end start)]
                              [file-stream (.length file)])]
        (http/put url {:headers headers :length length :body stream})))))

;; ~100mb
(def ^:private part-size 100e6)

(defn- upload [{:keys [id external_id upload_url]} ^File dump-file]
  (let [;; memoize so we don't have repeats for each percent and don't go back on retries
        set-progress-memo (memoize set-progress)
        ;; 50 is set before we start the upload
        on-progress       #(set-progress-memo id :upload (abs-progress % 51 99))
        ;; the migration-dump-file setting is used for testing older dumps in the rich comment
        ;; at the end of this file
        file              (if (cloud-migration.settings/migration-dump-file)
                            (io/file (cloud-migration.settings/migration-dump-file))
                            dump-file)
        file-length       (.length file)]
    (if-not (> file-length part-size)
      ;; single put uses SSE, but multipart doesn't support it.
      (put-file upload_url file on-progress :headers {"x-amz-server-side-encryption" "aws:kms"})
      (let [;; seq of up to part-size ranges
            ;; e.g. for a 250mb file [[0 100e6] [100e6 200e6] [200e6 250e6]]
            parts
            (partition 2 1 (-> (range 0 file-length part-size)
                               vec
                               (conj file-length)))

            {:keys [multipart-upload-id multipart-urls]}
            (-> (http/put (migration-url external_id "/multipart")
                          {:form-params  {:part_count (count parts)}
                           :content-type :json})
                :body
                json/decode+kw
                ;; This endpoint, and only this one in this ns, needs a backwards and forward compatible
                ;; key conversion. This can be removed when Harbormaster does only underscores in the API,
                ;; and the keys above (multipart-upload-id multipart-urls) renamed to use underscores.
                ;; But it can also stay here indefinitely and will be correct.
                u/deep-kebab-keys)

            etags
            (->> parts
                 (map-indexed (fn [idx [start end]]
                                (let [;; look up idx in multipart-urls, which starts at :1 up to (count parts)
                                      part-id (-> idx inc str keyword)
                                      url (or (multipart-urls part-id)
                                              (throw (ex-info "Missing upload part url" {:keys (keys multipart-urls)
                                                                                         :attempted part-id})))
                                      ;; upload and get the etag from the headers
                                      resp (put-file url file on-progress :start start :end end)
                                      etag (or (get-in resp [:headers "ETag"])
                                               (throw (ex-info "No ETag header returned"
                                                               {:part-id part-id
                                                                :headers (-> resp :headers keys)})))]
                                  [part-id etag])))
                 (into {}))]
        (http/put (migration-url external_id "/multipart/complete")
                  {:form-params  {:multipart_upload_id multipart-upload-id
                                  :multipart_etags     etags}
                   :content-type :json})))))

(defn migrate!
  "Migrate this instance to Metabase Cloud.
  Will exit early if migration has been cancelled in any cluster instance.
  Should run in a separate thread since it can take a long time to complete."
  [{:keys [id external_id] :as migration} & {:keys [retry?]}]
  ;; dump-to-h2 starts behaving oddly if you try to dump repeatedly to the same file
  ;; in the same process, so use a random name.
  ;; The docker image process runs in non-root, so write to a dir it can access.
  (let [dump-file (io/file (System/getProperty "java.io.tmpdir")
                           (str "cloud_migration_dump_" (random-uuid) ".mv.db"))]
    (try
      (when retry?
        (t2/update! :model/CloudMigration :id id {:state :init}))

      (log/info "Setting read-only mode")
      (set-progress id :setup 1)
      (cloud-migration.settings/read-only-mode! true)
      (when (cluster?)
        (log/info "Cluster detected, waiting for read-only mode to propagate")
        (Thread/sleep (int (* 1.5 setting/cache-update-check-interval-ms))))
      (log/info "Stopping scheduler")
      (task/stop-scheduler!)

      (log/info "Dumping h2 backup to" (.getAbsolutePath dump-file))
      (set-progress id :dump 20)
      (dump-to-h2/dump-to-h2! (.getAbsolutePath dump-file) {:dump-plaintext? true})
      (when-not (cloud-migration.settings/read-only-mode)
        (throw (ex-info "Read-only mode disabled before h2 dump was completed, contents might not be self-consistent!"
                        {:id id})))
      (cloud-migration.settings/read-only-mode! false)

      (log/info "Uploading dump to store")
      (set-progress id :upload 50)
      (upload migration dump-file)

      (log/info "Notifying store that upload is done")
      (http/put (migration-url external_id "/uploaded"))

      ;; Need to restore the previous scheduler configuration because the database quartz is pointing at has changed
      ;; after finishing the dump to h2 migration
      (task.bootstrap/set-jdbc-backend-properties! (mdb/db-type))
      (log/info "Restarting scheduler")
      (task/start-scheduler!)

      (log/info "Migration finished")
      (set-progress id :done 100)
      (catch Exception e
        ;; See set-progress for when :terminal is set.
        (if (-> e ex-data :terminal)
          (log/info "Migration interrupted due to terminal state")
          (do
            (t2/update! :model/CloudMigration id {:state :error})
            (log/info "Migration failed")
            (throw (ex-info "Error performing migration" {} e)))))
      (finally
        (cloud-migration.settings/read-only-mode! false)
        (io/delete-file dump-file :silently)))))

(defn get-store-migration
  "Calls Store and returns {:external_id ,,, :upload_url ,,,}."
  []
  (-> (migration-url)
      (http/post {:form-params  {:local_mb_version (or (cloud-migration.settings/migration-dump-version)
                                                       (config/mb-version-info :tag))}
                  :content-type :json})
      :body
      json/decode+kw
      (select-keys [:id :upload_url])
      (set/rename-keys {:id :external_id})))

(comment
  ;; are we in read-only-mode ?
  (read-only-mode)

  ;; test settings you might want to change manually
  ;; local HM store api url
  #_(store-api/store-api-url! "http://localhost:5010")
  ;; make sure to use a version that store supports, and a dump for that version.
  #_(cloud-migration.settings/migration-dump-version! "v0.49.7")
  ;; make a new dump with any released metabase jar using the command below:
  ;;   java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar dump-to-h2 dump --dump-plaintext
  ;; you can also upload a random file you have lying around if you just want to test file splitting.
  #_(cloud-migration.settings/migration-dump-file! "/path/to/dump.mv.db")
  ;; force migration with a smaller multipart threshold (~6mb is minimum)
  #_(def ^:private part-size 6e6)

  ;; add new
  (t2/insert-returning-instance! :model/CloudMigration (get-store-migration))

  ;; get migration
  @(def mig (t2/select-one :model/CloudMigration {:order-by [[:created_at :desc]]}))

  ;; migrate
  (migrate! mig)

  ;; retry failed migration
  (migrate! mig :retry? true)

  ;; cancel all
  (t2/update! :model/CloudMigration {:state [:not-in terminal-states]} {:state :cancelled}))
