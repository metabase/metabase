(ns metabase.cmd.driver-feature-dox
  "Generate the page that shows which database supports which feature, by running

    clojure -M:ee:drivers:doc driver-features-documentation

  Which database supports a feature comes from each driver's [[driver/database-supports?]] methods. What the page
  calls a feature, how it groups the features, and which features it leaves out come from the hand-curated
  `driver-features.edn` resource. The `:drivers` alias puts the driver modules on the classpath; `:ee` carries the
  Oracle JDBC classes the Oracle driver imports; `:doc` runs in prod mode, which matters because a few drivers turn
  features off in tests."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/databases/feature-support.md")

(def ^:private intro-resource "metabase/cmd/resources/driver-features-intro.md")

(def ^:private config-resource "metabase/cmd/resources/driver-features.edn")

(defn- config
  "The curated half of the page: `{:drivers [...] :sections [...] :internal #{...}}`. See the resource's header."
  []
  (edn/read-string (cmd.common/load-resource! config-resource)))

;;;; Support

(def ^:private dbms-versions
  "The `:dbms-version` of the two fake databases each driver is asked about. Most drivers answer the same for both;
  the ones that check the version, or whether they're talking to a cloud offering, are the reason there are two.
  Asking a fake database is what lets this run without a connection: the methods that care about the database only
  read what sync stored on its row. Only the newest one is a cloud offering, so a feature that only new self-hosted
  versions support would read as unsupported on both."
  {:newest {:semantic-version [999 0] :cloud true}
   :oldest {:semantic-version [1 0]   :cloud false}})

(defn- fake-database
  "The `age` (`:newest` or `:oldest`) database that `column` — a `:drivers` entry — is asked about."
  [{:keys [driver dbms-version] :as column} age]
  {:lib/type     :metadata/database
   :id           1
   :engine       driver
   :details      {}
   ;; the column's own version shape wins: ClickHouse keeps `{:major :minor}` where everything else keeps a vector
   :dbms-version (merge (dbms-versions age) dbms-version (get column age))})

(defn- supports?
  "Whether the `age` database in `column` supports `feature`, or any of them when `feature` is a vector — a row the
  page treats as one feature, like JSON unfolding, which some drivers declare as `:nested-fields`. Throws rather than
  guessing when the driver does, so a method that can't answer for a fake database stops the run instead of writing
  a wrong cell."
  [{:keys [driver label] :as column} feature age]
  (if (vector? feature)
    (boolean (some #(supports? column % age) feature))
    (let [database (fake-database column age)]
      (try
        ;; not `driver.u/supports?`: it turns a throwing method into `false`, which would print a wrong ❌, and it
        ;; memoizes by database ID, which both fake databases share
        #_{:clj-kondo/ignore [:discouraged-var]}
        (boolean (driver/database-supports? driver feature database))
        (catch Throwable e
          (throw (ex-info (format "Could not tell whether %s supports %s" label feature)
                          {:column column :feature feature :database database}
                          e)))))))

(defn- support
  "How the database in `column` supports `feature`: `:yes`, `:no`, or `:depends` when the newest and oldest databases
  answer differently."
  [column feature]
  (let [newest? (supports? column feature :newest)
        oldest? (supports? column feature :oldest)]
    (cond
      (not= newest? oldest?) :depends
      newest?                :yes
      :else                  :no)))

(defn- note
  "The footnote for a `:depends` cell: the column's curated note, or a general one when there is none."
  [{:keys [label notes]} feature]
  (or (get notes feature)
      (do
        (log/warnf "No note for %s and %s, whose support depends on the database version. Add one to %s."
                   label feature config-resource)
        (str "On " label ", depends on the database version."))))

;;;; Rendering

(defn- feature-label
  "The first cell of a feature's row: its label, linked to its docs when it has any."
  [{:keys [label doc]}]
  (if doc
    (md/link label doc)
    label))

(defn- section-markdown
  "One section of the page: a heading, a table with a row per feature and a column per database, and the notes that
  the table's `:depends` cells point to."
  [{:keys [title features]} columns]
  (let [rows   (for [{:keys [feature] :as row} features]
                 {:row   row
                  :cells (for [column columns
                               :let [s (support column feature)]]
                           {:support s
                            :note    (when (= s :depends)
                                       (note column feature))})})
        ;; numbered in the order they first appear, reading the table row by row; a note several cells share is
        ;; printed once
        notes  (into [] (comp (mapcat :cells) (keep :note) (distinct)) rows)
        number (zipmap notes (iterate inc 1))
        cell   (fn [{s :support n :note}]
                 (case s
                   :yes     "✅"
                   :no      "❌"
                   :depends (str "✅ (" (number n) ")")))]
    (md/paragraphs
     [(md/heading 2 title)
      (md/table (cons "Feature" (map :label columns))
                (for [{:keys [row cells]} rows]
                  (cons (feature-label row) (map cell cells))))
      (when (seq notes)
        (str/join "\n" (map #(str (number %) ". " %) notes)))])))

(defn- document-markdown
  "The whole page: the `intro` resource, then a section per curated section."
  [intro {:keys [drivers sections]}]
  (md/document (cons intro (map #(section-markdown % drivers) sections))))

;;;; Entry point

(defn generate-dox!
  "Write the database feature support page to `path`, defaulting to `docs/databases/feature-support.md`. Returns
  `{:path ... :databases n :features n}`."
  ([]
   (generate-dox! output-path))
  ([path]
   (printf "Generating database feature support documentation in %s\n" path)
   (when-not config/is-prod?
     (log/warn "Not running in prod mode, so drivers that turn features off in dev or tests will look unsupported."
               "Run with the :doc alias to write the page."))
   (let [{:keys [drivers sections] :as cfg} (config)
         n-databases (count drivers)
         n-features  (count (mapcat :features sections))]
     (cmd.common/write-doc-file! path (document-markdown (cmd.common/load-resource! intro-resource) cfg))
     (printf "Wrote %s (%d databases, %d features)\n" path n-databases n-features)
     (println "Done.")
     {:path path :databases n-databases :features n-features})))
