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
  "Kondo run over `roots`, optionally with `linter` forced to `:warning`; returns findings as EDN maps
  (all of them when `linter` is nil, else just that type)."
  [linter roots]
  (let [config (pr-str (cond-> {:output {:format :edn}}
                         linter (assoc :linters {linter {:level :warning}})))
        {:keys [out]} (apply shell/sh* {:quiet? true}
                             "clojure" "-M:kondo" "--config" config "--lint" roots)
        findings (:findings (edn/read-string (str/join "\n" out)))]
    (cond->> findings
      linter (filter #(= (:type %) linter)))))

(defn- insert-ignore-lines
  "`text` with an ignore inserted above each 1-based row of `row->linters`, at matching indentation."
  [text row->linters]
  (let [ending (if (str/ends-with? text "\n") "\n" "")]
    (str (str/join "\n"
                   (reduce (fn [lines [row linters]]
                             (let [indent (re-find #"^\s*" (nth lines (dec row)))]
                               (into (conj (subvec lines 0 (dec row))
                                           (str indent "#_{:clj-kondo/ignore ["
                                                (str/join " " (sort-by str (distinct linters)))
                                                "]}"))
                                     (subvec lines (dec row)))))
                           (vec (str/split-lines text))
                           (sort-by key > row->linters)))
         ending)))

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

(defn- lsp-only?
  "Does the ignore form suppress only linters kondo doesn't run, so a re-lint could never restore it?"
  [linters]
  (boolean (and (seq linters)
                (every? #(= (namespace %) "clojure-lsp") linters))))

(defn- names-lsp?
  "Does the ignore form suppress any linter kondo doesn't run, so a re-lint could not fully restore it?"
  [linters]
  (boolean (some #(= (namespace %) "clojure-lsp") linters)))

(defn- remove-ignores-at
  "The inline ignore forms that start on the 1-based `rows` of `text`, removed.
  Forms that name any clojure-lsp/* linter survive ([[names-lsp?]]): the verify pass could never restore
  that half of the suppression. Forms whose matched span has unbalanced braces (nested maps the regex
  can't span) are skipped and reported under `:skipped` rather than corrupted.
  A line left whitespace-only by a removal is deleted; an inline removal also swallows one space.
  Returns `{:text _, :sites [{:row _, :linters _} ...], :skipped [rows...]}` — `:sites` carries the
  post-removal row of the form each ignore covered and the linters it named, so a verifying re-lint can
  tell exposed findings apart from unrelated pre-existing ones."
  [text rows]
  (let [rowset (set rows)
        masked (kondo-ratchet/mask-strings-and-comments text)
        balanced? (fn [{:keys [start end]}]
                    (let [span (subs masked start end)]
                      (= (count (filter #{\{} span))
                         (count (filter #{\}} span)))))
        {removable true, unbalanced false}
        (group-by balanced?
                  (->> (kondo-ratchet/ignore-matches text)
                       (filter (comp rowset :line))
                       (remove (comp names-lsp? :linters))))
        result (reduce (fn [{:keys [text] :as acc} {:keys [start end line linters]}]
                         (let [before     (subs text 0 start)
                               after      (subs text end)
                               after      (if (and (str/ends-with? before " ") (str/starts-with? after " "))
                                            (str/replace-first after #" +" "")
                                            after)
                               line-start (inc (or (str/last-index-of before "\n") -1))
                               line-end   (or (str/index-of after "\n") (count after))
                               remnant    (str (subs before line-start) (subs after 0 line-end))
                               blank?     (str/blank? remnant)]
                           (-> acc
                               (assoc :text (if blank?
                                              (str (subs before 0 line-start)
                                                   (subs after (min (count after) (inc line-end))))
                                              (str before after)))
                               (update :deletions conj [line
                                                        (if blank?
                                                          (inc (count (filter #(= % \newline) (subs text start end))))
                                                          0)
                                                        linters]))))
                       {:text text, :deletions []}
                       ;; bottom-up so earlier offsets stay valid
                       (sort-by :start > removable))
        post-removal-row (fn [line]
                           (- line (transduce (keep (fn [[l k]] (when (< l line) k))) + (:deletions result))))]
    {:text    (:text result)
     :sites   (for [[line _ linters] (:deletions result)]
                {:row     (post-removal-row line)
                 :linters linters})
     ;; adjusted like :sites, so warnings point at the rewritten file
     :skipped (map (comp post-removal-row :line) unbalanced)}))

(defn redundant-ignores
  "Report inline ignores kondo flags as redundant, dropping its two known false-positive classes:
  findings with no location, and ignores that only name linters kondo doesn't run (clojure-lsp/*).
  With `--fix`, remove the candidates from source."
  [parsed]
  (println "Running kondo with :redundant-ignore enabled (full lint, takes a minute or two)...")
  (let [findings (kondo-findings! :redundant-ignore lint-roots)
        {located true, homeless false} (group-by #(some? (:row %)) findings)
        {lsp-only true, candidates false}
        (group-by (fn [{:keys [filename row]}]
                    (lsp-only? (ignored-linters-at filename row)))
                  located)]
    (doseq [{:keys [filename row]} (sort-by (juxt :filename :row) candidates)]
      (println (format "%s:%d %s" filename row (str/join " " (ignored-linters-at filename row)))))
    (println)
    (println (format "%d candidate redundant ignores (dropped as false positives: %d location-less, %d lsp-only)"
                     (count candidates) (count homeless) (count lsp-only)))
    (when (and (get-in parsed [:options :fix]) (seq candidates))
      (let [files       (vec (sort (distinct (map :filename candidates))))
            sites       (into {}
                              (for [[file file-candidates] (group-by :filename candidates)]
                                (let [{:keys [text sites skipped]} (remove-ignores-at (slurp file)
                                                                                      (map :row file-candidates))]
                                  (spit file text)
                                  (doseq [row skipped]
                                    (println (format "WARNING: %s:%d skipped -- the ignore form's braces don't balance within the match; remove it by hand"
                                                     file row)))
                                  [file sites])))
            near-sites  (fn [{:keys [filename row]}]
                          (filter #(<= (abs (- row (:row %))) 5) (sites filename)))
            ;; a finding near a removed site, of a type the removed ignore named, was exposed by the
            ;; removal; anything further away is a pre-existing finding in a file the usual
            ;; `mage kondo` roots don't cover
            exposed?    (fn [{:keys [type] :as finding}]
                          (boolean (some #(some #{:all type} (:linters %)) (near-sites finding))))]
        (println (format "Removed them across %d files; re-linting those files to verify..." (count files)))
        ;; redundant-ignore can't see findings from hook-based linters, so some ignores it called
        ;; redundant were still doing work; restore those.
        (let [{regressions true, others false} (group-by exposed? (filter :row (kondo-findings! nil files)))
              mismatched (filter (comp seq near-sites) others)]
          (doseq [[file file-regressions] (sort-by key (group-by :filename regressions))]
            (spit file (insert-ignore-lines (slurp file)
                                            (-> (group-by :row file-regressions)
                                                (update-vals #(map :type %))))))
          (doseq [{:keys [filename row type]} (sort-by (juxt :filename :row) mismatched)]
            (println (format "WARNING: %s:%d has a new %s finding near a removed ignore that named other linters -- fix or re-ignore by hand"
                             filename row type)))
          (if (empty? regressions)
            (println "Verified: the removals exposed no findings.")
            (println (format "Restored ignores at %d sites where a finding reappeared (%s)."
                             (count (distinct (map (juxt :filename :row) regressions)))
                             (str/join ", " (sort (distinct (map :type regressions))))))))
        (println "Now run `./bin/mage fix-kondo-ratchets` to update the budgets, and `./bin/mage kondo`
for the final word (a finding deep inside a large ignored form can escape the nearby-site check).")))))

;;;; ---------------------------------------------------------------------------
;;;; kondo-insert-ignores
;;;; ---------------------------------------------------------------------------

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
      (spit file (insert-ignore-lines (slurp file) (zipmap (map :row fs) (repeat [linter]))))
      (println (format "%s: %d inserted" file (count (distinct (map :row fs))))))
    (println)
    (if (empty? by-file)
      (println "No findings; nothing inserted.")
      (println (format "Inserted %d ignores across %d files. Now seed the budget:\n  ./bin/mage fix-kondo-ratchets --seed %s"
                       (count (distinct (map (juxt :filename :row) findings)))
                       (count by-file)
                       linter)))))
