(ns metabase-enterprise.serialization.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.api :as api.serialization]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.util.compress :as u.compress]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveInputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorInputStream)))

(set! *warn-on-reflection* true)

(defn- open-tar ^TarArchiveInputStream [f]
  (-> (io/input-stream f)
      (GzipCompressorInputStream.)
      (TarArchiveInputStream.)))

(def ^:private file-types
  [#"([^/]+)?/$"                               :dir
   #"/settings.yaml$"                          :settings
   #"/export.log$"                             :log
   #"/collections/metabots/(.*)\.yaml$"        :metabot
   #"/collections/.*/cards/(.*)\.yaml$"        :card
   #"/collections/.*/dashboards/(.*)\.yaml$"   :dashboard
   #"/collections/.*collection/([^/]*)\.yaml$" :collection
   #"/collections/([^/]*)\.yaml$"              :collection
   #"/snippets/(.*)\.yaml"                     :snippet
   #"/databases/.*/schemas/(.*)"               :schema
   #"/databases/(.*)\.yaml"                    :database
   #"/transforms/(.*)\.yaml"                   :transform
   #"/python-libraries/(.*)\.yaml"             :python-library])

(defn- file-type
  "Find out entity type by file path"
  [fname]
  (some (fn [[re ftype]]
          (when-let [m (re-find re fname)]
            [ftype (when (vector? m) (second m))]))
        (partition 2 file-types)))

(defn- log-types
  "Find out entity type by log message"
  [lines]
  (->> lines
       (keep #(second (re-find #"(?:Extracting|Loading|Storing) \{:path (\w+)" %)))
       set))

(defn- tar-file-types [f & [raw?]]
  (with-open [tar (open-tar f)]
    (cond->> (u.compress/entries tar)
      true       (mapv (fn [^TarArchiveEntry e] (file-type (.getName e))))
      (not raw?) (map first)
      (not raw?) set)))

(defn- extract-one-error [entity-id orig]
  (fn [model-name opts instance]
    (if (= (:entity_id instance) entity-id)
      (throw (ex-info "[test] deliberate error message" {:test true}))
      (orig model-name opts instance))))

(defn- sanitize-key [m k]
  (let [x (k m)]
    (if (and x (or (not (string? x)) (= 21 (count x))))
      (assoc m k "**ID**")
      m)))

(defn- extract-and-sanitize-exception-map [log]
  (->> (re-find #"ERROR .* (\{.*\})(\n|$)" log)
       second
       read-string
       (walk/postwalk #(-> % (sanitize-key :id) (sanitize-key :entity_id)))))

(defmacro with-serialization-test-data!
  "Sets up standard test context: search index, snowplow, premium features, and test entities."
  [[coll dash card] & body]
  `(search.tu/with-temp-index-table
     (snowplow-test/with-fake-snowplow-collector
       (mt/with-premium-features #{:serialization}
         (mt/with-temp [:model/Collection ~coll  {}
                        :model/Dashboard  ~dash  {:collection_id (:id ~coll), :name "thraddash"}
                        :model/Card       ~card  {:collection_id (:id ~coll), :name "frobinate", :type :model
                                                  :query_type    :native
                                                  :dataset_query {:type     :native
                                                                  :database (t2/select-one-pk :model/Database)
                                                                  :native   {:query "SELECT 1"}}}]
           ~@body)))))

(defn- do-export
  "Helper to perform an export and return the byte array."
  [coll-id]
  (-> (mt/user-http-request :crowberto :post 200 "ee/serialization/export"
                            :collection coll-id :data_model false :settings false)
      io/input-stream
      (#'api.serialization/ba-copy)))

(deftest export-test
  (testing "Serialization API export"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (testing "Should require a token with `:serialization`"
        (mt/with-premium-features #{}
          (mt/assert-has-premium-feature-error "Serialization"
                                               (mt/user-http-request :rasta :post 402 "ee/serialization/export"))))
      (mt/with-premium-features #{:serialization}
        (testing "POST /api/ee/serialization/export"
          (mt/with-empty-h2-app-db!
            (mt/with-temp [:model/Collection    coll  {:name "API Collection"}
                           :model/Dashboard     _     {:collection_id (:id coll)}
                           :model/Card          card  {:collection_id (:id coll)}
                           :model/Collection    coll2 {:name "Other Collection"}
                           :model/Card          _     {:collection_id (:id coll2)}]
              (testing "API respects parameters"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :all_collections false :data_model false :settings true)]
                  (is (= #{:log :dir :settings :transform :python-library}
                         (tar-file-types f)))))

              (testing "We can export just a single collection"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:id coll) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection :transform :python-library}
                         (tar-file-types f)))))

              (testing "We can export two collections"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:id coll) :collection (:id coll2)
                                              :data_model false :settings false)]
                  (is (= 2
                         (->> (tar-file-types f true)
                              (filter #(= :collection (first %)))
                              count)))))

              (testing "We can export that collection using entity id"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              ;; eid:... syntax is kept for backward compat
                                              :collection (str "eid:" (:entity_id coll)) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection :transform :python-library}
                         (tar-file-types f)))))

              (testing "We can export that collection using entity id"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:entity_id coll) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection :transform :python-library}
                         (tar-file-types f)))))

              (testing "Default export: all-collections, data-model, settings"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {})]
                  (is (= #{:transform :log :dir :dashboard :card :collection :settings :schema :database :python-library}
                         (tar-file-types f)))))

              (testing "On exception API returns log"
                (mt/with-dynamic-fn-redefs [serdes/extract-one (extract-one-error (:entity_id card)
                                                                                  (mt/dynamic-value serdes/extract-one))]
                  (let [res (binding [api.serialization/*additive-logging* false]
                              (mt/user-http-request :crowberto :post 500 "ee/serialization/export" {}
                                                    :collection (:id coll) :data_model false :settings false))
                        log (slurp (io/input-stream res))]
                    (testing "In logs we get an entry for the dashboard, then card, and then an error"
                      (is (= #{"Dashboard" "Card"}
                             (log-types (str/split-lines log))))
                      (is (re-find #"deliberate error message" log))
                      (is (=  {:id        "**ID**",
                               :entity_id "**ID**",
                               :model     "Card",
                               :table     :report_card
                               :cause     "[test] deliberate error message"}
                              (extract-and-sanitize-exception-map log)))))))

              (testing "You can pass specific directory name"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :dirname "check" :all_collections false :data_model false :settings false)]
                  (is (= "check/"
                         (with-open [tar (open-tar f)]
                           (.getName ^TarArchiveEntry (first (u.compress/entries tar))))))))

              (testing "Invalid entity ID returns an error instead of falling back to root collection"
                (let [fake-eid "abcdefghijklmnopqrstu"
                      res      (mt/user-http-request :crowberto :post 400 "ee/serialization/export" {}
                                                     :collection fake-eid :data_model false :settings false)
                      log      (slurp (io/input-stream res))]
                  (is (re-find #"Could not find Collection with entity ID" log))
                  (is (re-find #"abcdefghijklmnopqrstu" log))))))))
      (testing "We've left no new files, every request is cleaned up"
        ;; if this breaks, check if you consumed every response with io/input-stream
        (is (= known-files
               (set (.list (io/file api.serialization/parent-dir)))))))))

(defn- search-result-count [model search-string]
  (:total
   (search/search
    (search/search-context
     {:current-user-id       (mt/user->id :crowberto)
      :is-superuser?         true
      :is-impersonated-user? false
      :is-sandboxed-user?    false
      :models                #{model}
      :current-user-perms    #{"/"}
      :search-string         search-string}))))

(deftest export-happy-path-test
  (testing "Successful export creates valid archive with correct files and Snowplow event"
    (with-serialization-test-data! [coll dash card]
      ;; Clear entities from search index to verify export works independently
      (search/delete! :model/Dashboard [(str (:id dash))])
      (search/delete! :model/Card [(str (:id card))])
      (is (= 0 (search-result-count "dashboard" "thraddash")))
      (is (= 0 (search-result-count "dataset" "frobinate")))

      (let [res (-> (mt/user-http-request :crowberto :post 200 "ee/serialization/export"
                                          :collection (:id coll) :data_model false :settings false)
                    io/input-stream)
            ba  (#'api.serialization/ba-copy res)]
        (testing "Archive contains correct number of files with proper log entries"
          (is (= 13
                 (with-open [tar (open-tar ba)]
                   (count
                    (for [^TarArchiveEntry e (u.compress/entries tar)
                          :when              (.isFile e)]
                      (do
                        (condp re-find (.getName e)
                          #"/export.log$" (testing "Log contains extract and store entries"
                                            (is (= (+ #_extract 12 #_store 12)
                                                   (count (line-seq (io/reader tar))))))
                          nil)
                        (.getName e))))))))

        (testing "Snowplow export event was sent"
          (is (=? {"event"           "serialization"
                   "direction"       "export"
                   "collection"      (str (:id coll))
                   "all_collections" false
                   "data_model"      false
                   "settings"        false
                   "field_values"    false
                   "duration_ms"     (every-pred number? pos?)
                   "count"           12
                   "error_count"     0
                   "source"          "api"
                   "secrets"         false
                   "success"         true
                   "error_message"   nil}
                  (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))))

(deftest import-restores-entities-test
  (testing "Import restores deleted/renamed entities and updates search index"
    (with-serialization-test-data! [coll dash card]
      ;; Clear entities from search index
      (search/delete! :model/Dashboard [(str (:id dash))])
      (search/delete! :model/Card [(str (:id card))])

      ;; Export the data
      (let [ba (do-export (:id coll))]
        ;; Pop the export snowplow event
        (snowplow-test/pop-event-data-and-user-id!)

        ;; Modify entities in the database
        (t2/update! :model/Dashboard {:id (:id dash)} {:name "urquan"})
        (t2/delete! :model/Card (:id card))

        (let [re-indexed? (atom false)
              res         (mt/with-dynamic-fn-redefs [search/reindex! (fn [& _] (reset! re-indexed? true) (future nil))]
                            (mt/user-http-request :crowberto :post 200 "ee/serialization/import?reindex=false"
                                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                                  {:file ba}))]
          (testing "Log contains imported entity types"
            (is (= #{"Collection" "Dashboard" "Card" "PythonLibrary" "TransformJob" "TransformTag"}
                   (log-types (line-seq (io/reader (io/input-stream res)))))))

          (testing "Entities are restored in the database"
            (is (= (:name dash) (t2/select-one-fn :name :model/Dashboard :entity_id (:entity_id dash))))
            (is (= (:name card) (t2/select-one-fn :name :model/Card :entity_id (:entity_id card)))))

          (testing "Snowplow import event was sent"
            (is (=? {"event"         "serialization"
                     "direction"     "import"
                     "duration_ms"   pos?
                     "source"        "api"
                     "models"        "Card,Collection,Dashboard,PythonLibrary,TransformJob,TransformTag"
                     "count"         12
                     "error_count"   0
                     "success"       true
                     "error_message" nil}
                    (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))

          (testing "Full reindex was not triggered (reindex=false)"
            (is (false? @re-indexed?)))

          (testing "Entities are added to the search index"
            (is (= 1 (search-result-count "dashboard" "thraddash")))
            (is (= 0 (search-result-count "dashboard" "urquan")))
            (is (= 1 (search-result-count "dataset" "frobinate")))))))))

(deftest import-collection-reference-error-test
  (testing "Import fails with 500 when collection reference is invalid"
    (with-serialization-test-data! [coll _dash card]
      (let [ba (do-export (:id coll))]
        ;; Pop the export snowplow event
        (snowplow-test/pop-event-data-and-user-id!)

        (mt/with-dynamic-fn-redefs [v2.ingest/ingest-file (let [ingest-file (mt/dynamic-value #'v2.ingest/ingest-file)]
                                                            (fn [^File file]
                                                              (cond-> (ingest-file file)
                                                                (str/includes? (.getName file) (:entity_id card))
                                                                (assoc :collection_id "DoesNotExist"))))]
          (let [res (binding [api.serialization/*additive-logging* false]
                      (mt/user-http-request :crowberto :post 500 "ee/serialization/import"
                                            {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                            {:file ba}))
                log (slurp (io/input-stream res))]
            (testing "Error message indicates missing collection"
              (is (re-find #"Failed to read file \{:path \"Collection DoesNotExist\"}" log)))

            (testing "Snowplow failure event was sent"
              (is (=? {"success"       false
                       "event"         "serialization"
                       "direction"     "import"
                       "source"        "api"
                       "duration_ms"   int?
                       "count"         0
                       "error_count"   0
                       "error_message" "Failed to read file {:path \"Collection DoesNotExist\"}"}
                      (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))))))

(deftest import-continue-on-error-test
  (testing "Import with continue_on_error=true succeeds partially despite errors"
    (with-serialization-test-data! [coll _dash card]
      (let [ba (do-export (:id coll))]
        ;; Pop the export snowplow event
        (snowplow-test/pop-event-data-and-user-id!)

        (mt/with-dynamic-fn-redefs [v2.ingest/ingest-file (let [ingest-file (mt/dynamic-value #'v2.ingest/ingest-file)]
                                                            (fn [^File file]
                                                              (cond-> (ingest-file file)
                                                                (str/includes? (.getName file) (:entity_id card))
                                                                (assoc :collection_id "DoesNotExist"))))]
          (let [res (mt/user-http-request :crowberto :post 200 "ee/serialization/import"
                                          {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                          {:file ba}
                                          :continue_on_error true)
                log (slurp (io/input-stream res))]
            (testing "Log shows loaded entities and error"
              (is (= #{"Dashboard" "Card" "Collection" "TransformJob" "TransformTag" "PythonLibrary"}
                     (log-types (str/split-lines log))))
              (is (re-find #"Failed to read file \{:path \"Collection DoesNotExist\"}" log)))

            (testing "Snowplow event shows partial success with error count"
              (is (=? {"success"     true
                       "event"       "serialization"
                       "direction"   "import"
                       "source"      "api"
                       "duration_ms" int?
                       "count"       11
                       "error_count" 1
                       "models"      "Collection,Dashboard,PythonLibrary,TransformJob,TransformTag"}
                      (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))))))

(deftest import-invalid-archive-test
  (testing "Import with invalid archive returns 422 client error"
    (mt/with-premium-features #{:serialization}
      (let [res (mt/user-http-request :crowberto :post 422 "ee/serialization/import"
                                      {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                      {:file (.getBytes "not an archive" "UTF-8")})
            log (slurp (io/input-stream res))]
        (is (re-find #"Cannot unpack archive" log))))))

(deftest export-extraction-error-test
  (testing "Export fails with 500 when entity extraction fails"
    (with-serialization-test-data! [coll _dash card]
      (mt/with-dynamic-fn-redefs [serdes/extract-one (extract-one-error (:entity_id card)
                                                                        (mt/dynamic-value serdes/extract-one))]
        (testing "Error response contains exception details"
          (binding [api.serialization/*additive-logging* false]
            (let [res (mt/user-http-request :crowberto :post 500 "ee/serialization/export"
                                            :collection (:id coll) :data_model false :settings false)
                  log (slurp (io/input-stream res))]
              (is (= {:id        "**ID**"
                      :entity_id "**ID**"
                      :model     "Card"
                      :table     :report_card
                      :cause     "[test] deliberate error message"}
                     (extract-and-sanitize-exception-map log))))))

        (testing "Snowplow failure event was sent"
          (is (=? {"event"           "serialization"
                   "direction"       "export"
                   "duration_ms"     pos?
                   "source"          "api"
                   "count"           0
                   "collection"      (str (:id coll))
                   "all_collections" false
                   "data_model"      false
                   "settings"        false
                   "field_values"    false
                   "secrets"         false
                   "success"         false
                   "error_message"   #"(?s)Error extracting Card \d+ .*"}
                  (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))

        (testing "full_stacktrace parameter includes full stack trace"
          (binding [api.serialization/*additive-logging* false]
            (let [res (mt/user-http-request :crowberto :post 500 "ee/serialization/export"
                                            :collection (:id coll) :data_model false :settings false
                                            :full_stacktrace true)
                  log (slurp (io/input-stream res))]
              (is (< 200 (count (str/split-lines log))))
              ;; Pop out the error event
              (snowplow-test/pop-event-data-and-user-id!))))))))

(deftest export-continue-on-error-test
  (testing "Export with continue_on_error=true succeeds partially despite errors"
    (with-serialization-test-data! [coll _dash card]
      (mt/with-dynamic-fn-redefs [serdes/extract-one (extract-one-error (:entity_id card)
                                                                        (mt/dynamic-value serdes/extract-one))]
        (let [res (-> (mt/user-http-request :crowberto :post 200 "ee/serialization/export"
                                            :collection (:id coll) :data_model false :settings false
                                            :continue_on_error true)
                      io/input-stream)]
          (with-open [tar (open-tar res)]
            (doseq [^TarArchiveEntry e (u.compress/entries tar)]
              (condp re-find (.getName e)
                #"/export.log$" (testing "Log shows extract entries, error, and store entries"
                                  (is (= (+ #_extract 12 #_error 1 #_store 11)
                                         (count (line-seq (io/reader tar))))))
                nil))))

        (testing "Snowplow event shows partial success with error count"
          (is (=? {"event"           "serialization"
                   "direction"       "export"
                   "collection"      (str (:id coll))
                   "all_collections" false
                   "data_model"      false
                   "settings"        false
                   "field_values"    false
                   "duration_ms"     pos?
                   "count"           11
                   "error_count"     1
                   "source"          "api"
                   "secrets"         false
                   "success"         true
                   "error_message"   nil}
                  (-> (snowplow-test/pop-event-data-and-user-id!) last :data))))))))

(deftest serialization-permissions-test
  (testing "Only admins can export/import"
    (mt/with-premium-features #{:serialization}
      (testing "Non-admin cannot export"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/serialization/export"))))

      (testing "Non-admin cannot import"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "ee/serialization/import"
                                     {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                     {:file (byte-array 0)})))))))

(deftest serialization-cleanup-test
  (testing "No temp files are left behind after export/import operations"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (with-serialization-test-data! [coll _dash _card]
        (let [ba (do-export (:id coll))]
          ;; Consume the export response
          (snowplow-test/pop-event-data-and-user-id!)

          ;; Do an import to exercise that code path too
          (let [res (mt/user-http-request :crowberto :post 200 "ee/serialization/import"
                                          {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                          {:file ba})]
            ;; Consume the import response
            (slurp (io/input-stream res))
            (snowplow-test/pop-event-data-and-user-id!))))

      ;; Verify no new files were left behind
      ;; if this breaks, check if you consumed every response with io/input-stream. Or `future` is taking too long
      ;; in `api/on-response!`, so maybe add some Thread/sleep here.
      (is (= known-files
             (set (.list (io/file api.serialization/parent-dir))))))))

(deftest find-serialization-dir-test
  (testing "We are able to find serialization dir even in presence of various hidden dirs"
    (let [dst (io/file api.serialization/parent-dir (u.random/random-name))]
      (.mkdirs (io/file dst "._hidden_dir"))
      (.mkdirs (io/file dst "not_hidden_dir"))
      (is (= nil
             (#'api.serialization/find-serialization-dir dst)))
      (.mkdirs (io/file dst "real_dir" "collections"))
      (is (= "real_dir"
             (.getName ^File (#'api.serialization/find-serialization-dir dst))))
      (run! io/delete-file (reverse (file-seq dst))))))
