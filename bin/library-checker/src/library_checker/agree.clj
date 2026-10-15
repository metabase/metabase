(ns library-checker.agree
  "Compares the checker jar in babashka with the checker on the JVM, on the golden variants of
  `metabase-enterprise.library-branching.golden`. The JVM side runs with the Clojure CLI of the repository, so it uses
  the malli of the Metabase build."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [library-checker.build :as build]))

(set! *warn-on-reflection* true)

(defn- bb-executable
  []
  (-> (java.lang.ProcessHandle/current) .info .command (.orElse "bb")))

(defn jvm-results!
  "Writes the golden variants under `dir` with the checker on the JVM. Returns `{:dir d :results r}`: `d` holds a
  directory for each variant, and `r` is `{name {:exit e :lines [line ...]}}`, the result of the JVM on each."
  [dir]
  (let [results (fs/file dir "jvm.edn")
        out     (fs/file dir "variants")]
    (p/shell {:dir (str (build/repository-root))}
             "clojure" "-X:ee:ee-dev" "metabase-enterprise.library-branching.golden/write-results!"
             ":out" (pr-str (str out)) ":results" (pr-str (str results)))
    {:dir out :results (edn/read-string (slurp results))}))

(defn jar-result
  "`{:exit e :lines [line ...]}` of the checker `jar` in babashka on directory `checkout`, run in directory `cwd`."
  [jar cwd checkout]
  (let [{:keys [exit out]} (p/shell {:dir (str cwd) :in "" :out :string :err :inherit :continue true}
                                    (bb-executable) (str jar) (str checkout))]
    {:exit exit :lines (str/split-lines out)}))

(defn differences
  "The variants whose results differ in `jvm` and `jar`, both `{name result}`: `[{:variant n :jvm r :jar r'}]`."
  [jvm jar]
  (vec (for [n     (sort (into (set (keys jvm)) (keys jar)))
             :when (not= (get jvm n) (get jar n))]
         {:variant n :jvm (get jvm n) :jar (get jar n)})))

(defn -main
  "`[--jar <jar>]`: compares the jar (default: the default jar of the build) with the JVM. Prints each difference;
  exits 0 when all variants agree, 1 when one differs, 2 when the jar is missing or there is no variant."
  [& args]
  (let [[flag path] args
        jar         (fs/absolutize (if (= "--jar" flag) path (fs/path (build/repository-root) build/default-jar)))]
    (when-not (fs/exists? jar)
      (binding [*out* *err*] (println "No jar at" (str jar) "; run the build task first."))
      (System/exit 2))
    (let [tmp (fs/create-temp-dir {:prefix "library-checker-agree-"})]
      (try
        (let [{:keys [dir results]} (jvm-results! tmp)
              cwd                   (doto (fs/file tmp "cwd") fs/create-dirs)
              jar-results           (into (sorted-map)
                                          (for [n (keys results)]
                                            [n (jar-result jar cwd (fs/file dir n))]))
              diffs                 (differences results jar-results)]
          (doseq [d diffs] (println (pr-str d)))
          (cond
            (empty? results) (do (println "no variant") (System/exit 2))
            (seq diffs)      (do (println "differ:" (count diffs) "of" (count results) "variants") (System/exit 1))
            :else            (println "agree:" (count results) "variants")))
        (finally (fs/delete-tree tmp))))))
