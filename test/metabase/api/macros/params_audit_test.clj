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
  (let [stem (-> (name nmspace) (str/replace "-" "_") (str/replace "." "/"))]
    (first (for [root ["src" "enterprise/backend/src" "dev/src" "test"]
                 ext  [".clj" ".cljc"]
                 :let [path (str stem ext)]
                 :when (.exists (io/file root path))]
             (str root "/" path)))))

(defn- line-of
  "Line in `file` of the first line matching one of `needles`, so the report points at the code."
  [file needles]
  (when file
    (with-open [r (io/reader file)]
      (->> (line-seq r)
           (keep-indexed (fn [i line]
                           (when (some #(str/includes? line %) needles)
                             (inc i))))
           first))))

(defn- at [file line]
  (str (or file "?") (when line (str ":" line))))

(defn- describe-path [path]
  (if (empty? path)
    "the schema itself"
    (str "at " (str/join " > " (map pr-str path)))))

(defn- endpoint-report
  "Findings for maps written inline in an endpoint, grouped by endpoint."
  [own]
  (str/join
   "\n"
   (for [[{:keys [ns method route]} findings] (sort-by (comp str :ns key) own)
         :let [file (ns-file ns)]]
     (str (format "  %-6s %-44s %s" (str/upper-case (name method)) route
                  (at file (line-of file [(format "defendpoint %s %s" method (pr-str route))
                                          (format "defendpoint %s [%s" method (pr-str route))])))
          (str/join (for [[param-type ms] findings
                          {:keys [path]}  ms]
                      (format "\n      %-7s %s" (name param-type) (describe-path path))))))))

(defn- shared-report
  "Findings for maps inside a shared registry schema, grouped by the schema that owns them -- one entry however many
  endpoints reach it."
  [shared]
  (str/join
   "\n"
   (for [[schema-name ms] (sort-by (comp str key) shared)
         :let [file (ns-file (namespace schema-name))
               line (line-of file [(str "mr/def ::" (name schema-name))
                                   (str "mr/def " schema-name)])]]
     (str (format "  %s\n      %s, reached by %d endpoint(s)"
                  schema-name (at file line) (count (:endpoints ms)))
          (str/join (for [path (sort-by str (:paths ms))]
                      (format "\n      %s" (describe-path path))))))))

(defn- split-findings
  "Findings recorded by the audit, split into ones an endpoint owns and ones a shared schema owns."
  [findings]
  (reduce
   (fn [acc [location by-param]]
     (reduce
      (fn [acc [param-type ms]]
        (reduce
         (fn [acc {:keys [schema path]}]
           (if schema
             (-> acc
                 (update-in [:shared schema :paths] (fnil conj #{}) path)
                 (update-in [:shared schema :endpoints] (fnil conj #{}) location))
             (update-in acc [:own location param-type] (fnil conj []) {:path path})))
         acc
         ms))
      acc
      by-param))
   {:own {} :shared {}}
   findings))

(deftest ^:parallel every-param-map-is-explicitly-closed-or-open-test
  (testing (str "Every `:map` reachable from a `defendpoint` param schema should say `{:closed true}`, so that a "
                "param the endpoint doesn't declare is rejected, or `{:closed false}` where it genuinely accepts "
                "anything. A shared schema that has to stay open for internal callers wants an API-layer sibling "
                "that is closed, the way `::qp.schema/api-query` sits alongside `::qp.schema/any-query`.")
    (let [{:keys [own shared]} (split-findings @params-audit/findings)]
      (is (and (empty? own) (empty? shared))
          (str "\n" (count own) " endpoint(s) with an unmarked `:map` written inline:\n"
               (endpoint-report own)
               "\n\n" (count shared) " shared schema(s) with an unmarked `:map`, reached through a ref:\n"
               (shared-report shared))))))
