(ns dev.raw-splice
  "Scan HugSQL `.sql` files for the two constructs that can put text a param never escaped into a
  statement:

  1. Raw-splice params (`:sql:`/`:snip:`/`:sqlvec:`/`:i(dentifier):` and their `*` variants).
     `metabase.app-db.hugsql` also disarms these at runtime; this scanner is the fast pre-CI catch.

  2. Clojure expressions (`--~ (...)` and `/*~ ... ~*/`). These are strictly worse than a raw
     splice and are NOT catchable at the param layer, which is why they need their own check.
     `hugsql.core/def-expr` builds a *string of Clojure source* and `load-string`s it, so an
     expression is arbitrary code execution at query-build time, and its return value is spliced
     into the SQL text besides. The `:require` header is interpolated into that generated `ns`
     form, so an expression can also pull in arbitrary namespaces.

  There is no allowlist: both bans are absolute. If either is ever genuinely needed, the PR that
  introduces it also introduces the exception mechanism and defends it -- until then, a config
  that allows nothing is just ceremony."
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

;; Mirrors hugsql.parser: after a `--` or `/*` comment opener it skips whitespace, then a `~`
;; starts an expression. So `--~ (...)`, `--   ~(...)` and `/*~ ... ~*/` are all expressions and
;; all must match; a bare `~` in SQL text must not.
(def ^:private clojure-expr-re
  #"(?:--|/\*)\s*~")

(defn raw-splice-params
  "Return the set of raw-splice param names used in SQL text `s`. Full-line SQL comments are
  ignored so prose about the params doesn't count."
  [s]
  (->> (str/split-lines s)
       (remove #(str/starts-with? (str/triml %) "--"))
       (mapcat #(re-seq raw-splice-re %))
       (into #{} (map second))))

(defn clojure-exprs
  "Return the seq of Clojure-expression comment openers in SQL text `s`, or nil when there are
  none. Unlike [[raw-splice-params]] this deliberately does NOT skip comment lines -- an
  expression *is* a comment, so skipping them would scan past the very thing being banned."
  [s]
  (seq (re-seq clojure-expr-re s)))

(defn violations
  "Seq of `{:path :found :exprs}` for every `.sql` file under [[scan-roots]] that uses a
  raw-splice param or a Clojure expression. Empty when clean. Throws if a scan root is missing (a
  wrong cwd must fail loudly, not pass vacuously)."
  []
  (for [root  scan-roots
        :let  [dir (io/file root)]
        :when (or (.isDirectory dir)
                  (throw (ex-info (str "raw-splice scan root missing (wrong cwd?): " root)
                                  {:root root})))
        ^java.io.File f (file-seq dir)
        :when (and (.isFile f) (str/ends-with? (.getName f) ".sql"))
        :let  [sql   (slurp f)
               found (raw-splice-params sql)
               exprs (clojure-exprs sql)]
        :when (or (seq found) (seq exprs))]
    (cond-> {:path (.getPath f)}
      (seq found) (assoc :found found)
      (seq exprs) (assoc :exprs (count exprs)))))

(defn cli-check!
  "Entry point for the mage task: print violations and exit 1, or confirm clean."
  [_parsed]
  (let [vs (violations)]
    (if (seq vs)
      (do (doseq [{:keys [path found exprs]} vs]
            (when (seq found)
              (println (str path ": raw-splice params " (pr-str found) " are not allowed")))
            (when exprs
              (println (str path ": " exprs " Clojure expression(s) (--~ or /*~) are not allowed"))))
          (println "Raw-splice params (:sql:/:snip:/:sqlvec:/:i:) are banned in .sql files; use :value/:value*.")
          (println "Clojure expressions are banned outright: HugSQL load-strings them, so they are arbitrary")
          (println "code execution at query-build time, and their return value is spliced into the SQL.")
          (System/exit 1))
      (println "No raw splices or Clojure expressions found."))))
