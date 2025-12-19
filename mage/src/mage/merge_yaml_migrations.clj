(ns mage.merge-yaml-migrations
  (:require
   [clj-yaml.core :as yaml]
   [clojure.string :as str]
   [mage.util :as u]
   [medley.core :as m]))

(set! *warn-on-reflection* true)

;; Parse YAML file to Clojure data structure
(defn- parse-yaml [file-path]
  (try
    (yaml/parse-string (slurp file-path))
    (catch Exception e
      (binding [*out* *err*]
        (println "Error parsing YAML file:" file-path)
        (println (.getMessage e)))
      (u/exit 2))))

(def ^:private FOOTER-PREFIX
  "# >>>>>>>>>> DO NOT ADD NEW MIGRATIONS BELOW THIS LINE! ADD THEM ABOVE <<<<<<<<<<")

(defn- extract-footer [content]
  (let [idx (some-> content (str/index-of FOOTER-PREFIX))]
    (if (and idx (pos? idx))
      (subs content idx)
      "")))

;; Extract raw text for each changeset from the file
(defn- extract-changeset-texts [file-content parsed-yaml]
  (let [lines (str/split-lines file-content)
        changelog (get parsed-yaml :databaseChangeLog)
        changesets (filterv #(contains? % :changeSet) changelog)]
    ;; For each changeset, find its text in the original file
    (->> (for [cs changesets]
           (let [cs-id (get-in cs [:changeSet :id])
                 ;; Find the line with "id: <cs-id>"
                 id-line-idx (first (keep-indexed
                                     (fn [idx line]
                                       (when (str/includes? line (str "id: " cs-id))
                                         idx))
                                     lines))
                 ;; Find the changeset start (line before with "  - changeSet:")
                 cs-start-idx (when id-line-idx
                                (loop [idx (dec id-line-idx)]
                                  (cond
                                    (< idx 0) 0
                                    (str/starts-with? (get lines idx) "  - changeSet:") idx
                                    :else (recur (dec idx)))))
                 ;; Find the changeset end (next line with "  - changeSet:" or "  - " at root level or "#" or end)
                 cs-end-idx (when cs-start-idx
                              (loop [idx (inc cs-start-idx)]
                                (cond
                                  (>= idx (count lines)) (dec (count lines))
                                  (let [line (get lines idx)]
                                    (or (str/starts-with? line "  - changeSet:")
                                        (and (str/starts-with? line "  - ")
                                             (not (re-find #"^  - (changeSet|sql|addColumn|createTable|dropTable|addForeignKeyConstraint|dropForeignKeyConstraint|createIndex|dropIndex|addUniqueConstraint|dropUniqueConstraint|addPrimaryKey|dropPrimaryKey):" line)))
                                        (str/starts-with? line "# ")))
                                  (dec idx)
                                  :else (recur (inc idx)))))]
             (when (and cs-start-idx cs-end-idx)
               [cs-id (str/join "\n" (subvec (vec lines) cs-start-idx (inc cs-end-idx)))])))
         (into {}))))

(defn- extract-changesets [parsed-yaml]
  (->> (:databaseChangeLog parsed-yaml)
       (filterv :changeSet)))

(defn- cs-id [cs]
  (-> cs :changeSet :id))

(defn- merge-changesets [base-data ours-data theirs-data working-tree-data]
  (let [base-cs (m/index-by cs-id (extract-changesets base-data))
        git-ours-cs (m/index-by cs-id (extract-changesets ours-data))
        theirs-cs (m/index-by cs-id (extract-changesets theirs-data))
        ;; During rebase, git passes the WRONG "ours" file on 2nd+ merge driver calls.
        ;; The working tree contains the actual correct state from previous cherry-picks.
        ;; Use working-tree as the authoritative "ours" when available.
        working-tree-cs (if working-tree-data
                          (m/index-by cs-id (extract-changesets working-tree-data))
                          {})
        ;; Effective ours: prefer working-tree over git-provided ours
        ;; This fixes the rebase bug where git passes stale ours data
        ours-cs (merge git-ours-cs working-tree-cs)
        all-ids (into #{}
                      (comp (map keys) cat)
                      [base-cs ours-cs theirs-cs])]
    (reduce
     (fn [acc id]
       (let [base (get base-cs id)
             ours (get ours-cs id)
             theirs (get theirs-cs id)]
         (cond
           (and ours (not theirs) (not base)) ; Added by us
           (conj acc {:id id :source :ours})
           (and theirs (not ours) (not base)) ; Added by them
           (conj acc {:id id :source :theirs})
           (and base ours (not theirs)) ; they have deleted it
           acc
           (and base theirs (not ours)) ; we have deleted it
           acc
           (and base (not ours) (not theirs)) ; only in base, so both deleted
           acc
           (and base ours theirs) ; check for modifications
           (cond
             (= ours theirs) ; identical
             (conj acc {:id id :source :ours})
             (and (= theirs base) (not= ours base)) ; our mod
             (conj acc {:id id :source :ours})
             (and (= ours base) (not= theirs base)) ; their mod
             (conj acc {:id id :source :theirs})
             :else ; CONFLICT
             (conj acc {:id id
                        :source :conflict
                        :ours ours
                        :theirs theirs}))
           :else ; was I diligent enough?
           (do
             (binding [*out* *err*]
               (println "Unexpected case for changeset:" id))
             acc))))
     []
     all-ids)))

(defn- format-conflict-changeset [id ours theirs]
  (format
   (str "<<<<<<< MERGE CONFLICT for changeset: %s, our version:\n"
        "%s\n"
        "======= Their version:\n"
        "%s\n"
        ">>>>>>>\n")
   id ours theirs))

(defn- merge-files [base ours theirs {:keys [_marker-size filepath]}]
  (let [ours-text (slurp ours)
        theirs-text (slurp theirs)
        ;; Read from working tree to get the actual current state during rebase
        ;; This contains migrations correctly merged in previous cherry-picks
        working-tree-text (try (slurp filepath) (catch Exception _ nil))
        ;; Parse yaml
        base-data (parse-yaml base)
        ours-data (parse-yaml ours)
        theirs-data (parse-yaml theirs)
        working-tree-data (when working-tree-text
                            (try
                              (yaml/parse-string working-tree-text)
                              (catch Exception _ nil)))
        ;; Extract raw text for each changeset
        git-ours-cs-texts (extract-changeset-texts ours-text ours-data)
        theirs-cs-texts (extract-changeset-texts theirs-text theirs-data)
        working-tree-cs-texts (when (and working-tree-text working-tree-data)
                                (extract-changeset-texts working-tree-text working-tree-data))
        ;; Merge text maps: prefer working-tree over git-provided ours
        ;; This ensures we use the correct text for migrations from previous cherry-picks
        ours-cs-texts (merge git-ours-cs-texts working-tree-cs-texts)
        ;; Extract footer from ours file (or working tree if available)
        footer (extract-footer (or working-tree-text ours-text))
        ;; Perform merge
        merged (merge-changesets base-data ours-data theirs-data working-tree-data)
        ;; Sort merged changesets by ID (chronological order)
        sorted-merged (sort-by :id merged)
        ;; Build result by concatenating raw text blocks
        header "databaseChangeLog:\n  - objectQuotingStrategy: QUOTE_ALL_OBJECTS\n"
        changeset-texts
        (for [cs sorted-merged]
          (let [text (case (:source cs)
                       :ours (get ours-cs-texts (:id cs))
                       :theirs (get theirs-cs-texts (:id cs))
                       :conflict (format-conflict-changeset ;; TODO: use marker-size here
                                  (:id cs)
                                  (get ours-cs-texts (:id cs))
                                  (get theirs-cs-texts (:id cs))))]
            ;; Remove trailing blank lines from each changeset
            (some-> text (str/replace #"\n+$" ""))))]
    {:result (str header
                  "\n"
                  (str/join "\n\n" (filter some? changeset-texts))
                  "\n"
                  (when (seq footer) (str "\n" footer))
                  (when-not (str/ends-with? footer "\n") "\n"))
     :conflicts (vec (keep #(when (= (:source %) :conflict) (:id %)) sorted-merged))
     :cnt (count sorted-merged)}))

;;
;; Usage (called by git):
;;   merge-yaml-migrations %O %A %B %L %P
;;   %O = ancestor's version (base)
;;   %A = current version (ours)
;;   %B = other branch's version (theirs)
;;   %L = conflict marker size
;;   %P = file path
;;
;; Exit codes:
;;   0 = clean merge
;;   1 = conflicts detected (conflict markers added to file)
;;   >1 = merge failed

(defn -main [{:keys [arguments]}]
  (when (< (count arguments) 3)
    (binding [*out* *err*]
      (println "Usage: merge-yaml-migrations <base> <ours> <theirs> [conflict-marker-size] [file-path]")
      (println "Will modify <ours>!"))
    (u/exit 2))

  (let [;; Resolve relative paths against project root (where git creates temp files)
        resolve-path (fn [p]
                       (if (str/starts-with? p "/")
                         p
                         (str u/project-root-directory "/" p)))
        [base ours theirs marker-size filepath] arguments
        base (resolve-path base)
        ours (resolve-path ours)
        theirs (resolve-path theirs)
        filepath (when filepath (resolve-path filepath))
        {:keys [result conflicts cnt]} (merge-files
                                        base
                                        ours
                                        theirs
                                        {:marker-size marker-size
                                         :filepath filepath})]
    (spit (or filepath ours) result)

    ;; Exit with appropriate code
    (when (seq conflicts)
      (binding [*out* *err*]
        (println "Merge conflicts detected in changesets:" (str/join ", " conflicts))
        (println "Conflict markers added to file. Please resolve manually."))
      (u/exit 1))

    (println "Clean merge of" cnt "changesets")
    (u/exit 0)))

(when (= *file* (System/getProperty "babashka.file"))
  (-main *command-line-args*))
