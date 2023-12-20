(ns metabase-enterprise.serialization.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.api :as api.serialization]
   [metabase.models :refer [Card Collection Dashboard]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveInputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorInputStream)))

(set! *warn-on-reflection* true)

(defn open-tar ^TarArchiveInputStream [f]
  (-> (io/input-stream f)
      (GzipCompressorInputStream.)
      (TarArchiveInputStream.)))

(def entries #(#'api.serialization/entries %))

(defn file-type
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

(defn log-types
  "Find out entity type by log message"
  [lines]
  (->> lines
       (keep #(second (re-find #"(?:Loading|Storing) (\w+)" %)))
       (map (comp keyword u/lower-case-en))
       set))

(deftest export-test
  (testing "Serialization API export"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (testing "Should require a token with `:serialization`"
        (premium-features-test/with-premium-features #{}
          (is (= "Serialization is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request :rasta :post 402 "ee/serialization/export")))))
      (premium-features-test/with-premium-features #{:serialization}
        (binding [api.serialization/*in-tests* true]
          (testing "POST /api/ee/serialization/export"
            (mt/with-empty-h2-app-db
              (mt/with-temp [Collection    coll  {}
                             Dashboard     _     {:collection_id (:id coll)}
                             Card          _     {:collection_id (:id coll)}]
                (testing "API respects parameters"
                  (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                                :all-collections false :data-model false :settings true)]
                    (is (= #{:log :dir :settings}
                           (with-open [tar (open-tar f)]
                             (->> (entries tar)
                                  (map (fn [^TarArchiveEntry e] (file-type (.getName e))))
                                  set))))))

                (testing "We can export just a single collection"
                  (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {}
                                                :collection (:id coll) :data-model false :settings false)]
                    (is (= #{:log :dir :dashboard :card :collection}
                           (with-open [tar (open-tar f)]
                             (->> (entries tar)
                                  (map (fn [^TarArchiveEntry e] (file-type (.getName e))))
                                  set))))))

                (testing "Default export: all-collections, data-model, settings"
                  (let [f (mt/user-http-request :crowberto :post 200 "ee/serialization/export" {})]
                    (is (= #{:log :dir :dashboard :card :collection :settings :schema :database}
                           (with-open [tar (open-tar f)]
                             (->> (entries tar)
                                  (map (fn [^TarArchiveEntry e] (file-type (.getName e))))
                                  set))))))

                (testing "On exception API returns log"
                  (with-redefs [api.serialization/compress-tgz (fn [& _] (throw (ex-info "Just an error" {})))]
                    (let [res   (mt/user-http-request :crowberto :post 500 "ee/serialization/export" {}
                                                      :collection (:id coll) :data-model false :settings false)
                          lines (str/split-lines (slurp (io/input-stream res)))]
                      (testing "First three lines for coll+dash+card, and then error during compression"
                        (is (= #{:collection :dashboard :card}
                               (log-types (take 3 lines))))
                        (is (re-find #"ERROR" (nth lines 3))))))))))))
      (testing "We've left no new files, every request is cleaned up"
        ;; if this breaks, check if you consumed every response with io/input-stream
        (is (= known-files
               (set (.list (io/file api.serialization/parent-dir)))))))))

(deftest export-import-test
  (testing "Serialization API e2e"
    (let [known-files (set (.list (io/file api.serialization/parent-dir)))]
      (premium-features-test/with-premium-features #{:serialization}
        (binding [api.serialization/*in-tests* true]
          (testing "POST /api/ee/serialization/export"
            (mt/with-temp! [Collection coll  {}
                            Dashboard  _dash {:collection_id (:id coll)}
                            Card       card  {:collection_id (:id coll)}]
              (let [res    (mt/user-real-request :crowberto :post 200  "ee/serialization/export"
                                                 {:request-options {:as :byte-array}}
                                                 :collection (:id coll) :data-model false :settings false)
                    files* (atom [])
                    ;; to avoid closing input stream
                    ba     (#'api.serialization/ba-copy (io/input-stream res))]
                (with-open [tar (open-tar ba)]
                  (doseq [^TarArchiveEntry e (entries tar)]
                    (when (.isFile e)
                      (swap! files* conj (.getName e)))
                    (condp re-find (.getName e)
                      #"/export.log$" (testing "Three lines in a log for data files"
                                        (is (= 3 (count (line-seq (io/reader tar))))))
                      nil)))

                (testing "We get only our data and a log file in an archive"
                  (is (= 4 (count @files*))))

                (testing "POST /api/ee/serialization/import"
                  (t2/update! :model/Card {:id (:id card)} {:name (str "qwe_" (:name card))})

                  (let [res (mt/user-real-request :crowberto :post 200 "ee/serialization/import"
                                                  {:request-options {:as      :byte-array
                                                                     :headers {"content-type" "multipart/form-data"}}}
                                                  {:file ba})]
                    (testing "We get our data items back"
                      (is (= #{:collection :dashboard :card :database}
                             (->> (line-seq (io/reader (io/input-stream res)))
                                  log-types))))
                    (testing "And they hit the db"
                      (is (= (:name card)
                             (t2/select-one-fn :name :model/Card :id (:id card))))))))))))
      (testing "We've left no new files, every request is cleaned up"
        ;; if this breaks, check if you consumed every response with io/input-stream
        (is (= known-files
               (set (.list (io/file api.serialization/parent-dir)))))))))
