(ns metabase-enterprise.audit-app.analytics-dev.export-test
  (:require
   [clojure.data :as data]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.audit-app.analytics-dev.export :as export])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(defn- yaml-files-relative
  "Return a map of `relative-path -> File` for every `.yaml` file under `root`."
  [^File root]
  (let [root-path (.toPath root)]
    (into {}
          (comp (filter (fn [^File f]
                          (and (.isFile f)
                               (str/ends-with? (.getName f) ".yaml"))))
                (map (fn [^File f]
                       [(str (.relativize root-path (.toPath f))) f])))
          (file-seq root))))

(defn- first-diff-line [^File a ^File b]
  (let [a-lines (str/split-lines (slurp a))
        b-lines (str/split-lines (slurp b))]
    (some (fn [[i [la lb]]]
            (when (not= la lb)
              (format "line %d: exported=%s\n           checked-in=%s" (inc i) (pr-str la) (pr-str lb))))
          (map-indexed vector (map vector a-lines (concat b-lines (repeat nil)))))))

(defn- create-tmp-dir ^File []
  (.toFile (Files/createTempDirectory "ia-export-test" (make-array FileAttribute 0))))

(deftest analytics-dev-export-matches-checked-in-test
  (testing "running the analytics-dev export produces bytes identical to the checked-in resources/instance_analytics tree"
    (let [tmp-dir     (create-tmp-dir)
          checked-in  (io/file "resources/instance_analytics")]
      (try
        (export/export! (.getAbsolutePath tmp-dir))
        (let [exported-files   (yaml-files-relative tmp-dir)
              checked-in-files (yaml-files-relative checked-in)
              exported-paths   (set (keys exported-files))
              checked-in-paths (set (keys checked-in-files))
              only-exported    (sort (set/difference exported-paths checked-in-paths))
              only-checked-in  (sort (set/difference checked-in-paths exported-paths))
              shared-paths     (sort (set/intersection exported-paths checked-in-paths))]
          (is (= [nil nil] (take 2 (data/diff only-checked-in only-exported))))
          (is (= [] only-exported)
              (str "files in the export that aren't checked in:\n  "
                   (str/join "\n  " only-exported)))
          (is (= [] only-checked-in)
              (str "files checked in that weren't produced by the export:\n  "
                   (str/join "\n  " only-checked-in)))
          (is (= [] (for [path shared-paths
                          :let [a (get exported-files path)
                                b (get checked-in-files path)]
                          :when (not= (slurp a) (slurp b))]
                      [path (first-diff-line a b)]))
              "Generated files should match checked-in files. You may need to regenerate checked-in files by running (export/export!)"))
        (finally
          (doseq [^File f (reverse (file-seq tmp-dir))]
            (.delete f)))))))

(comment
  ; Update the actual collection in `resources/instance_analytics`
  (export/export!))
