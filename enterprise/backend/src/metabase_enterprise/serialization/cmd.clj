(ns metabase-enterprise.serialization.cmd
  (:refer-clojure :exclude [load])
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase.analytics.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.models.serialization :as serdes]
   [metabase.plugins.core :as plugins]
   [metabase.premium-features.core :as premium-features]
   [metabase.setup.core :as setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- check-premium-token! []
  (premium-features/assert-has-feature :serialization (trs "Serialization")))

(mu/defn v2-load-internal!
  "SerDes v2 load entry point for internal users.

  `opts` are passed to [[v2.load/load-metabase]]."
  [path :- :string
   opts :- [:map
            [:backfill? {:optional true} [:maybe :boolean]]
            [:continue-on-error {:optional true} [:maybe :boolean]]
            [:reindex? {:optional true} [:maybe :boolean]]]
   ;; Deliberately separate from the opts so it can't be set from the CLI.
   & {:keys [token-check?
             require-initialized-db?]
      :or   {token-check? true
             require-initialized-db? true}}]
  (plugins/load-plugins!)
  (mdb/setup-db! :create-sample-content? false)
  (when (and require-initialized-db? (not (setup/has-user-setup)))
    (throw (ex-info "You cannot `import` into an empty database. Please set up Metabase normally, then retry." {})))
  (when token-check?
    (check-premium-token!))
  ;; TODO This should be restored, but there's no manifest or other meta file written by v2 dumps.
  ;;(when-not (load/compatible? path)
  ;;  (log/warn "Dump was produced using a different version of Metabase. Things may break!"))
  (log/infof "Loading serialized Metabase files from %s" path)
  (u/prog1 (serdes/with-cache
             (v2.load/load-metabase! (v2.ingest/ingest-yaml path) opts))
    (events/publish-event! :event/serdes-load {})))

(mu/defn v2-load!
  "SerDes v2 load entry point.

   opts are passed to load-metabase"
  [path :- :string
   opts :- [:map
            [:backfill? {:optional true} [:maybe :boolean]]
            [:continue-on-error {:optional true} [:maybe :boolean]]
            [:full-stacktrace {:optional true} [:maybe :boolean]]]]
  (let [timer    (u/start-timer)
        err      (atom nil)
        report   (try
                   (v2-load-internal! path opts :token-check? true)
                   (catch ExceptionInfo e
                     (reset! err e))
                   (catch Exception e
                     (reset! err e)))
        imported (into (sorted-set) (map (comp :model last)) (:seen report))]
    (analytics/track-event! :snowplow/serialization
                            {:event         :serialization
                             :direction     "import"
                             :source        "cli"
                             :duration_ms   (int (u/since-ms timer))
                             :models        (str/join "," imported)
                             :count         (if (contains? imported "Setting")
                                              (inc (count (remove #(= "Setting" (:model (first %))) (:seen report))))
                                              (count (:seen report)))
                             :error_count   (count (:errors report))
                             :success       (nil? @err)
                             :error_message (when @err
                                              (u/strip-error @err nil))})
    (when @err
      (if (:full-stacktrace opts)
        (log/error @err "Error during deserialization")
        (log/error (u/strip-error @err "Error during deserialization")))
      (throw (ex-info (ex-message @err) {:cmd/exit true})))
    imported))

(defn v2-dump!
  "Exports Metabase app data to directory at path"
  [path {:keys [collection-ids] :as opts}]
  (log/infof "Exporting Metabase to %s" path)
  (mdb/setup-db! :create-sample-content? false)
  (check-premium-token!)
  (t2/select :model/User) ;; TODO -- why??? [editor's note: this comment originally from Cam]
  (let [f (io/file path)]
    (.mkdirs f)
    (when-not (.canWrite f)
      (throw (ex-info (format "Destination path is not writeable: %s" path) {:filename path}))))
  (let [start  (System/nanoTime)
        err    (atom nil)
        opts   (cond-> opts
                 (seq collection-ids)
                 (assoc :targets (v2.extract/make-targets-of-type "Collection" collection-ids)))
        report (try
                 (serdes/with-cache
                   (-> (v2.extract/extract opts)
                       (v2.storage/store! path)))
                 ;; we could publish :event/serdes-dump to go with :event/serdes-load above, but
                 ;; nothing would listen to it currently
                 (catch Exception e
                   (reset! err e)))]
    (analytics/track-event! :snowplow/serialization
                            {:event           :serialization
                             :direction       "export"
                             :source          "cli"
                             :duration_ms     (int (/ (- (System/nanoTime) start) 1e6))
                             :count           (count (:seen report))
                             :error_count     (count (:errors report))
                             :collection      (str/join "," collection-ids)
                             :all_collections (and (empty? collection-ids)
                                                   (not (:no-collections opts)))
                             :data_model      (not (:no-data-model opts))
                             :settings        (not (:no-settings opts))
                             :field_values    (boolean (:include-field-values opts))
                             :secrets         (boolean (:include-database-secrets opts))
                             :success         (nil? @err)
                             :error_message   (when @err
                                                (u/strip-error @err nil))})
    (when @err
      (if (:full-stacktrace opts)
        (log/error @err "Error during serialization export")
        (log/error (u/strip-error @err "Error during serialization export")))
      (throw (ex-info (ex-message @err) {:cmd/exit true})))
    (log/info (format "Export to '%s' complete!" path) (u/emoji "🚛💨 📦"))
    report))

(defn seed-entity-ids!
  "Add entity IDs for instances of serializable models that don't already have them.

  Returns truthy if all entity IDs were added successfully, or falsey if any errors were encountered."
  []
  (v2.entity-ids/seed-entity-ids!))

(defn drop-entity-ids!
  "Drop entity IDs for all instances of serializable models.

  This is needed for some cases of migrating from v1 to v2 serdes. v1 doesn't dump `entity_id`, so they may have been
  randomly generated independently in both instances. Then when v2 serdes is used to export and import, the randomly
  generated IDs don't match and the entities get duplicated. Dropping `entity_id` from both instances first will force
  them to be regenerated based on the hashes, so they should match up if the receiving instance is a copy of the sender.

  Returns truthy if all entity IDs have been dropped, or falsey if any errors were encountered."
  []
  (v2.entity-ids/drop-entity-ids!))
