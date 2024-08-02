(ns metabase-enterprise.serialization.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.api :as api.serialization]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.models :refer [Card Collection Dashboard]]
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

(defn- file-type
  "Find out entity type by file path"
  [fname]
  (condp re-find fname
    #"/$"                                   :dir
    #"/settings.yaml$"                      :settings
    #"/export.log$"                         :log
    #"/collections/.*/cards/.*\.yaml$"      :card
    #"/collections/.*/dashboards/.*\.yaml$" :dashboard
    #"/collections/.*\.yaml$"               :collection
    #"/snippets/.*\.yaml"                   :snippet
    #"/databases/.*/schemas/"               :schema
    #"/databases/.*\.yaml"                  :database
    fname))

(defn- log-types
  "Find out entity type by log message"
  [lines]
  (->> lines
       (keep #(second (re-find #"(?:Loading|Storing) (\w+)" %)))
       set))

(defn- tar-file-types [f]
  (with-open [tar (open-tar f)]
    (->> (u.compress/entries tar)
         (map (fn [^TarArchiveEntry e] (file-type (.getName e))))
         set)))

(deftest export-test
  (testing "Serialization API export"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (testing "Should require a token with `:serialization`"
        (mt/with-premium-features #{}
          (is (= "Serialization is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :rasta :post 402 "ee/serialization/export")))))
      (mt/with-premium-features #{:serialization}
        (testing "POST /api/ee/serialization/export"
          (mt/with-empty-h2-app-db
            (mt/with-temp [Collection    coll  {:name "API Collection"}
                           Dashboard     _     {:collection_id (:id coll)}
                           Card          _     {:collection_id (:id coll)}]
              (testing "API respects parameters"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :all_collections false :data_model false :settings true)]
                  (is (= #{:log :dir :settings}
                         (tar-file-types f)))))

              (testing "We can export just a single collection"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (:id coll) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection}
                         (tar-file-types f)))))

              (testing "We can export that collection using entity id"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :collection (str "eid:" (:entity_id coll)) :data_model false :settings false)]
                  (is (= #{:log :dir :dashboard :card :collection}
                         (tar-file-types f)))))

              (testing "Default export: all-collections, data-model, settings"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {})]
                  (is (= #{:log :dir :dashboard :card :collection :settings :schema :database}
                         (tar-file-types f)))))

              (testing "On exception API returns log"
                (with-redefs [u.compress/tgz (fn [& _] (throw (ex-info "[test] deliberate error message" {})))]
                  (binding [api.serialization/*additive-logging* false]
                    (let [res   (mt/user-http-request :crowberto :post 500 "ee/serialization/export" {}
                                                      :collection (:id coll) :data_model false :settings false)
                          lines (str/split-lines (slurp (io/input-stream res)))]
                      (testing "First three lines for coll+dash+card, and then an error during compression"
                        (is (= #{"Collection" "Dashboard" "Card"}
                               (log-types (take 3 lines))))
                        (is (re-find #"deliberate error message" (str/join "\n" (->> lines (drop 3) (take 3))))))))))

              (testing "You can pass specific directory name"
                (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                              :dirname "check" :all_collections false :data_model false :settings false)]
                  (is (= "check/"
                         (with-open [tar (open-tar f)]
                           (.getName ^TarArchiveEntry (first (u.compress/entries tar))))))))))))
      (testing "We've left no new files, every request is cleaned up"
        ;; if this breaks, check if you consumed every response with io/input-stream
        (is (= known-files
               (set (.list (io/file api.serialization/parent-dir)))))))))

(deftest export-import-test
  (testing "Serialization API e2e"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (snowplow-test/with-fake-snowplow-collector
        (mt/with-premium-features #{:serialization}
          (testing "POST /api/ee/serialization/export"
            (mt/with-temp [Collection coll  {}
                           Dashboard  _dash {:collection_id (:id coll)}
                           Card       card  {:collection_id (:id coll)}]

              (let [res    (mt/user-http-request :crowberto :post 200 "ee/serialization/export"
                                                 :collection (:id coll) :data_model false :settings false)
                    files* (atom [])
                    ;; to avoid input stream closure
                    ba     (#'api.serialization/ba-copy (io/input-stream res))]
                (with-open [tar (open-tar ba)]
                  (doseq [^TarArchiveEntry e (u.compress/entries tar)]
                    (when (.isFile e)
                      (swap! files* conj (.getName e)))
                    (condp re-find (.getName e)
                      #"/export.log$" (testing "Three lines in a log for data files"
                                        (is (= 3 (count (line-seq (io/reader tar))))))
                      nil)))

                (testing "We get only our data and a log file in an archive"
                  (is (= 4 (count @files*))))

                (testing "Snowplow export event was sent"
                  (is (=? {"event"           "serialization"
                           "direction"       "export"
                           "collection"      (str (:id coll))
                           "all_collections" false
                           "data_model"      false
                           "settings"        false
                           "field_values"    false
                           "duration_ms"     pos?
                           "count"           3
                           "source"          "api"
                           "secrets"         false
                           "success"         true
                           "error_message"   nil}
                          (-> (snowplow-test/pop-event-data-and-user-id!) first :data))))

                (testing "POST /api/ee/serialization/import"
                  (t2/update! :model/Card {:id (:id card)} {:name (str "qwe_" (:name card))})

                  (let [res (mt/user-http-request :crowberto :post 200 "ee/serialization/import"
                                                  {:request-options {:headers {"content-type" "multipart/form-data"}}}
                                                  {:file ba})]
                    (testing "We get our data items back"
                      (is (= #{"Collection" "Dashboard" "Card" "Database"}
                             (log-types (line-seq (io/reader (io/input-stream res)))))))
                    (testing "And they hit the db"
                      (is (= (:name card)
                             (t2/select-one-fn :name :model/Card :id (:id card)))))
                    (testing "Snowplow import event was sent"
                      (is (=? {"event"         "serialization"
                               "direction"     "import"
                               "duration_ms"   pos?
                               "source"        "api"
                               "models"        "Card,Collection,Dashboard"
                               "count"         3
                               "success"       true
                               "error_message" nil}
                              (-> (snowplow-test/pop-event-data-and-user-id!) first :data)))))))

              (testing "ERROR /api/ee/serialization/export"
                (with-redefs [u.compress/tgz (fn [& _] (throw (ex-info "[test] deliberate error message" {})))]
                  (binding [api.serialization/*additive-logging* false]
                    (is (-> (mt/user-http-request :crowberto :post 500 "ee/serialization/export"
                                                  :collection (:id coll) :data_model false :settings false)
                            ;; consume response to remove on-disk data
                            io/input-stream)))
                  (testing "Snowplow event about error was sent"
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
                             "error_message"   "clojure.lang.ExceptionInfo: [test] deliberate error message {}"}
                           (-> (snowplow-test/pop-event-data-and-user-id!) first :data))))))

              (testing "Only admins can export/import"
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "ee/serialization/export")))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :post 403 "ee/serialization/import"))))))))
      (testing "We've left no new files, every request is cleaned up"
        ;; if this breaks, check if you consumed every response with io/input-stream. Or `future` is taking too long
        ;; in `api/on-response!`, so maybe add some Thread/sleep here.
        (is (= known-files
               (set (.list (io/file api.serialization/parent-dir)))))))))

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
