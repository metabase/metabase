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

(defn- comment-start
  "Index of the `;` starting `line`'s comment, skipping semicolons inside string literals and after a
  backslash (char literals, string escapes). Line-local: a string opened on an earlier line isn't
  visible, which is fine for locating marker comments. Nil when the line has no comment."
  [line]
  (let [line (str line)
        n    (count line)]
    (loop [i 0, in-string? false]
      (when (< i n)
        (let [c (.charAt ^String line i)]
          (cond
            (= c \\)                        (recur (+ i 2) in-string?)
            (= c \")                        (recur (inc i) (not in-string?))
            (and (= c \;) (not in-string?)) i
            :else                           (recur (inc i) in-string?)))))))

(defn- marker-on-line?
  "Is [[keep-marker]] in `line`'s comment? The marker inside a string literal doesn't count."
  [line]
  (boolean (when-let [i (comment-start line)]
             (str/includes? (subs (str line) i) keep-marker))))

(defn- marked-row?
  "Does the ignore starting on 1-based `row` of `lines` carry [[keep-marker]] -- on the line directly
  above, or trailing on the ignore's own line?"
  [lines row]
  (boolean (some marker-on-line? [(get lines (- row 2)) (get lines (dec row))])))

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

(defn- reinsert-ignores
  "`text` with removed ignore forms put back exactly as they were: each site is a
  [[remove-ignores-at]] `:sites` entry (`:row` in current coordinates) plus optional `:comment` to
  stamp above it. A whole-line original returns as its original line(s); an inline original is
  spliced back at its original column. Returns `{:text _, :inserted-rows [...]}` with one entry per
  physical line added, for shifting other row bookkeeping past the inserts."
  [text sites]
  (let [ending  (if (str/ends-with? text "\n") "\n" "")
        ;; phase 1: all inline splices, right-to-left within a row so earlier columns stay valid;
        ;; nothing is added or removed as a line, so every :row still indexes the original vector
        spliced (reduce (fn [lines {:keys [row original]}]
                          (if (:whole-line? original)
                            lines
                            (update lines (dec row)
                                    (fn [line]
                                      (str (subs line 0 (dec (:col original)))
                                           (:text original) " "
                                           (subs line (dec (:col original))))))))
                        (vec (str/split-lines text))
                        (sort-by (fn [{:keys [row original]}] [row (:col original -1)])
                                 #(compare %2 %1)
                                 sites))
        ;; phase 2: line insertions (comments, whole-line originals), bottom-up; splicing first means
        ;; a comment inserted above a row can no longer displace a same-row splice target. Within a
        ;; row, inline comments insert first so they end up directly above the code line, below any
        ;; whole-line block that lands on the same row -- each ignore keeps its own marker adjacent.
        result  (reduce
                 (fn [{:keys [lines] :as acc} {:keys [row original comment]}]
                   (let [original-lines (str/split-lines (:text original))
                         whole-line?    (:whole-line? original)
                         indent         (if whole-line?
                                          (re-find #"^\s*" (or (first original-lines) ""))
                                          (re-find #"^\s*" (get lines (dec row) "")))
                         added          (concat (when comment [(str indent comment)])
                                                (when whole-line? original-lines))
                         ;; an inline splice added its span-internal newlines in phase 1
                         n-added        (+ (count added)
                                           (if whole-line? 0 (dec (count original-lines))))]
                     {:lines    (into (into (subvec lines 0 (dec row)) added)
                                      (subvec lines (dec row)))
                      :inserted (into (:inserted acc) (repeat n-added row))}))
                 {:lines spliced, :inserted []}
                 (sort-by (fn [{:keys [row original]}]
                            [row (if (:whole-line? original) 0 1)])
                          #(compare %2 %1)
                          sites))]
    {:text          (str (str/join "\n" (:lines result)) ending)
     :inserted-rows (:inserted result)}))

(defn- shift-past-inserts
  "`row` moved down one for each line inserted at or above it, `inserted-rows` being in the same
  pre-insertion coordinates as `row`."
  [row inserted-rows]
  (+ row (count (filter #(<= % row) inserted-rows))))

(defn- site-restore-plan
  "Restore sites annotated with `:comment` (and sometimes an adjusted `:row`), so every restored
  ignore ends up with its own marker adjacent and no insert splits an existing marker from the line
  it marks. Whole-line restores each carry a marker; when the line above already holds one that marks
  the code line's own ignore, the whole-line block moves above that marker instead of splitting the
  pair -- unless the code line has no ignore, in which case the marker marked the removed site itself
  (an --audit re-restore) and no new marker is needed. A row's inline restores share one marker,
  directly above the code line, unless the row already carries one."
  [lines sites]
  (mapcat (fn [[row row-sites]]
            (let [{wl true, inl false} (group-by (comp boolean :whole-line? :original) row-sites)
                  above-marker? (marker-on-line? (get lines (- row 2)))
                  code-ignored? (seq (kondo-ratchet/line-linters (str (get lines (dec row)))))]
              (concat (for [s wl]
                        (cond
                          (and above-marker? code-ignored?) (assoc s :row (dec row), :comment keep-comment)
                          above-marker?                     (assoc s :comment nil)
                          :else                             (assoc s :comment keep-comment)))
                      (when (seq inl)
                        (if (marked-row? lines row)
                          (map #(assoc % :comment nil) inl)
                          (cons (assoc (first inl) :comment keep-comment)
                                (map #(assoc % :comment nil) (rest inl))))))))
          (group-by :row sites)))

(defn- strip-orphan-keep-comments
  "`text` minus [[keep-marker]] markers no longer attached to an ignore form -- what an `--audit`
  removal that stuck leaves behind. A stamped whole-line marker comment is deleted; a hand-written
  comment that merely carries the token keeps its prose and loses only the token. Attachment looks
  past further comment lines, and only needs the ignore's first line (the linter vector may wrap).
  Trailing markers on code lines are left alone."
  [text]
  (let [lines    (vec (str/split-lines text))
        ending   (if (str/ends-with? text "\n") "\n" "")
        ignored? (fn [line] (str/includes? (str line) ":clj-kondo/ignore"))
        stamped? #{keep-comment}
        orphan?  (fn [i line]
                   (and (marker-on-line? line)
                        (re-matches #"\s*;.*" line)
                        (let [below (drop-while #(re-matches #"\s*;.*" %) (subvec lines (inc i)))]
                          (not (ignored? (first below))))))]
    (str (str/join "\n"
                   (keep-indexed (fn [i line]
                                   (cond
                                     (not (orphan? i line))       line
                                     (stamped? (str/trim line))   nil
                                     :else                        (-> line
                                                                      (str/replace (str " " keep-marker) "")
                                                                      (str/replace keep-marker ""))))
                                 lines))
         ending)))

;;;; ---------------------------------------------------------------------------
;;;; kondo-redundant-ignores
;;;; ---------------------------------------------------------------------------

(defn- ignored-linters-at
  "Linter keywords named by the ignore form at `row` of `lines`; reads a couple of extra lines since
  the vector may wrap."
  [lines row]
  (kondo-ratchet/line-linters
   (str/join "\n" (subvec lines (dec row) (min (count lines) (+ row 2))))))

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
  Returns `{:text _, :sites [{:row _, :linters _, :original _} ...], :skipped [rows...]}`.
  `:sites` carries the post-removal row of the form each ignore covered, the linters it named, and
  `:original` -- the removed form's exact text and placement, so a restore can put it back verbatim."
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
                               (update :deletions conj
                                       {:line         line
                                        :rows-deleted (cond-> (count (filter #(= % \newline) (subs text start end)))
                                                        blank? inc)
                                        :linters      linters
                                        ;; enough to put the removal back exactly as it was
                                        :original     (if blank?
                                                        {:whole-line? true
                                                         :text        (subs text line-start (+ end line-end))}
                                                        {:whole-line? false
                                                         :col         (inc (- start line-start))
                                                         :text        (subs text start end)})}))))
                       {:text text, :deletions []}
                       ;; bottom-up so earlier offsets stay valid
                       (sort-by :start > removable))
        deletions        (:deletions result)
        post-removal-row (fn [line]
                           (- line (transduce (keep (fn [{l :line, k :rows-deleted}] (when (< l line) k)))
                                              + deletions)))]
    {:text    (:text result)
     :sites   (for [{:keys [line linters original]} deletions]
                {:row      (post-removal-row line)
                 :linters  linters
                 :original original})
     ;; adjusted like :sites, so warnings point at the rewritten file
     :skipped (map (comp post-removal-row :line) unbalanced)}))

(defn redundant-ignores
  "Report inline ignores kondo flags as redundant, dropping its two known false-positive classes:
  findings with no location, and ignores that only name linters kondo doesn't run (clojure-lsp/*).
  Sites whose comment (directly above, or trailing on the ignore's line) carries [[keep-marker]] are
  proven false positives and are skipped too, unless `--audit` rechecks them.
  With `--fix`, remove the candidates and re-lint the touched files: every finding was exposed by a
  removal, whose ignore is put back exactly as it was -- a coarse form-level ignore returns as the
  same single form-level ignore -- with the marker stamped above it. That inference requires a clean
  pre-removal baseline, so files with pre-existing findings are excluded from the sweep and reported.
  An `--audit` removal that sticks takes its stale marker comment with it."
  [parsed]
  (println "Running kondo with :redundant-ignore enabled (full lint, takes a minute or two)...")
  (let [audit?     (get-in parsed [:options :audit])
        findings   (kondo-findings! :redundant-ignore lint-roots)
        {located true, homeless false} (group-by #(some? (:row %)) findings)
        file-lines (memoize (fn [file] (vec (str/split-lines (slurp file)))))
        {lsp-only true, verifiable false}
        (group-by (fn [{:keys [filename row]}]
                    (lsp-only? (ignored-linters-at (file-lines filename) row)))
                  located)
        {marked true, candidates false}
        (group-by (fn [{:keys [filename row]}]
                    (marked-row? (file-lines filename) row))
                  verifiable)
        candidates (if audit? (concat candidates marked) candidates)]
    (doseq [{:keys [filename row]} (sort-by (juxt :filename :row) candidates)]
      (println (format "%s:%d %s" filename row (str/join " " (ignored-linters-at (file-lines filename) row)))))
    (println)
    (println (format "%d candidate redundant ignores (dropped as false positives: %d location-less, %d lsp-only)"
                     (count candidates) (count homeless) (count lsp-only)))
    (when (seq marked)
      (println (if audit?
                 (format "Including %d %s sites in the audit." (count marked) keep-marker)
                 (format "Skipped %d sites marked %s; recheck them with --audit." (count marked) keep-marker))))
    (when (and (get-in parsed [:options :fix]) (seq candidates))
      ;; Precondition: swept files must baseline-lint clean, so that afterwards EVERY finding the
      ;; verify lint reports was exposed by our removal. Files with pre-existing findings are excluded
      ;; -- there is no way to tell their old warnings from newly exposed ones.
      (let [all-files  (vec (sort (distinct (map :filename candidates))))
            _          (println (format "Baseline-linting %d files before removal..." (count all-files)))
            dirty      (into #{} (map :filename) (filter :row (kondo-findings! nil all-files)))
            candidates (remove (comp dirty :filename) candidates)
            files      (vec (sort (distinct (map :filename candidates))))]
        (doseq [file (sort dirty)]
          (println (format "WARNING: %s has pre-existing findings; its candidates are excluded this run -- clean it up or mark them by hand"
                           file)))
        (when (seq candidates)
          (let [removals (into {}
                               (for [[file file-candidates] (group-by :filename candidates)]
                                 (let [{:keys [text sites skipped]}
                                       (remove-ignores-at (slurp file) (map :row file-candidates))]
                                   (spit file text)
                                   (doseq [row skipped]
                                     (println (format "WARNING: %s:%d skipped -- the ignore form's braces don't balance within the match; remove it by hand"
                                                      file row)))
                                   [file sites])))
                named    (fn [file] (into #{} (mapcat :linters) (removals file)))
                restore-sites! (fn [file->sites]
                                 ;; puts each removed ignore back exactly as it was; returns
                                 ;; {file [inserted-anchor-rows...]} for shifting row bookkeeping
                                 (into {}
                                       (for [[file sites] (sort-by key file->sites)]
                                         (let [text  (slurp file)
                                               lines (vec (str/split-lines text))
                                               {:keys [text inserted-rows]}
                                               (reinsert-ignores text (site-restore-plan lines sites))]
                                           (spit file text)
                                           [file inserted-rows]))))
                finish!  (fn [exposed mismatched restored covered rounds-run]
                           (doseq [{:keys [filename row type]} (sort-by (juxt :filename :row) exposed)]
                             (println (format "WARNING: %s:%d still exposes %s after %d restore rounds -- re-ignore by hand"
                                              filename row type rounds-run)))
                           (doseq [{:keys [filename row type]} (sort-by (juxt :filename :row) mismatched)]
                             (println (format "WARNING: %s:%d has a new %s finding no removed ignore in the file named -- fix or re-ignore by hand"
                                              filename row type)))
                           (when audit?
                             (doseq [file files]
                               (spit file (strip-orphan-keep-comments (slurp file)))))
                           (if (empty? restored)
                             (println "Verified: the removals exposed no findings.")
                             (println (format "Restored %d removed ignores covering %d findings (%s), stamped %s."
                                              (count restored)
                                              (count covered)
                                              (str/join ", " (sort (distinct (map :type covered))))
                                              keep-marker)))
                           (println "Now run `./bin/mage fix-kondo-ratchets` to update the budgets, and `./bin/mage kondo` for the final word.")
                           (when (or (seq exposed) (seq mismatched))
                             (throw (ex-info "the removals left warnings in the tree; fix or re-ignore them by hand and re-run"
                                             {:exit-code 1}))))
                _        (println (format "Removed them across %d files; re-linting to verify..." (count files)))]
            ;; The baseline was clean, so every finding here was exposed by a removal. Attribute it to
            ;; the nearest preceding removed site naming its type and put that ignore back verbatim --
            ;; a coarse ignore returns as the same coarse ignore, never as several narrow ones. Hook
            ;; linters can report only the first occurrence per form, so a round may surface findings
            ;; a restored form already covers; iterate until the lint comes back clean.
            (loop [round    1
                   pending  removals
                   restored []
                   covered  []]
              (let [{exposed true, mismatched false}
                    (group-by (fn [{:keys [filename type]}]
                                (boolean (some #{:all type} (named filename))))
                              (filter :row (kondo-findings! nil files)))
                    ;; nearest preceding pending site naming the finding's type; else nearest overall
                    pick (fn [{:keys [filename row type]}]
                           (let [match? (fn [s] (boolean (some #{:all type} (:linters s))))
                                 sites  (filter match? (get pending filename))]
                             (or (last (sort-by :row (filter #(<= (:row %) row) sites)))
                                 (first (sort-by #(abs (- (:row %) row)) sites)))))
                    picks (map (juxt identity pick) exposed)
                    attributable (filter second picks)]
                (if (and (seq attributable) (< round 6))
                  (let [file->sites (into {}
                                          (for [[file fps] (group-by (comp :filename first) attributable)]
                                            [file (vec (distinct (map second fps)))]))
                        inserted    (restore-sites! file->sites)
                        shift-site  (fn [file s] (update s :row #(shift-past-inserts % (get inserted file []))))]
                    (println (format "Round %d: put back %d removed ignores covering %d findings; re-linting..."
                                     round
                                     (reduce + (map count (vals file->sites)))
                                     (count attributable)))
                    (recur (inc round)
                           (into {}
                                 (for [[file sites] pending
                                       :let [gone (set (get file->sites file))]]
                                   [file (vec (for [s sites :when (not (gone s))]
                                                (shift-site file s)))]))
                           (into restored (for [[file sites] file->sites, s sites]
                                            {:file file, :row (:row s)}))
                           (into covered (map first attributable))))
                  (finish! exposed mismatched restored covered (dec round)))))))))))

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
