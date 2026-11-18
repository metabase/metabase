(ns metabase.cmd.driver-feature-dox
  "Generate `docs/databases/feature-support.md`, the page that shows which database supports which feature:

    clojure -M:ee:drivers:doc driver-features-documentation

  The drivers supply the data. Each official driver is a column, with the name that its plugin manifest gives it. A
  cell is ✅ when the driver's [[driver/database-supports?]] says so for a fake database. The methods read only what
  sync stores on the database's row, mostly its `:dbms-version`, so the fake databases need no connections. When the
  answer changes with the version, a note gives the version where it changes.

  The curated `driver-features.edn` resource supplies the rows, and the few facts about drivers that the code can't
  supply.

  `:drivers` puts the driver modules on the classpath; `:ee` carries the Oracle JDBC classes; `:doc` runs in prod
  mode, because some drivers turn features off in tests."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/databases/feature-support.md")

(def ^:private intro-resource "metabase/cmd/resources/driver-features-intro.md")

(def ^:private config-resource "metabase/cmd/resources/driver-features.edn")

(defn- curated-config []
  (edn/read-string (cmd.common/load-resource! config-resource)))

(defn- config-problems
  "The mistakes in the curated `config`, as messages. A misspelled feature would print a row of ❌, because
  [[driver/database-supports?]] answers false for an unknown namespaced feature."
  [{:keys [drivers sections]}]
  (concat
   (for [{:keys [feature]} (mapcat :features sections)
         k                 (u/one-or-many feature)
         :when             (not (driver/features k))]
     (str "Not a driver feature: " k))
   (for [driver (keys drivers)
         :when  (not (driver.u/official-drivers (name driver)))]
     (str "Not an official driver: " driver))))

;;;; Columns

(defn- manifest-display-name
  "The name that the UI shows for `driver`: the `display-name` in its module's plugin manifest. Core drivers have no
  manifest."
  [driver]
  (when-let [manifest (io/resource (format "metabase/%s/metabase-plugin.yaml" (name driver)))]
    (with-open [r (io/reader manifest)]
      (some #(when (= (name driver) (:name %)) (:display-name %))
            (u/one-or-many (:driver (yaml/parse-stream r)))))))

(defn- columns
  "The table's columns, in label order: one for each official driver that isn't `:exclude`d in `drivers-config`, or
  one for each of its `:columns`."
  [drivers-config]
  (sort-by (comp u/lower-case-en :label)
           (for [driver (map keyword driver.u/official-drivers)
                 :let   [cfg (get drivers-config driver)]
                 :when  (not (:exclude cfg))
                 column (:columns cfg [{}])]
             (merge {:label (or (manifest-display-name driver)
                                (driver/display-name (driver/the-driver driver)))}
                    (dissoc cfg :columns)
                    column
                    {:driver driver}))))

;;;; Support

;; older and newer than any version that a driver checks for, so a driver answers for them as it does for its oldest
;; and newest real versions
(def ^:private default-oldest-version [1 0])

(def ^:private newest-version [999 0])

(defn- fake-database
  "`column`'s database in `edition` at `[major minor]`, as sync stores it. `:id` and `:lib/type` are there because
  `mu/defmethod`s like SQL Server's validate the metadata schema. Empty `:details` are the default connection
  settings: JSON unfolding, for example, reads its setting from there."
  [{:keys [driver dbms-version version-shape]} edition [major minor]]
  {:lib/type     :metadata/database
   :id           1
   :engine       driver
   :details      {}
   :dbms-version (assoc (merge dbms-version (:dbms-version edition))
                        :semantic-version (if (= version-shape :map)
                                            {:major major :minor minor}
                                            [major minor]))})

(defn- supports?
  "Whether `feature` works on `column`'s `edition` at `version`. A vector row, like JSON unfolding, works when any of
  its features does. Throws when the driver does."
  [{:keys [driver label] :as column} feature edition version]
  (let [database (fake-database column edition version)]
    (try
      ;; not `driver.u/supports?`, for two reasons. In prod mode, which the `:doc` alias runs in, it memoizes by
      ;; database `:id`. All fake databases have `:id` 1, so the first version asked would answer for all of them. It
      ;; also turns a throw into false, which would print a wrong ❌.
      #_{:clj-kondo/ignore [:discouraged-var]}
      (boolean (some #(driver/database-supports? driver % database) (u/one-or-many feature)))
      (catch Throwable e
        (throw (ex-info (format "Could not tell whether %s supports %s" label feature)
                        {:feature feature :database database}
                        e))))))

(defn- first-version
  "The lowest `[major minor]` at which `on?` is true, for an `on?` that is false for old versions and true for new ones."
  [on? [oldest-major]]
  (let [major (first (filter #(on? [% 999]) (range oldest-major 1000)))]
    [major (first (filter #(on? [major %]) (range 1000)))]))

(defn- edition-support
  "Which versions of `column`'s `edition` support `feature`: `:all`, `:none`, or the `[major minor]` where support
  starts."
  [{:keys [label oldest-version] :or {oldest-version default-oldest-version} :as column} feature edition]
  (let [on? #(supports? column feature edition %)]
    (case [(on? oldest-version) (on? newest-version)]
      [true true]   :all
      [false false] :none
      [false true]  (first-version on? oldest-version)
      [true false]  (throw (ex-info (format "%s stops supporting %s in a newer version, which a note can't say yet"
                                            label feature)
                                    {:column column :feature feature})))))

(defn- note
  "The note for a cell that only some versions or editions support, for example \"SQL Server 16.0 and later.\", from
  the `support` of each of `column`'s `editions`. A version in `version-names` shows as its name: \"SQL Server 2022
  and later.\""
  [{:keys [label version-names]} editions support]
  (let [since (fn [[major minor :as version]]
                (str " " (get version-names version (format "%d.%d" major minor)) " and later"))]
    (if (and (apply = support) (vector? (first support)))
      ;; every edition starts at the same version: "SQL Server 16.0 and later."
      (str label (since (first support)) ".")
      ;; or, name the editions that support it: "ClickHouse Cloud and self-managed single-node deployments."
      (str (str/join " and " (for [[edition s] (map vector editions support)
                                   :when       (not= s :none)]
                               (cond-> (:label edition)
                                 (vector? s) (str (since s)))))
           "."))))

(defn- cell
  "How `column` supports `feature`: `{:support :yes}`, `{:support :no}`, or `{:support :depends, :note ...}`."
  [{:keys [editions] :or {editions [{}]} :as column} feature]
  (let [support (mapv #(edition-support column feature %) editions)]
    (case (set support)
      #{:all}  {:support :yes}
      #{:none} {:support :no}
      {:support :depends :note (note column editions support)})))

;;;; Rendering

(defn- feature-label
  "The first cell of a feature's row: its label, linked to its docs when it has any."
  [{:keys [label doc]}]
  (if doc
    (md/link label doc)
    label))

(defn- section-markdown
  "One section of the page: a heading, a list of the features that every database supports, a table of the other
  features with a column per database, and the notes that the table's `:depends` cells point to. `rows` are
  `{:row <curated row> :cells [<cell> ...]}`."
  [title labels rows]
  (let [everywhere? (fn [{:keys [cells]}] (every? #(= :yes (:support %)) cells))
        ;; a row of ✅ only says that the feature works everywhere, and a list says that in less space
        everywhere  (filter everywhere? rows)
        table-rows  (remove everywhere? rows)
        ;; numbered in the order they first appear, row by row; cells that share a note share its number
        notes       (->> table-rows (mapcat :cells) (keep :note) distinct)
        number      (zipmap notes (iterate inc 1))
        mark        (fn [{s :support n :note}]
                      (case s
                        :yes     "✅"
                        :no      "❌"
                        :depends (str "✅ (" (number n) ")")))]
    (md/paragraphs
     [(md/heading 2 title)
      (when (seq everywhere)
        (md/labeled-block "Metabase supports these features on every database on this page:"
                          (md/bullets (map (comp feature-label :row) everywhere))))
      (when (seq table-rows)
        (md/table (cons "Feature" labels)
                  (for [{:keys [row cells]} table-rows]
                    (cons (feature-label row) (map mark cells)))))
      (when (seq notes)
        (str/join "\n" (map #(str (number %) ". " %) notes)))])))

(defn- document-markdown
  "The whole page: `intro`, then a section per curated section."
  [intro columns sections]
  (md/document
   (cons intro
         (for [{:keys [title features]} sections]
           (section-markdown title
                             (map :label columns)
                             (for [{:keys [feature] :as row} features]
                               {:row row :cells (map #(cell % feature) columns)}))))))

;;;; Entry point

(defn generate-dox!
  "Write the database feature support page to `path`, by default `docs/databases/feature-support.md`. Returns
  `{:path ... :databases n :features n}`. Throws, and writes nothing, in test mode or when the curated file has a
  mistake."
  ([]
   (generate-dox! output-path))
  ([path]
   (when config/is-test?
     (throw (ex-info (str "In test mode, drivers that turn features off in tests look unsupported. "
                          "Run with the :doc alias to write the page.")
                     {})))
   (printf "Generating database feature support documentation in %s\n" path)
   (let [{:keys [drivers sections] :as cfg} (curated-config)]
     (when-let [problems (seq (config-problems cfg))]
       (throw (ex-info (str "Change src/" config-resource " first:\n" (str/join "\n" problems))
                       {:problems problems})))
     (let [cols       (columns drivers)
           n-features (count (mapcat :features sections))]
       (cmd.common/write-doc-file! path (document-markdown (cmd.common/load-resource! intro-resource) cols sections))
       (printf "Wrote %s (%d databases, %d features)\n" path (count cols) n-features)
       (println "Done.")
       {:path path :databases (count cols) :features n-features}))))
