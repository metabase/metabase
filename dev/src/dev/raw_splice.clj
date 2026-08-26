(ns dev.raw-splice
  "Scan HugSQL `.sql` files under `src/` for raw-splice params (`:sql:`/`:snip:` and their `*`
  variants), which are banned outside the allowlist in [[allowlist-file]].

  Shared between the fast `./bin/mage lint-raw-splices` task (babashka, sub-second feedback)
  and the authoritative CI test
  [[metabase.task-history.models.task-history-queries-test/raw-splice-lint-test]]."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(def allowlist-file
  "path -> set of allowed raw-splice param names. See the file itself for the rules on adding
  an entry."
  "mage/resources/raw-splice-allowlist.edn")

(defn raw-splice-params
  "Return the set of raw-splice param names (`:sql:x`, `:snip:x`, `:sql*:x`, `:snip*:x`) used in
  SQL text `s`. SQL comment lines are ignored so prose about the params doesn't count."
  [s]
  (->> (str/split-lines s)
       (remove #(str/starts-with? (str/triml %) "--"))
       (mapcat #(re-seq #":(?:sql|snip)\*?:([^\s,)]+)" %))
       (into #{} (map second))))

(defn violations
  "Seq of {:path :found :allowed} for every `.sql` file under `src/` whose raw-splice params
  don't exactly match its allowlist entry. Empty when the tree is clean."
  []
  (let [allowlist (edn/read-string (slurp allowlist-file))]
    (for [^java.io.File f (file-seq (io/file "src"))
          :when (and (.isFile f) (str/ends-with? (.getName f) ".sql"))
          :let  [path    (.getPath f)
                 found   (raw-splice-params (slurp f))
                 allowed (get allowlist path #{})]
          :when (not= found allowed)]
      {:path path, :found found, :allowed allowed})))

(defn cli-check
  "Entry point for the mage task: print violations and exit 1, or confirm clean."
  [_parsed]
  (let [vs (violations)]
    (if (seq vs)
      (do (doseq [{:keys [path found allowed]} vs]
            (println (str path ": raw-splice params " (pr-str found)
                          " do not match allowlist " (pr-str allowed))))
          (println (str "Raw-splice params are banned in .sql files; if one is genuinely needed,"
                        " add it to " allowlist-file " and defend it in the PR."))
          (System/exit 1))
      (println "No raw splices outside the allowlist."))))
