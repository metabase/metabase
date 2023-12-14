(ns metabase-enterprise.serialization.api-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.models :refer [Card Collection Dashboard]]
   [metabase.test :as mt])
  (:import
   (java.io File ByteArrayOutputStream)
   (org.apache.commons.compress.archivers.tar TarArchiveEntry TarArchiveInputStream)
   (org.apache.commons.compress.compressors.gzip GzipCompressorInputStream)))

(set! *warn-on-reflection* true)

(defn- entries [^TarArchiveInputStream tar]
  (lazy-seq
   (when-let [entry (.getNextEntry tar)]
     (cons entry (entries tar)))))

(deftest export-test
  (testing "POST /api/ee/serialization/export"
    (mt/with-temp [Collection {coll :id} {}
                   Dashboard  {_dash :id} {:collection_id coll}
                   Card       {_card :id} {:collection_id coll}]
      (let [f (mt/user-http-request :rasta :post 200  "ee/serialization/export" {}
                                    :collection coll :data-model  false :settings false)]
        (is (instance? File f))

        (with-open [tar (-> (io/input-stream f)
                            (GzipCompressorInputStream.)
                            (TarArchiveInputStream.))]
          (doseq [^TarArchiveEntry e (entries tar)]
            (cond
              (re-find #"/log.txt$" (.getName e))
              (let [s (ByteArrayOutputStream.)]
                (io/copy tar s)
                (is (= 3 (count (re-seq #"\n" (.toString s "UTF-8")))))))))))))
