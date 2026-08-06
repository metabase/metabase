(ns metabase.api.macros.params-audit-test
  "TEMPORARY, alongside [[metabase.api.macros.params-audit]]. Fails while any `defendpoint` param schema still has a
  `:map` that says neither `{:closed true}` nor `{:closed false}`, and prints where to find each one."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   ;; loading the route namespaces is what populates the audit -- an endpoint in a namespace nothing has required
   ;; yet is not recorded, so this test only sees as much of the API as the test run has loaded
   [metabase.api-routes.core]
   [metabase.api.macros.params-audit :as params-audit]))

(set! *warn-on-reflection* true)

(defn- ns-file
  "The source file for `nmspace`, looked up the way the classpath lays it out."
  [nmspace]
  (let [path (-> (name nmspace) (str/replace "-" "_") (str/replace "." "/") (str ".clj"))]
    (some (fn [root]
            (let [f (io/file root path)]
              (when (.exists f) (str root "/" path))))
          ["src" "enterprise/backend/src" "dev/src" "test"])))

(defn- defendpoint-line
  "Line of the `defendpoint` form for `method` and `route` in `file`, so the report points at the code."
  [file method route]
  (when file
    (with-open [r (io/reader file)]
      (let [needle (format "defendpoint %s %s" method (pr-str route))
            ;; a route with regexes is written as a vector whose first element is the path
            alt    (format "defendpoint %s [%s" method (pr-str route))]
        (->> (line-seq r)
             (keep-indexed (fn [i line]
                             (when (or (str/includes? line needle)
                                       (str/includes? line alt))
                               (inc i))))
             first)))))

(defn- describe-path
  "Where inside a param schema an unmarked map sits: the schema itself, or the route through it to the nested one."
  [path]
  (if (empty? path)
    "the param schema itself"
    (str "at " (str/join " > " (map pr-str path)))))

(defn- report-line [[{:keys [ns method route]} found]]
  (let [file (ns-file ns)]
    (str (format "  %-6s %-44s %s%s"
                 (str/upper-case (name method))
                 route
                 (or file (str ns))
                 (if-let [line (defendpoint-line file method route)] (str ":" line) ""))
         (str/join (for [[param-type paths] found
                         path               paths]
                     (format "\n      %-7s %s" (name param-type) (describe-path path)))))))

(deftest ^:parallel every-param-map-is-explicitly-closed-or-open-test
  (testing (str "Every `:map` in a `defendpoint` param schema should say `{:closed true}`, so that a param the "
                "endpoint doesn't declare is rejected, or `{:closed false}` where it genuinely accepts anything. "
                "A path below is the malli path to the unmarked map inside that endpoint's schema; `[]` means the "
                "param schema itself.")
    (let [found @params-audit/findings]
      (is (empty? found)
          (str "defendpoint param schemas with an unmarked `:map` (" (count found) " endpoints):\n"
               (str/join "\n" (map report-line (sort-by (juxt (comp str :ns key) (comp str :route key)) found))))))))
