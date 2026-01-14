(ns mage.util-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :as t :refer [deftest is]]
   [mage.color :as c]
   [mage.util :as u]))

(def ^:private new-content "MAGE_UTIL_TEST_STRING")

(defn- add-content [file-path]
  (spit file-path new-content :append true))

(defn- remove-content [file-path]
  (spit file-path
        (-> (slurp file-path)
            (str/replace (re-pattern (str new-content "$")) ""))))

(deftest updated-files-returns-all-kinds-of-files
  (let [all-files (map str (fs/glob u/project-root-directory "**.*"))
        git-ignored-files (u/git-ignored-files all-files)
        ok-files (remove git-ignored-files all-files)
        extension->path (-> (group-by fs/extension ok-files)
                            (update-vals (comp str first))
                            (select-keys ["clj" "cljc" "cljs" "edn" "js" "ts" "jsx" "json" "css" "html" "md"]))]
    (doseq [[_ path] extension->path]
      (println
       (str "Testing that " (c/green "u/updated-files") " picks up changes to file:" (c/cyan path)))
      (try (add-content path)
           (is (contains? (set (u/updated-files)) (str/replace path (str u/project-root-directory "/") ""))
               (str "updated-files should include modified file: " path))
           (finally (remove-content path))))))

