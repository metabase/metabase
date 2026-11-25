(ns metabase-enterprise.serialization.cmd
  (:require
   [clojure.java.io :as io]
   [clojure.stacktrace :as stacktrace]
   [clojure.string :as str]
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase-enterprise.serialization.v2.extract :as v2.extract]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase-enterprise.serialization.v2.load :as v2.load]
   [metabase-enterprise.serialization.v2.storage :as v2.storage]
   [metabase-enterprise.serialization.v2.storage.files :as v2.storage.files]
   [metabase.analytics.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.plugins.core :as plugins]
   [metabase.premium-features.core :as premium-features]
   [metabase.serialization.core :as serialization]
   [metabase.setup.core :as setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- print-error!
  "Print why the command failed to stderr, where the log config cannot turn it off."
  [e message full-stacktrace?]
  (binding [*out* *err*]
    (println (if full-stacktrace?
               (str message "\n" (with-out-str (stacktrace/print-cause-trace e)))
               (u/strip-error e message)))
    (flush)))

(defn- print-result!
  "Print what the command did, and to stderr how many entities it could not do it to (`--continue-on-error`)."
  [message errors]
  (println message)
  (when (seq errors)
    (binding [*out* *err*]
      (println (format "%d entities failed" (count errors)))
      (flush))))

(defn- check-premium-token! []
  (premium-features/assert-has-feature :serialization (trs "Serialization")))

(mu/defn v2-load-internal!
  "SerDes v2 load entry point for internal users.

  `opts` are passed to [[v2.load/load-metabase]]."
  [path :- :string
   opts :- [:map {:closed true}
            [:continue-on-error {:optional true} [:maybe :boolean]]
            [:reindex? {:optional true} [:maybe :boolean]]]
   ;; Deliberately separate from the opts so it can't be set from the CLI.
   & {:keys [token-check?
             require-initialized-db?]
      :or   {token-check? true
             require-initialized-db? true}}
   :- [:maybe [:map {:closed true}
               [:token-check?            {:optional true} [:maybe :boolean]]
               [:require-initialized-db? {:optional true} [:maybe :boolean]]]]]
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
  (v2.load/load-metabase! (v2.ingest/ingest-yaml path) opts))

(mu/defn v2-load!
  "SerDes v2 load entry point.

   opts are passed to load-metabase"
  [path :- :string
   opts :- [:map {:closed true}
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
        imported (into (sorted-set) (map (comp name first)) (:seen report))]
    (analytics/track-event! :snowplow/serialization
                            {:event         :serialization
                             :direction     "import"
                             :source        "cli"
                             :duration_ms   (int (u/since-ms timer))
                             :models        (str/join "," imported)
                             :count         (if (contains? imported "Setting")
                                              (inc (count (remove #(= :model/Setting (first %)) (:seen report))))
                                              (count (:seen report)))
                             :error_count   (count (:errors report))
                             :success       (nil? @err)
                             :error_message (when @err
                                              (u/strip-error @err nil))})
    (when @err
      (print-error! @err "Error during deserialization" (:full-stacktrace opts))
      (throw (ex-info (ex-message @err) {:cmd/exit true})))
    (print-result! (format "Import from '%s' complete: %d entities" path (count (:seen report))) (:errors report))
    imported))

(defn v2-dump!
  "Exports Metabase app data to directory at path"
  [path {:keys [collection-ids] :as opts}]
  (log/infof "Exporting Metabase to %s" path)
  (mdb/setup-db! :create-sample-content? false)
  (check-premium-token!)
  (serialization.db/all-users) ;; TODO -- why??? [editor's note: this comment originally from Cam]
  (let [f (io/file path)]
    (.mkdirs f)
    (when-not (.canWrite f)
      (throw (ex-info (format "Destination path is not writeable: %s" path) {:filename path}))))
  (let [start  (System/nanoTime)
        err    (atom nil)
        opts   (cond-> opts
                 (seq collection-ids)
                 (assoc :targets (v2.extract/make-targets-of-type :model/Collection collection-ids)))
        report (try
                 (serialization/with-export-transaction
                   (-> (v2.extract/extract opts)
                       (v2.storage/store! (v2.storage.files/file-writer path))))
                 (catch Exception e
                   (reset! err e)))]
    (analytics/track-event! :snowplow/serialization
                            {:event           :serialization
                             :direction       "export"
                             :source          "cli"
                             :duration_ms     (int (/ (- (System/nanoTime) start) 1e6))
                             :count           (reduce + 0 (vals (:entity-counts report)))
                             :error_count     (count (:errors report))
                             :collection      (str/join "," collection-ids)
                             :all_collections (and (empty? collection-ids)
                                                   (not (:no-collections opts)))
                             :data_model      (not (:no-data-model opts))
                             :settings        (not (:no-settings opts))
                             :field_values    (boolean (:include-field-values opts))
                             :secrets         false
                             :success         (nil? @err)
                             :error_message   (when @err
                                                (u/strip-error @err nil))})
    (when @err
      (print-error! @err "Error during serialization export" (:full-stacktrace opts))
      (throw (ex-info (ex-message @err) {:cmd/exit true})))
    (print-result! (format "Export to '%s' complete: %d entities" path (reduce + 0 (vals (:entity-counts report))))
                   (:errors report))
    report))

(comment
  (v2-dump! "/tmp/serdes" {}))
