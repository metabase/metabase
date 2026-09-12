(ns dev.security-lint.sarif
  "Renders findings as SARIF 2.1.0 for GitHub code scanning.

  This is the whole reason the security rules live outside the main lint run: findings land in GitHub's security
  tab with their own category, severity and history, instead of in `.clj-kondo/ratchets.edn`. The ratchet system
  is for paying down stylistic debt on a budget; a security finding is not a budget line."
  (:require
   [clojure.string :as str]
   [dev.security-lint.rule :as rule]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def ^:private schema-uri
  "The OASIS schema, the one the specification names; the schemastore address it used to carry redirects here."
  "https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json")

(def ^:private level
  "SARIF levels. Only `error` fails a build; the rest are informational in the security tab."
  {:error "error", :warning "warning", :note "note"})

(def version
  "The tool's version, shown by GitHub on the analysis. Bump it when the output changes meaning -- a rule
  renamed, a fingerprint computed differently -- so an analysis can be told from the ones before it."
  "1.0.0")

(def ^:private source-base
  "Where a rule's source is read on GitHub: the alert's help link."
  "https://github.com/metabase/metabase/blob/master/")

(def ^:private src-root
  "The URI base id GitHub resolves artifact locations against: the repository checkout."
  "%SRCROOT%")

(defn- rule-source-uri
  "The rule's namespace as a path under `dev/src`, on master."
  [{:keys [ns]}]
  (when ns
    (str source-base "dev/src/" (-> (str ns) (str/replace "." "/") (str/replace "-" "_")) ".clj")))

(defn- sha256 ^String [^String s]
  (let [d (MessageDigest/getInstance "SHA-256")]
    (->> (.digest d (.getBytes s "UTF-8"))
         (map #(format "%02x" %))
         str/join)))

(defn- relativize
  "GitHub resolves artifact URIs against the repository root, so absolute paths have to be trimmed, and a leading
  `./` -- which clj-kondo echoes back when a scan was pointed at `./src` -- dropped."
  [root ^String path]
  (let [root (when root (str (str/replace root #"/+$" "") "/"))
        p    (if (and root (str/starts-with? path root)) (subs path (count root)) path)]
    (str/replace p #"^(\./)+" "")))

(defn- artifact-location [root path]
  {:uri (relativize root path) :uriBaseId src-root})

(defn- rule->sarif [{:keys [id name description precision cwe remediation] :as r}]
  (let [severity (rule/worst-severity r)]
    (cond->
     {:id                   (str (symbol id))
      :name                 name
      :shortDescription     {:text name}
      :fullDescription      {:text description}
      ;; GitHub renders `help.markdown` on the alert page, and these texts are written with backticks around the
      ;; code they name; the plain text is the same words for a consumer that reads only `text`
      :help                 {:text     (str description (when remediation (str "\n\nRemediation: " remediation)))
                             :markdown (str description (when remediation (str "\n\n**Remediation:** " remediation)))}
      :defaultConfiguration {:level (level severity "warning")}
      ;; No `security-severity`. GitHub reads that rule-level number to bucket every alert of the rule as
      ;; critical/high/medium/low, and judges a pull request against it; but a rule here grades each finding
      ;; by taint, and a `{:tainted :error :otherwise :warning}` rule's warnings would inherit its worst case.
      ;; Without it the alert's severity is the result's `level`, and the repository's code scanning threshold
      ;; for "alerts without a security severity" -- errors -- blocks exactly the error-graded findings.
      :properties           (cond-> {:tags      (cond-> ["security" "metabase"]
                                                  cwe (conj (str "external/cwe/" (u/lower-case-en cwe))))
                                     :precision (clojure.core/name (or precision :medium))}
                              cwe (assoc :cwe cwe))}
      (rule-source-uri r) (assoc :helpUri (rule-source-uri r)))))

(defn- reachability-sentence
  "GitHub shows a result's message and nothing of its properties, so the one fact a reviewer wants first -- can a
  request even get here -- has to be in the text."
  [reachable-from]
  (if (seq reachable-from)
    (str "Reachable from " (str/join ", " (sort (map name reachable-from))) ".")
    "Not reachable from any known entry point."))

(defn- origin-phrases
  "The origins by kind, each with its refinements: `app-db (Card, Dashboard)`. A generic helper reached from
  everywhere carries every model; past three they are counted rather than listed."
  [origins]
  (for [[kind labels] (sort-by key (group-by #(or (namespace %) (name %)) origins))
        :let [models (sort (keep #(when (namespace %) (name %)) labels))]]
    (cond
      (empty? models)        kind
      (<= (count models) 3)  (str kind " (" (str/join ", " models) ")")
      :else                  (str kind " (" (str/join ", " (take 3 models)) ", +" (- (count models) 3) " more)"))))

(defn- origins-sentence
  "Where the flagged values came from, for the message: `Values cross: request, app-db (Card).`"
  [origins]
  (when (seq origins)
    (str "Values cross: " (str/join ", " (origin-phrases origins)) ".")))

(defn- flow-kinds
  "Flows in report order: http first, since a request is the triage question, then the rest by name."
  [flows]
  (sort-by (fn [[k _]] [(if (= k :http) 0 1) (name k)]) flows))

(defn- code-flows
  "One SARIF code flow per entry kind: the entry, each function on the shortest path, and the finding itself,
  every step a location GitHub links into the file. This is what 'Show paths' renders on an alert."
  [root {:keys [file row col message flows]}]
  (let [location (fn [{:keys [filename] :as step} text]
                   {:location {:physicalLocation {:artifactLocation (artifact-location root filename)
                                                  :region           {:startLine (:row step) :startColumn (:col step)}}
                               :message          {:text text}}})]
    (vec (for [[kind {:keys [path]}] (flow-kinds flows)
               :let [steps (filter :row path)]
               :when (seq steps)]
           {:message     {:text (str "From " (name kind) " entry " (:name (first steps)))}
            :threadFlows [{:locations (conj (mapv #(location % (:name %)) steps)
                                            (location {:filename file :row row :col col} message))}]}))))

(defn- fingerprint
  "What GitHub matches an alert by across analyses: the same value in two uploads is the same alert, carrying its
  dismissal and its history; a value seen for the first time opens an alert, and one no longer seen closes it as
  fixed. GitHub's own `primaryLocationLineHash` is a hash of the lines around the location, so it survives moves
  but not edits to the code itself; a supplied one is used verbatim, so the choice of what to hash is ours.

  This hashes four things and no line number:

    - the rule id, so the same form flagged by two rules is two alerts;
    - the file, repository-relative, so the same form in two files is two alerts -- and a moved file re-opens;
    - the whole flagged form with its formatting removed (`ast/normalized-text`: one space between tokens, no
      comments, no commas, no `#_` forms), so the alert survives edits anywhere else in the file and a reformat,
      and re-opens when the flagged code itself is changed -- including a dismissed one, which is the point: what
      was reviewed is no longer what is there;
    - which occurrence of that exact form in the file this is, top to bottom, so four identical interpolated DDL
      statements in one namespace are four alerts rather than one. (Adding a fifth *above* them renumbers the
      rest, closing and re-opening them; identical forms are rare enough that this has not mattered.)

  The snippet stands in for the form for a finding that has no form node."
  [rule-id uri form snippet occurrence]
  (sha256 (str/join "|" [(str (symbol rule-id)) uri (or form snippet "") occurrence])))

(defn- finding->result [rule-index root occurrence {:keys [rule-id file row col end-row end-col severity message
                                                           form snippet endpoint-reachable? reachable-from origins]
                                                    :as finding}]
  (let [uri      (relativize root file)
        cflows   (code-flows root finding)
        sentence (str message (when-not (re-find #"[.!?]$" message) "."))
        text     (str/join " " (remove nil? [sentence (reachability-sentence reachable-from) (origins-sentence origins)]))]
    (cond-> {:ruleId              (str (symbol rule-id))
             :ruleIndex           (get rule-index rule-id)
             :level               (level severity "warning")
             ;; GitHub renders the markdown when it is there: the same sentences, and the flagged code in a block
             ;; so a reader of the alert list sees the form without opening the file
             :message             {:text     text
                                   :markdown (str text (when (seq snippet)
                                                         (str "\n\n```clojure\n" (first (str/split-lines snippet)) "\n```")))}
             :locations           [{:physicalLocation
                                    {:artifactLocation (artifact-location root file)
                                     :region           {:startLine   row
                                                        :startColumn col
                                                        :endLine     end-row
                                                        :endColumn   end-col}}}]
             ;; Whether an HTTP request can reach this code at all -- the single most useful thing for triage order.
             :properties          {:endpointReachable (boolean endpoint-reachable?)
                                   ;; every kind of entry point that reaches it: http, job, mq, cli, event, startup
                                   :reachableFrom     (vec (sort (map name reachable-from)))
                                   ;; the boundaries the flagged values crossed: request, app-db/Card, warehouse
                                   :origins           (vec (sort (map #(str (symbol %)) origins)))}
             :partialFingerprints {:primaryLocationLineHash (fingerprint rule-id uri form snippet occurrence)}}
      (seq cflows) (assoc :codeFlows cflows))))

(defn- with-occurrences
  "Pair each finding with its index among the findings that would otherwise fingerprint the same: same rule, same
  file, same code. Ordered by position, so the index does not depend on the order findings arrived in."
  [findings]
  (->> findings
       (sort-by (juxt :file :row :col))
       (group-by (juxt :rule-id :file #(or (:form %) (:snippet %))))
       vals
       (mapcat #(map-indexed vector %))))

(defn report
  "Build a SARIF report from `findings`.

  `:rules` is the full rule set, not just the ones that fired -- a clean run must still describe every rule so that
  GitHub closes alerts which no longer reproduce. `:started` and `:ended` are the scan's `Instant`s, for the
  invocation record GitHub shows with the analysis."
  [findings {:keys [rules root started ended]}]
  (let [rules      (sort-by :id rules)
        rule-index (into {} (map-indexed (fn [i r] [(:id r) i]) rules))]
    {(keyword "$schema") schema-uri
     :version            "2.1.0"
     :runs               [{:tool    {:driver {:name            "metabase-security-lint"
                                              :semanticVersion version
                                              :informationUri  (str source-base "dev/src/dev/security_lint/README.md")
                                              :rules           (mapv rule->sarif rules)}}
                           :invocations [(cond-> {:executionSuccessful true}
                                           started (assoc :startTimeUtc (str started))
                                           ended   (assoc :endTimeUtc (str ended)))]
                           :columnKind "unicodeCodePoints"
                           :results (->> (with-occurrences findings)
                                         (map (fn [[i f]] (finding->result rule-index root i f)))
                                         (sort-by (juxt #(get-in % [:locations 0 :physicalLocation :artifactLocation :uri])
                                                        #(get-in % [:locations 0 :physicalLocation :region :startLine])
                                                        :ruleId))
                                         vec)}]}))

(defn write!
  "Write a SARIF report to `path`, compact: a run's code flows made the pretty form three times the size, and the
  file is for GitHub, which gzips it, and for a reader with `jq`."
  [report path]
  (spit path (json/encode report))
  path)

;;; ------------------------------------------------ text output ------------------------------------------------

(def ^:private snippet-width 100)

(defn- one-line
  "The first line of `snippet`, cut to a readable width."
  [snippet]
  (let [line (first (str/split-lines (or snippet "")))]
    (if (> (count line) snippet-width)
      (str (subs line 0 snippet-width) "…")
      line)))

(defn- plural [n noun]
  (str n " " noun (when (not= 1 n) "s")))

(defn- severity-counts [findings]
  (let [c (frequencies (map :severity findings))]
    (str/join ", " (for [sev [:error :warning :note] :when (pos? (get c sev 0))]
                     (plural (get c sev) (name sev))))))

(def ^:private severity-order [:error :warning :note])

(def ^:private severity-meaning
  "What a severity says about the findings under it, for the section header."
  {:error   "Fails the scan. The pattern is dangerous on its own, or the flagged value derives from request input."
   :warning "Does not fail the scan, but is a defect to fix."
   :note    "Informational. The pattern is worth a look, but nothing shows attacker-influenced input reaching it."})

(defn- wrap
  "`text` folded into lines of at most `width` characters. The first line is prefixed with `indent`, the rest
  with `rest-indent` (default the same), for a hanging indent."
  ([indent width text] (wrap indent indent width text))
  ([indent rest-indent width text]
   (->> (str/split (or text "") #"\s+")
        (reduce (fn [lines word]
                  (let [line (peek lines)]
                    (if (and line (<= (+ (count line) 1 (count word)) width))
                      (conj (pop lines) (str line " " word))
                      (conj lines word))))
                [])
        (map-indexed (fn [i l] (str (if (zero? i) indent rest-indent) l))))))

(defn- reachability-lines
  "What reaches the finding: each entry kind with how many entries of it, then one call path per kind."
  [{:keys [reachable-from flows]}]
  (cond
    (seq flows)
    (into [(str "    reachable from "
                (str/join ", " (for [[kind {:keys [count]}] (flow-kinds flows)]
                                 (str (name kind) " (" (plural count "entry point") ")"))))]
          (for [[kind {:keys [path]}] (flow-kinds flows)
                line (wrap "      " "        " 110 (str (name kind) ": " (str/join " -> " (map :name path))))]
            line))

    (seq reachable-from)
    [(str "    reachable from " (str/join ", " (sort (map name reachable-from))))]

    :else
    ["    not reachable from any known entry point"]))

(defn- finding-lines [root show-message? {:keys [file row col message snippet] :as finding}]
  (concat
   ;; file:row:col alone on the first line, so an IDE terminal makes it a link
   [(format "%s:%d:%d" (relativize root file) row col)]
   (when show-message? [(str "    " message)])
   (when (seq (:origins finding))
     [(str "    values cross " (str/join ", " (origin-phrases (:origins finding))))])
   (reachability-lines finding)
   (when-let [code (not-empty (one-line snippet))]
     [(str "    | " code)])
   [""]))

(defn- severity-lines
  "One severity's findings under a rule. A message every finding shares is said once here rather than repeated;
  one that varies -- which function, which value -- stays with its finding."
  [root sev findings]
  (let [messages (distinct (map :message findings))
        shared   (when (= 1 (count messages)) (first messages))]
    (concat
     [(format "### %s: %s" (str/capitalize (name sev)) (severity-meaning sev)) ""]
     (when shared [(str shared) ""])
     (mapcat #(finding-lines root (nil? shared) %) (sort-by (juxt :file :row :col) findings)))))

(defn- rule-lines
  "One rule's findings: a header naming the rule with its counts, what the rule means and what to do about it,
  then a section per severity, worst first."
  [root findings]
  (let [{:keys [rule-id rule-name description remediation]} (first findings)
        by-severity (group-by :severity findings)]
    (concat
     [(format "## %s: %s (%s)" (name rule-id) (or rule-name (name rule-id)) (severity-counts findings)) ""]
     (wrap "" 110 description)
     (when remediation (concat [""] (wrap "" 110 (str "Remediation: " remediation))))
     [""]
     (for [sev  severity-order
           :let [fs (get by-severity sev)]
           :when (seq fs)
           line (severity-lines root sev fs)]
       line))))

(def ^:private ^java.time.format.DateTimeFormatter timestamp-format (java.time.format.DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm zzz"))

(defn- rule-order
  "Rules with an error first, then by how much they found, then by name."
  [findings]
  (sort-by (fn [[id fs]] [(if (some #(= :error (:severity %)) fs) 0 1) (- (count fs)) (name id)])
           (group-by :rule-id findings)))

(defn- overview-lines
  "One line per rule with its counts, so the shape of the report is visible before any finding."
  [by-rule]
  (let [width (apply max 0 (map (comp count name key) by-rule))]
    (for [[id fs] by-rule]
      (format "  %s  %s" (str (name id) (apply str (repeat (- width (count (name id))) " "))) (severity-counts fs)))))

(defn text
  "Human-readable findings, for running this locally: a header with when it ran and the totals, an overview by
  rule, then the findings grouped by rule and severity.

  `:now` is the run time, a `ZonedDateTime`; it defaults to now."
  [findings {:keys [root now]}]
  (let [by-rule (rule-order findings)
        header  ["# Security lint report"
                 ""
                 (str "Ran " (.format timestamp-format (or now (java.time.ZonedDateTime/now))))]]
    (str/join
     "\n"
     (if (empty? findings)
       (concat header ["No security findings." ""])
       (concat
        header
        [(format "%s in %s across %s: %s" (plural (count findings) "finding")
                 (plural (count (distinct (map :file findings))) "file")
                 (plural (count by-rule) "rule")
                 (severity-counts findings))
         ""]
        (overview-lines by-rule)
        [""]
        (mapcat (fn [[_ fs]] (rule-lines root fs)) by-rule))))))
