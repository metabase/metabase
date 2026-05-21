(ns mage.junit-hooks
  "Rewrite JUnit XML so Mocha-style hook failures are attributed to the
  underlying test. JUnit XML is emitted by several of our test suites (backend,
  Jest, Cypress); only Mocha's reporter (used by Cypress) labels a failing hook
  as `<suite> \"before each\" hook for \"<test name>\"`, which breaks downstream
  Trunk that keys on the test name. Files without that pattern pass through
  untouched. This strips the hook label from `name` and `classname`, leaving the
  failure body intact so the error is still preserved."
  (:require
   [babashka.fs :as fs]
   [clojure.data.xml :as xml]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [mage.color :as c]))

(set! *warn-on-reflection* true)

(def ^:private hook-re
  #"\"(?:before|after) (?:each|all)\" hook for \"([^\"]+)\"")

(defn- unhooked-name
  "`s` with the mocha hook label stripped, leaving the underlying test name.
  Non-strings (e.g. a missing attribute) pass through unchanged."
  [s]
  (if (string? s) (str/replace s hook-re "$1") s))

(defn- unhooked-attrs
  "`attrs` with the `:name`/`:classname` hook labels stripped if present, without
  materializing absent ones as nil."
  [attrs]
  (cond-> attrs
    (contains? attrs :name)      (update :name unhooked-name)
    (contains? attrs :classname) (update :classname unhooked-name)))

;; mocha-junit-reporter records the spec path as `file=` on the Root Suite
;; <testsuite>; that's the only place it appears in the document.
(defn- spec-file [doc]
  (->> (tree-seq map? :content doc)
       (keep (comp :file :attrs))
       first))

(defn- rewrite-doc
  "Returns [new-doc {:scanned n :rewrites [[before after] ...]}]."
  [doc]
  (let [scanned  (atom 0)
        rewrites (atom [])
        doc'     (walk/postwalk
                  (fn [n]
                    (if (and (map? n) (= :testcase (:tag n)))
                      (let [before (get-in n [:attrs :name])
                            after  (unhooked-name before)]
                        (swap! scanned inc)
                        (when (and (string? before) (not= after before))
                          (swap! rewrites conj [before after]))
                        (update n :attrs unhooked-attrs))
                      n))
                  doc)]
    [doc' {:scanned @scanned :rewrites @rewrites}]))

(defn- process-file! [file {:keys [dry-run includes]}]
  (let [doc  (xml/parse-str (slurp (str file)))
        spec (spec-file doc)]
    (if (and (seq includes)
             (not (some #(and spec (str/includes? spec %)) includes)))
      {:action (if spec :skipped-include :skipped-no-spec) :scanned 0 :rewrites [] :spec spec}
      (let [[doc' {:keys [scanned rewrites]}] (rewrite-doc doc)]
        (cond
          dry-run           {:action :dry-run :scanned scanned :rewrites rewrites :spec spec}
          (empty? rewrites) {:action :no-hooks :scanned scanned :rewrites rewrites :spec spec}
          :else             (do (spit (str file) (xml/emit-str doc'))
                                {:action :rewrote :scanned scanned :rewrites rewrites :spec spec}))))))

(defn- summary [path {:keys [action scanned rewrites spec]}]
  (let [n    (count rewrites)
        head (case action
               :rewrote          (str path ": rewrote " n "/" scanned)
               :dry-run          (str path ": dry-run would rewrite " n "/" scanned)
               :no-hooks         (str path ": no hooks (0/" scanned ")")
               :skipped-include  (str path ": skipped (" spec " did not match --include)")
               :skipped-no-spec  (str path ": skipped (no Root Suite file= attribute)"))]
    (->> (cons head (map (fn [[b a]] (str "  " b " -> " a)) rewrites))
         (str/join "\n"))))

(defn rewrite!
  "Entry point. `parsed` is {:options {...} :arguments [in-dir]}."
  [{{:keys [dry-run include]} :options [in-dir] :arguments}]
  (when-not (and in-dir (fs/directory? in-dir))
    (throw (ex-info (str "input-dir must be a directory, got " (pr-str in-dir))
                    {:babashka/exit 1})))
  (let [opts      {:dry-run (boolean dry-run) :includes (or include [])}
        files     (sort (map str (fs/glob in-dir "*.xml")))
        results   (mapv (fn [f]
                          (let [r (process-file! f opts)]
                            (binding [*out* *err*] (println (summary f r)))
                            r))
                        files)
        scanned   (reduce + (map :scanned results))
        rewritten (reduce + (map (comp count :rewrites) results))]
    (binding [*out* *err*]
      (println (c/green (str "total: " rewritten "/" scanned " rewritten across "
                             (count files) " files"))))))
