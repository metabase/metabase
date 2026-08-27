(ns dev.raw-splice
  "Scan HugSQL `.sql` files for raw-splice params (`:sql:`/`:snip:`/`:sqlvec:`/`:i(dentifier):`
  and their `*` variants), which splice unescaped/unquoted text and are banned outright.
  `metabase.app-db.hugsql` also disarms these param types at runtime; this scanner is the fast
  pre-CI catch.

  There is no allowlist: the ban is absolute. If a raw splice is ever genuinely needed, the PR
  that introduces it also introduces the exception mechanism and defends it -- until then, a
  config that allows nothing is just ceremony."
  {:clj-kondo/config '{:linters {:discouraged-var {clojure.core/println {:level :off}}}}}
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

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
  "Seq of {:path :found} for every `.sql` file under [[scan-roots]] that uses any raw-splice
  param. Empty when clean. Throws if a scan root is missing (a wrong cwd must fail loudly, not
  pass vacuously)."
  []
  (for [root  scan-roots
        :let  [dir (io/file root)]
        :when (or (.isDirectory dir)
                  (throw (ex-info (str "raw-splice scan root missing (wrong cwd?): " root)
                                  {:root root})))
        ^java.io.File f (file-seq dir)
        :when (and (.isFile f) (str/ends-with? (.getName f) ".sql"))
        :let  [found (raw-splice-params (slurp f))]
        :when (seq found)]
    {:path (.getPath f), :found found}))

(defn cli-check!
  "Entry point for the mage task: print violations and exit 1, or confirm clean."
  [_parsed]
  (let [vs (violations)]
    (if (seq vs)
      (do (doseq [{:keys [path found]} vs]
            (println (str path ": raw-splice params " (pr-str found) " are not allowed")))
          (println "Raw-splice params (:sql:/:snip:/:sqlvec:/:i:) are banned in .sql files; use :value/:value*.")
          (System/exit 1))
      (println "No raw splices found."))))
