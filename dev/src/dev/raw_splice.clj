(ns dev.raw-splice
  "Scan HugSQL `.sql` files for raw-splice params (`:sql:`/`:snip:`/`:sqlvec:`/`:i(dentifier):`
  and their `*` variants), which splice unescaped/unquoted text and are banned outside the
  allowlist in [[allowlist-file]]. `metabase.app-db.hugsql` also disarms these param types at
  runtime; this scanner is the fast pre-CI catch."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def allowlist-file
  "path -> set of allowed raw-splice param names. See the file itself for the rules on adding
  an entry."
  "mage/resources/raw-splice-allowlist.edn")

(def ^:private scan-roots
  "Source trees whose `.sql` files are scanned."
  ["src" "enterprise/backend/src"])

;; Every raw-splice param type disarmed in metabase.app-db.hugsql, so lint and runtime agree.
(def ^:private raw-splice-re
  #":(?:sql|snip|sqlvec|i|identifier)\*?:([^\s,)]+)")

(defn raw-splice-params
  "Return the set of raw-splice param names used in SQL text `s`. Full-line SQL comments are
  ignored so prose about the params doesn't count."
  [s]
  (->> (str/split-lines s)
       (remove #(str/starts-with? (str/triml %) "--"))
       (mapcat #(re-seq raw-splice-re %))
       (into #{} (map second))))

(defn violations
  "Seq of {:path :found :allowed} for every `.sql` file under [[scan-roots]] whose raw-splice
  params don't exactly match its allowlist entry. Empty when clean. Throws if a scan root is
  missing (a wrong cwd must fail loudly, not pass vacuously)."
  []
  (let [allowlist (edn/read-string (slurp allowlist-file))]
    (for [root  scan-roots
          :let  [dir (io/file root)]
          :when (or (.isDirectory dir)
                    (throw (ex-info (str "raw-splice scan root missing (wrong cwd?): " root)
                                    {:root root})))
          ^java.io.File f (file-seq dir)
          :when (and (.isFile f) (str/ends-with? (.getName f) ".sql"))
          :let  [path    (.getPath f)
                 found   (raw-splice-params (slurp f))
                 allowed (get allowlist path #{})]
          :when (not= found allowed)]
      {:path path, :found found, :allowed allowed})))

(defn cli-check!
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
