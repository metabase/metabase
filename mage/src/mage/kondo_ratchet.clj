(ns mage.kondo-ratchet
  "Tooling around the inline ignore ratchets that needs a real kondo run (slow: a minute or two):
  report ignores kondo considers redundant, and bulk-insert ignores when landing a new linter."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [dev.kondo-ratchet :as kondo-ratchet]
   [mage.shell :as shell]))

(set! *warn-on-reflection* true)

(def ^:private lint-roots
  ["src" "test" "enterprise/backend" "modules/drivers" "dev" "bin" "mage"])

(defn- kondo-findings!
  "Full kondo run over `roots` with `linter` forced to `:warning`; returns findings of that type."
  [linter roots]
  (let [config (pr-str {:linters {linter {:level :warning}}
                        :output  {:format :edn}})
        {:keys [out]} (apply shell/sh* {:quiet? true}
                             "clojure" "-M:kondo" "--config" config "--lint" roots)]
    (filter #(= (:type %) linter)
            (:findings (edn/read-string (str/join "\n" out))))))

;;;; ---------------------------------------------------------------------------
;;;; kondo-redundant-ignores
;;;; ---------------------------------------------------------------------------

(defn- ignored-linters-at
  "Linter keywords named by the ignore form at `row` of `file`; reads a couple of extra lines since the
  vector may wrap."
  [file row]
  (let [lines (vec (str/split-lines (slurp file)))]
    (kondo-ratchet/line-linters
     (str/join "\n" (subvec lines (dec row) (min (count lines) (+ row 2)))))))

(defn redundant-ignores
  "Report inline ignores kondo flags as redundant, dropping its two known false-positive classes:
  findings with no location, and ignores that only name linters kondo doesn't run (clojure-lsp/*)."
  [_args]
  (println "Running kondo with :redundant-ignore enabled (full lint, takes a minute or two)...")
  (let [findings (kondo-findings! :redundant-ignore lint-roots)
        {located true, homeless false} (group-by #(some? (:row %)) findings)
        {lsp-only true, candidates false}
        (group-by (fn [{:keys [filename row]}]
                    (let [linters (ignored-linters-at filename row)]
                      (and (seq linters)
                           (every? #(= (namespace %) "clojure-lsp") linters))))
                  located)]
    (doseq [{:keys [filename row]} (sort-by (juxt :filename :row) candidates)]
      (println (format "%s:%d %s" filename row (str/join " " (ignored-linters-at filename row)))))
    (println)
    (println (format "%d candidate redundant ignores (dropped as false positives: %d location-less, %d lsp-only)"
                     (count candidates) (count homeless) (count lsp-only)))))

;;;; ---------------------------------------------------------------------------
;;;; kondo-insert-ignores
;;;; ---------------------------------------------------------------------------

(defn- insert-ignore-lines
  "`text` with an ignore for `linter` inserted above each of the 1-based `rows`, at matching indentation."
  [text linter rows]
  (let [ending (if (str/ends-with? text "\n") "\n" "")]
    (str (str/join "\n"
                   (reduce (fn [lines row]
                             (let [indent (re-find #"^\s*" (nth lines (dec row)))]
                               (into (conj (subvec lines 0 (dec row))
                                           (str indent "#_{:clj-kondo/ignore [" linter "]}"))
                                     (subvec lines (dec row)))))
                           (vec (str/split-lines text))
                           (sort > (distinct rows))))
         ending)))

(defn insert-ignores
  "Insert an inline ignore above every site `linter` flags, so a new linter can land without a big-bang
  fix. Args: `LINTER [PATHS...]`; paths default to the usual lint roots."
  [[linter-arg & paths]]
  (when (str/blank? (str linter-arg))
    (throw (ex-info "Usage: ./bin/mage kondo-insert-ignores LINTER [PATHS...]" {:exit-code 1})))
  (let [linter   (keyword (str/replace-first linter-arg #"^:" ""))
        roots    (or (seq paths) lint-roots)
        _        (println (format "Running kondo with %s enabled over %s..." linter (str/join " " roots)))
        findings (kondo-findings! linter roots)
        by-file  (group-by :filename findings)]
    (doseq [[file fs] (sort-by key by-file)]
      (spit file (insert-ignore-lines (slurp file) linter (map :row fs)))
      (println (format "%s: %d inserted" file (count (distinct (map :row fs))))))
    (println)
    (if (empty? by-file)
      (println "No findings; nothing inserted.")
      (println (format "Inserted %d ignores across %d files. Now seed the budget:\n  ./bin/mage fix-kondo-ratchets --seed %s"
                       (count (distinct (map (juxt :filename :row) findings)))
                       (count by-file)
                       linter)))))
