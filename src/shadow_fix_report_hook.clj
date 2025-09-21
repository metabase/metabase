(ns shadow-fix-report-hook
  (:require [clojure.java.io :as io]
            [clojure.string :as str]))

(defn create-sourcemap-if-missing
  "Create an empty .js.map file if it doesn't exist for the given 0-length JS file."
  [js-file]
  (let [map-file (str (.getAbsolutePath js-file) ".map")
        js-filename (.getName js-file)]
    (when (and (not (.exists (io/file map-file)))
               (= (.length js-file) 0))
      (let [sourcemap-content (format "{
  \"version\": 3,
  \"file\": \"%s\",
  \"sources\": [],
  \"mappings\": \"\",
  \"names\": []
}" js-filename)]
        (println (str "Creating source map for empty JS file: " map-file))
        (spit map-file sourcemap-content)))))

(defn process-output-dir
  "Find all 0-length .js files in output directory and create missing .js.map files"
  [output-dir]
  (when (.exists (io/file output-dir))
    (let [empty-js-files (->> (file-seq (io/file output-dir))
                              (filter #(and (.isFile %)
                                            (= 0 (.length %))
                                            (str/ends-with? (.getName %) ".js"))))]
      (doseq [js-file empty-js-files]
        (create-sourcemap-if-missing js-file)))))

(defn hook
  {:shadow.build/stage :flush}
  [build-state]
  (let [output-dir (get-in build-state [:shadow.build/config :output-dir])]
    (when output-dir
      (println "Running shadow-fix-report-hook...")
      (process-output-dir output-dir)))
  build-state)
