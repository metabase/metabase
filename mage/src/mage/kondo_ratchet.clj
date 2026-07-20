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

(def keep-marker
  "Comment token marking an ignore as a verified `:redundant-ignore` false positive.
  Sites carrying it are skipped by [[redundant-ignores]] unless `--audit` rechecks them."
  "[kondo-keep]")

(def ^:private keep-comment
  (str ";; " keep-marker " suppresses a warning :redundant-ignore can't see; --audit rechecks"))

(defn- marker-on-line?
  "Is [[keep-marker]] on `line` as (part of) a comment? A `;` must precede it, so the marker occurring
  inside a plain string literal doesn't count."
  [line]
  (boolean (when-let [i (str/index-of (str line) keep-marker)]
             (str/includes? (subs (str line) 0 i) ";"))))

(defn- marked-row?
  "Does the ignore starting on 1-based `row` of `lines` carry [[keep-marker]] -- on the line directly
  above, or trailing on the ignore's own line?"
  [lines row]
  (boolean (some marker-on-line? [(get lines (- row 2)) (get lines (dec row))])))

(defn- insert-ignore-lines
  "`text` with an ignore inserted above each 1-based row of `row->linters`, at matching indentation.
  A row in `row->comment` gets that comment line inserted above its ignore."
  ([text row->linters]
   (insert-ignore-lines text row->linters {}))
  ([text row->linters row->comment]
   (let [ending (if (str/ends-with? text "\n") "\n" "")]
     (str (str/join "\n"
                    (reduce (fn [lines [row linters]]
                              (let [indent (re-find #"^\s*" (nth lines (dec row)))
                                    added  (cond->> [(str indent "#_{:clj-kondo/ignore ["
                                                          (str/join " " (sort-by str (distinct linters)))
                                                          "]}")]
                                             (row->comment row) (cons (str indent (row->comment row))))]
                                (into (into (subvec lines 0 (dec row)) added)
                                      (subvec lines (dec row)))))
                            (vec (str/split-lines text))
                            (sort-by key > row->linters)))
          ending))))

(defn- insert-inline-ignores
  "`text` with an ignore spliced directly before the token at each 1-based `[row col]` of `sites`
  (`{[row col] linters}`), plus `row->comment` lines inserted above rows at matching indentation.
  Kondo reports a finding at its token, which may be a map value or a later form on its line; a
  line-above ignore only covers the line's first form, so restores must splice inline to be precise."
  [text sites row->comment]
  (let [lines    (vec (str/split-lines text))
        ending   (if (str/ends-with? text "\n") "\n" "")
        ;; right-to-left within a row so earlier cols stay valid; rows are independent
        spliced  (reduce (fn [lines [[row col] linters]]
                           (update lines (dec row)
                                   (fn [line]
                                     (str (subs line 0 (dec col))
                                          "#_{:clj-kondo/ignore ["
                                          (str/join " " (sort-by str (distinct linters)))
                                          "]} "
                                          (subs line (dec col))))))
                         lines
                         (sort-by (comp second key) > sites))
        ;; bottom-up so earlier rows stay valid; splicing above never changed row numbers
        commented (reduce (fn [lines [row comment]]
                            (let [indent (re-find #"^\s*" (nth lines (dec row)))]
                              (into (conj (subvec lines 0 (dec row)) (str indent comment))
                                    (subvec lines (dec row)))))
                          spliced
                          (sort-by key > row->comment))]
    (str (str/join "\n" commented) ending)))

(defn- strip-orphan-keep-comments
  "`text` minus whole-line [[keep-marker]] comments no longer attached to an ignore form -- what an
  `--audit` removal that stuck leaves behind. Attachment looks past further comment lines, and only
  needs the ignore's first line (the linter vector may wrap). Trailing markers on code lines are left
  alone."
  [text]
  (let [lines    (vec (str/split-lines text))
        ending   (if (str/ends-with? text "\n") "\n" "")
        ignored? (fn [line] (str/includes? (str line) ":clj-kondo/ignore"))
        orphan?  (fn [i line]
                   (and (marker-on-line? line)
                        (re-matches #"\s*;.*" line)
                        (let [below (drop-while #(re-matches #"\s*;.*" %) (subvec lines (inc i)))]
                          (not (ignored? (first below))))))]
    (str (str/join "\n" (keep-indexed (fn [i line] (when-not (orphan? i line) line)) lines))
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
  Returns `{:text _, :sites [{:row _, :linters _} ...], :deletions [[line rows-deleted] ...],
  :skipped [rows...]}`.
  `:sites` carries the post-removal row of the form each ignore covered and the linters it named;
  `:deletions` maps each removal's original line to how many lines it deleted, so a verifying re-lint
  can shift pre-removal finding rows into post-removal coordinates."
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
                               ;; an inline removal still deletes the newlines inside a wrapped span;
                               ;; a blank-line removal deletes the remaining physical line on top
                               (update :deletions conj [line
                                                        (cond-> (count (filter #(= % \newline) (subs text start end)))
                                                          blank? inc)
                                                        linters]))))
                       {:text text, :deletions []}
                       ;; bottom-up so earlier offsets stay valid
                       (sort-by :start > removable))
        post-removal-row (fn [line]
                           (- line (transduce (keep (fn [[l k]] (when (< l line) k))) + (:deletions result))))]
    {:text      (:text result)
     :sites     (for [[line _ linters] (:deletions result)]
                  {:row     (post-removal-row line)
                   :linters linters})
     :deletions (mapv (fn [[line k _]] [line k]) (:deletions result))
     ;; adjusted like :sites, so warnings point at the rewritten file
     :skipped   (map (comp post-removal-row :line) unbalanced)}))

(defn redundant-ignores
  "Report inline ignores kondo flags as redundant, dropping its two known false-positive classes:
  findings with no location, and ignores that only name linters kondo doesn't run (clojure-lsp/*).
  Sites whose comment (directly above, or trailing on the ignore's line) carries [[keep-marker]] are
  proven false positives and are skipped too, unless `--audit` rechecks them.
  With `--fix`, remove the candidates, then verify against a pre-removal baseline lint of the touched
  files: any finding not in the baseline was exposed by a removal, and gets its ignore restored with
  the marker stamped. An `--audit` removal that sticks takes its stale marker comment with it.
  Restores are per site, so a broad ignore can come back as several; `fix-kondo-ratchets` flags any
  budget that ends up exceeded."
  [parsed]
  (println "Running kondo with :redundant-ignore enabled (full lint, takes a minute or two)...")
  (let [audit?   (get-in parsed [:options :audit])
        findings (kondo-findings! :redundant-ignore lint-roots)
        {located true, homeless false} (group-by #(some? (:row %)) findings)
        {lsp-only true, verifiable false}
        (group-by (fn [{:keys [filename row]}]
                    (lsp-only? (ignored-linters-at filename row)))
                  located)
        file-lines (memoize (fn [file] (vec (str/split-lines (slurp file)))))
        {marked true, candidates false}
        (group-by (fn [{:keys [filename row]}]
                    (marked-row? (file-lines filename) row))
                  verifiable)
        candidates (if audit? (concat candidates marked) candidates)]
    (doseq [{:keys [filename row]} (sort-by (juxt :filename :row) candidates)]
      (println (format "%s:%d %s" filename row (str/join " " (ignored-linters-at filename row)))))
    (println)
    (println (format "%d candidate redundant ignores (dropped as false positives: %d location-less, %d lsp-only)"
                     (count candidates) (count homeless) (count lsp-only)))
    (when (seq marked)
      (println (if audit?
                 (format "Including %d %s sites in the audit." (count marked) keep-marker)
                 (format "Skipped %d sites marked %s; recheck them with --audit." (count marked) keep-marker))))
    (when (and (get-in parsed [:options :fix]) (seq candidates))
      (let [files    (vec (sort (distinct (map :filename candidates))))
            _        (println (format "Baseline-linting %d files before removal..." (count files)))
            baseline (filter :row (kondo-findings! nil files))
            removals (into {}
                           (for [[file file-candidates] (group-by :filename candidates)]
                             (let [{:keys [text sites deletions skipped]}
                                   (remove-ignores-at (slurp file) (map :row file-candidates))]
                               (spit file text)
                               (doseq [row skipped]
                                 (println (format "WARNING: %s:%d skipped -- the ignore form's braces don't balance within the match; remove it by hand"
                                                  file row)))
                               [file {:sites sites, :deletions deletions}])))
            adjusted-row (fn [file row]
                           (- row (transduce (keep (fn [[l k]] (when (< l row) k)))
                                             + (:deletions (removals file)))))
            named        (fn [file] (into #{} (mapcat :linters) (:sites (removals file))))
            restore!     (fn [exposed]
                           ;; returns {file [comment-rows...]} so baseline rows can shift past the inserts
                           (into {}
                                 (for [[file file-exposed] (sort-by key (group-by :filename exposed))]
                                   (let [text  (slurp file)
                                         lines (vec (str/split-lines text))
                                         sites (update-vals (group-by (juxt :row :col) file-exposed) #(map :type %))
                                         ;; the site keeps any marker it already has
                                         row->comment (into {}
                                                            (for [row   (distinct (map :row file-exposed))
                                                                  :when (not (marked-row? lines row))]
                                                              [row keep-comment]))]
                                     (spit file (insert-inline-ignores text sites row->comment))
                                     [file (sort (keys row->comment))]))))
            _            (println (format "Removed them across %d files; re-linting to verify..." (count files)))]
        ;; A finding beyond the (row-shifted) baseline was exposed by a removal; restore it when some
        ;; removed ignore in the file named its type. The baseline is a frequency map so an exposed
        ;; finding sharing row and type with a pre-existing one still counts as new. Hook linters can
        ;; report only the first occurrence per form, so each restore round may surface the next one --
        ;; iterate to a fixpoint.
        (loop [round         1
               baseline-freq (frequencies
                              (map (fn [{:keys [filename row type]}]
                                     [filename (adjusted-row filename row) type])
                                   baseline))
               restored      []]
          (let [{exposed true, mismatched false}
                (group-by (fn [{:keys [filename type]}]
                            (boolean (some #{:all type} (named filename))))
                          (mapcat (fn [[key key-findings]]
                                    (drop (get baseline-freq key 0) (sort-by :col key-findings)))
                                  (group-by (fn [{:keys [filename row type]}] [filename row type])
                                            (filter :row (kondo-findings! nil files)))))]
            (cond
              (and (seq exposed) (< round 5))
              (let [inserted (restore! exposed)]
                (println (format "Round %d: restored %d sites; re-linting for occurrences the first report shadowed..."
                                 round (count (distinct (map (juxt :filename :row) exposed)))))
                (recur (inc round)
                       ;; a comment line inserted above row r pushes baseline rows at or below r down one
                       (into {}
                             (map (fn [[[file row type] n]]
                                    [[file
                                      (reduce (fn [r ins] (if (<= ins r) (inc r) r))
                                              row (sort (get inserted file [])))
                                      type]
                                     n]))
                             baseline-freq)
                       (into restored exposed)))

              :else
              (do (when (seq exposed)
                    (doseq [{:keys [filename row type]} (sort-by (juxt :filename :row) exposed)]
                      (println (format "WARNING: %s:%d still exposes %s after %d restore rounds -- re-ignore by hand"
                                       filename row type round))))
                  (doseq [{:keys [filename row type]} (sort-by (juxt :filename :row) mismatched)]
                    (println (format "WARNING: %s:%d has a new %s finding no removed ignore in the file named -- fix or re-ignore by hand"
                                     filename row type)))
                  (when audit?
                    (doseq [file files]
                      (spit file (strip-orphan-keep-comments (slurp file)))))
                  (if (empty? restored)
                    (println "Verified: the removals exposed no findings.")
                    (println (format "Restored ignores at %d sites where a finding reappeared (%s), stamped %s."
                                     (count (distinct (map (juxt :filename :row) restored)))
                                     (str/join ", " (sort (distinct (map :type restored))))
                                     keep-marker)))))))
        (println "Now run `./bin/mage fix-kondo-ratchets` to update the budgets, and `./bin/mage kondo` for the final word.")))))

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
