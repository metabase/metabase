(ns metabase-enterprise.serialization.v2.stability-test
  "Exports must be byte-stable: loading an export into an empty app DB and exporting it again gives the same YAML for
  every entity, so nothing in a file depends on local ids, load order or other instance state."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.load :as load]
   [metabase-enterprise.serialization.v2.round-trip-test :as round-trip-test]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase-enterprise.serialization.v2.storage.files :as storage.files]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.models.serialization :as serdes]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def ^:private extract-opts {:include-field-values true :include-metabot true})

(defn- temp-dir ^File []
  (.toFile (Files/createTempDirectory "serdes_stability" (make-array FileAttribute 0))))

(defn- load-dir! [^File dir]
  (serdes/with-cache
    (load/load-metabase! (ingest/ingest-yaml dir) :reindex? false)))

(defn- store-export! [^File dir]
  (serdes/with-cache
    (storage/store! (extract/extract extract-opts) (storage.files/file-writer dir))))

(defn- exported-yaml
  "The YAML of every exported entity, by its `:serdes/meta`."
  []
  (serdes/with-cache
    (into {}
          (map (juxt :serdes/meta storage.util/entity-yaml))
          (extract/extract extract-opts))))

(defn- shift-local-ids!
  "Make every identity column of the H2 app DB start at a different number past `start`, so loaded entities get other
  local ids."
  [start]
  (doseq [[i {table :table_name column :column_name}]
          (map-indexed vector (t2/query ["SELECT table_name, column_name FROM information_schema.columns
                                          WHERE is_identity = 'YES' AND table_schema = 'PUBLIC'"]))]
    (t2/query [(format "ALTER TABLE \"%s\" ALTER COLUMN \"%s\" RESTART WITH %d" table column (+ start (* 37 i)))])))

(defn- export-of-load!
  "Load `dir` into an empty app DB with local ids past `start`, store its export into `out-dir` and return
  [[exported-yaml]]."
  [dir out-dir start]
  (mt/with-empty-h2-app-db!
    (shift-local-ids! start)
    (load-dir! dir)
    (store-export! out-dir)
    (exported-yaml)))

(defn- changed
  "The entities whose YAML differs between the `before` and `after` exports, with both versions."
  [before after]
  (into (sorted-map-by #(compare (pr-str %1) (pr-str %2)))
        (for [k     (into (set (keys before)) (keys after))
              :when (not= (get before k) (get after k))]
          [k [(get before k) (get after k)]])))

(deftest export-load-export-test
  (search.tu/with-index-disabled
    (let [[dir-a dir-b dir-c :as dirs] (repeatedly 3 temp-dir)]
      (try
        (testing "the baseline is not written by an export, so its first export only normalizes it"
          (export-of-load! round-trip-test/source-dir dir-a 1))
        (let [before (export-of-load! dir-a dir-b 1000)]
          (testing "the baseline covers many entities"
            (is (< 200 (count before))))
          (testing "exporting the same app DB twice gives the same YAML"
            (is (= {} (mt/with-empty-h2-app-db!
                        (load-dir! dir-b)
                        (changed (exported-yaml) (exported-yaml))))))
          (testing "loading an export into an app DB with other local ids and exporting it again gives the same YAML"
            (is (= {} (changed before (export-of-load! dir-b dir-c 9000))))))
        (finally
          (doseq [^File dir dirs
                  ^File f   (reverse (file-seq dir))]
            (io/delete-file f true)))))))
