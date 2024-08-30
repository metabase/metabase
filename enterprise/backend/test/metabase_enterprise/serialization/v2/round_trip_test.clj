;; This main test here is like an inside-out e2e test.
;;
;; It starts with an export, which it loads and then exports again.
;; By comparing the export both before and after, we can find unwanted divergences.
;; If the tests fail, and the in-memory data diffs are unclear, the relevant YAML files are also written
;; to dev/serialization_deltas, where you can diff them using the tool of your choice.
;;
;; There is also a coverage test, which checks if our fixture is missing any models, or have old cruft.
;;
;; If you've been sent here by the coverage test, here are some pointers:
;;
;; If there are models missing, go to theirs corresponding tests in [[v2.extract-test]], which you may still
;; need to create, and add a call to `round-trip-test/add-to-baseline!` immediately inside the database
;; initialization body; Run each test, then remove the calls again.
;; This will dump additional files into the baseline fixture folder, which you'll need to commit.
;; Its important that you first run [[baseline-completeness-test]] though to check that the dump is
;; consistent with the existing contents.
;; You may need to do some minor cleanup, things like the database sync status may have changed.
;; You can do this cleanup by hand, or run `(update-baseline!)` to normalize the discrepancies.
;;
;; To remove old cruft simply run `(update-baseline!)` (see Rich comment at the bottom)
(ns metabase-enterprise.serialization.v2.round-trip-test
  (:require
   [clojure.data :as data]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [metabase-enterprise.serialization.v2.extract :as extract]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.load :as load]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase-enterprise.serialization.v2.storage :as storage]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)
   (java.nio.file Files Path StandardCopyOption)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def ^File source-dir (io/as-file (io/resource "serialization_baseline")))

(def ^File dev-inspect-dir (io/as-file (File. "dev/serialization_deltas")))

(def ignored-fields
  ;; Is worth considering when adding entries here, whether they shouldn't just be skipped in extraction.
  #{:cache_field_values_schedule
    :metadata_sync_schedule
    :metabase_version})

(defn- strip-base-path [base file]
  (str/replace-first file (str base File/separator) ""))

(defn fileset
  "Return a set of all the nested filenames within a directory."
  [dir]
  (->> (file-seq dir)
       (filter #(.isFile ^File %))
       (map #(.getPath ^File %))
       (map (partial strip-base-path dir))
       (into (sorted-set))))

(defn read-yaml
  "Reads a YAML file and returns Clojure data, with ignored fields removed."
  [file]
  (walk/postwalk
   (fn [x]
     (if-not (map? x)
       x
       (reduce dissoc x ignored-fields)))
   (yaml/parse-string (slurp file))))

(defn non-empty-diff [diff]
  (when (some identity diff)
    diff))

(defn compare-files
  "Test for differences between two YAML files. Ignores some keys and some key ordering."
  [file1 file2]
  (->> (data/diff (read-yaml file1)
                  (read-yaml file2))
       (take 2)
       non-empty-diff))

(defn load-extract!
  "Perform a round-trip of loading an existing serialization, then serializing it again."
  [input-dir output-dir]
  (serdes/with-cache
    (load/load-metabase! (ingest/ingest-yaml input-dir)))
  ;; Use a separate cache to make sure there is no cross-contamination.
  (serdes/with-cache
    (-> (extract/extract {:include-field-values true})
        (storage/store! output-dir))))

(defn- delete-dir-contents! [^File dir]
  (when (and dir (.exists dir))
    (->> (file-seq dir)
         (remove #{dir})
         reverse
         (run! #(.delete ^File %)))))

(defn- create-files-to-diff!
  "Leave behind artifacts for closer inspection, e.g. via a CLI diff tool"
  [ref-file out-file]
  (let [base-filename (str dev-inspect-dir File/separator (strip-base-path source-dir ref-file))]
    (let [file-path (File. base-filename)
          parent    (.getParentFile file-path)]
      (when parent
        (Files/createDirectories (.toPath parent) (into-array FileAttribute []))))
    (spit (str base-filename ".baseline") (slurp ref-file))
    (spit (str base-filename ".actual") (slurp out-file))))

(defn- temp-dir ^Path [base-path]
  (Files/createTempDirectory base-path (make-array FileAttribute 0)))

(def source-dir-path (strip-base-path (File. (System/getProperty "user.dir")) source-dir))

(def ^:private internal-model?
  #{"Schema"})

(defn add-to-baseline!
  "Use this within v2.extract-test where relevant to add their fixtures to the baseline."
  []
  (storage/store! (into [] (extract/extract {:include-field-values true})) source-dir))

;; If this test is failing, read the docstring at the top of this namespace for what to do B-)
(deftest baseline-completeness-test
  (let [ingestable (ingest/ingest-yaml source-dir)
        resources  (ingest/ingest-list ingestable)
        baselined  (into #{} (map :model) (apply concat resources))
        necessary? (set serdes.models/exported-models)]
    (doseq [m serdes.models/exported-models]
      (is (baselined m) (format "We need to add %s entries to %s" m source-dir-path)))
    (doseq [b baselined :when (not (internal-model? b))]
      (is (necessary? b) (format "We can remove %s files from %s" b source-dir-path)))))

(deftest baseline-comparison-test
  (let [wrote-files? (volatile! false)
        temp-dir     (temp-dir "serialization_test")
        output-dir   (.toFile (.resolve temp-dir "serialization_output"))]
    (try
      (mt/with-empty-h2-app-db
        (delete-dir-contents! dev-inspect-dir)

        (load-extract! source-dir output-dir)

        (let [source-files  (fileset source-dir)
              output-files  (fileset output-dir)
              missing-files (set/difference source-files output-files)
              added-files   (set/difference output-files source-files)]

          (testing "No files are missing"
            (is (empty? missing-files)))
          (testing "No files have been added"
            (is (empty? added-files)))

          (testing "File contents\n"
            (doseq [file source-files
                    :let [ref-file (io/file source-dir file)
                          out-file (io/file output-dir file)]
                    :when (.exists out-file)
                    :let [delta (compare-files ref-file out-file)]]

              (is (nil? delta)
                  (str "Content mismatch for file: " (strip-base-path source-dir file)))

             ;; Leave behind files for developers to inspect
              (when (and (.exists dev-inspect-dir) delta)
                (vreset! wrote-files? true)
                (create-files-to-diff! ref-file out-file))))

          (when @wrote-files?
            (log/warn "Mismatching files have been written to /dev/serialization_deltas"))))

      (finally
        (delete-dir-contents! output-dir)))))

(defn- update-baseline!
  "Run this if you've examined the output of [[directory-comparison-test]], and are happy to accept the changes."
  []
  (let [temp-dir   (temp-dir "serialization_test")
        output-dir (.toFile (.resolve temp-dir "serialization_output"))]
    (mt/with-empty-h2-app-db
      (load-extract! source-dir output-dir))
    (delete-dir-contents! source-dir)
    (Files/move (.toPath output-dir)
                (.toPath source-dir)
                (into-array [StandardCopyOption/REPLACE_EXISTING]))))

(comment
  (delete-dir-contents! source-dir)
  (update-baseline!))
