(ns dev.security-lint.engine
  "Finds candidate call sites and asks rules about them.

  The engine knows two things rules don't: how to resolve a call to a fully qualified var (clj-kondo's analysis
  output) and how to get at the argument forms of that call (rewrite-clj). It knows nothing about any particular
  vulnerability -- every judgement is delegated to a rule's `:detect`.

  Resolution matters more than it looks: `(edn/read-string s)` and `(read-string s)` are one character apart in a
  grep and worlds apart in risk. Running the real analyzer is what makes the difference."
  (:require
   [clj-kondo.core :as kondo]
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.callgraph :as cg]
   [dev.security-lint.rule :as rule]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- candidate call sites --------------------------------------------

(defn- resolved-sym
  "Fully qualified symbol for a clj-kondo var-usage."
  [{:keys [to name]}]
  (when (and to name) (symbol (str to) (str name))))

(defn- var-usage-sites
  "Call sites for rules that trigger on a fully qualified var, taken from clj-kondo's analysis."
  [analysis rules]
  ;; trigger -> every rule that declares it. As a one-rule map this silently dropped all but the last rule on a
  ;; shared trigger, which left `insecure-tls-option` dead in every full scan behind `unguarded-outbound-http`.
  (let [wanted (reduce (fn [m r] (reduce #(update %1 %2 (fnil conj []) r) m (:triggers r))) {} rules)]
    (for [usage (:var-usages analysis)
          :let  [sym (resolved-sym usage)]
          r     (get wanted sym)]
      {:rule r :trigger sym :filename (:filename usage) :row (:row usage) :col (:col usage)})))

(defn- interop-match?
  "True if head symbol `head` names the same static method as `trigger`.

  Trigger `Cipher/getInstance` matches both `Cipher/getInstance` and `javax.crypto.Cipher/getInstance`, so a rule
  doesn't have to enumerate every import style."
  [head trigger]
  (and (qualified-symbol? head)
       (= (name head) (name trigger))
       (let [h (namespace head), t (namespace trigger)]
         (or (= h t) (str/ends-with? h (str "." t))))))

(defn- constructed-class
  "The class name a call form constructs, as written, or nil if it is not a constructor call.

  Clojure has three spellings -- `(Random.)`, `(new Random)` and, since 1.12, `(Random/new)` -- and a rule about
  the class must not care which one the author reached for."
  [node]
  (let [head (ast/head-sym node)]
    (cond
      (nil? head)
      nil

      (= 'new head)
      (let [cls (some-> (ast/arg node 0) ast/unmeta)]
        (when (ast/symbol-node? cls) (ast/->str cls)))

      (and (qualified-symbol? head) (= "new" (name head)))
      (namespace head)

      (str/ends-with? (str head) ".")
      (let [s (str head)] (subs s 0 (dec (count s)))))))

(defn- constructor-match?
  "True if call form `node` constructs the class named by `trigger`, whatever the spelling and whether or not the
  class name is package-qualified: `(Random.)`, `(java.util.Random.)`, `(new java.util.Random)` and
  `(java.util.Random/new)` all match a trigger of `Random`."
  [node trigger]
  (boolean
   (when-let [cls (constructed-class node)]
     (let [simple (if-let [i (str/last-index-of cls ".")] (subs cls (inc i)) cls)]
       (= simple (str trigger))))))

(defn- interop-sites
  "Call sites for rules that trigger on Java static methods, constructors, or a head symbol as written.

  clj-kondo's var-usages don't cover these, so the parsed source is walked instead. Resolution is by name, which
  is why these triggers are reserved for distinctive names. `call-nodes` is the one walk per file that also
  backs [[call-index]]; it comes from `ast/find-nodes`, which does not descend into `#_` forms, `(comment ...)`
  blocks or quoted data -- code that never compiles was producing :error findings before."
  [call-nodes filename rules]
  (let [triggers (for [r rules, t (:interop-triggers r)] [t r])
        ctors    (for [r rules, t (:constructor-triggers r)] [t r])
        forms    (for [r rules, t (:form-triggers r)] [t r])
        ;; `(:card_id m)`, `(get m :card_id)`: a read of a key whose name matches, watched by the key
        accessors (for [r rules, t (:accessor-triggers r)] [t r])]
    (when (or (seq triggers) (seq ctors) (seq forms) (seq accessors))
      (for [node  call-nodes
            :let  [head (ast/head-sym node)
                   [_ key] (when (seq accessors) (ast/accessor node))]
            :when (or head key)
            :let  [{:keys [row col]} (meta node)]
            hit   (concat
                   (when head
                     (concat
                      (for [[t r] triggers :when (interop-match? head t)] r)
                      (for [[t r] ctors :when (constructor-match? node t)] r)
                      (for [[t r] forms :when (= head t)] r)))
                   (when key
                     (for [[t r] accessors :when (re-find t (name key))] r)))]
        {:rule hit :trigger (or head key) :filename filename :row row :col col}))))

(defn- shape-sites
  "Sites for rules that watch a form by its shape rather than by what it calls: a vector headed by a keyword
  (`:vector-triggers`, how HoneySQL spells `[:raw ...]` and `[:like ...]`) or a form carrying a metadata marker
  (`:mark-triggers`, how a HoneySQL clause is blessed with `^:allow-subquery`).

  Neither is a call, so clj-kondo reports nothing at them and [[call-index]] does not hold them; each site
  carries its node. `marked` is the one [[ast/marked-nodes]] walk per file, so a rule reads the marks written on
  a vector as well as matching on them."
  [marked filename rules]
  (let [vectors (for [r rules, t (:vector-triggers r)] [t r])
        markers (for [r rules, t (:mark-triggers r)] [t r])]
    (when (or (seq vectors) (seq markers))
      (for [[node marks] marked
            :let  [{:keys [row col]} (meta node)
                   head (ast/vector-head node)]
            hit   (concat
                   (for [[t r] vectors :when (= head t)] r)
                   (for [[t r] markers :when (contains? marks t)] r))]
        {:rule hit :trigger (or head (first marks)) :filename filename :row row :col col
         :node node :marks marks}))))

;;; ------------------------------------------------- driving ---------------------------------------------------

(defn- zloc-for
  "Position-tracking zipper for `filename`, or nil if it can't be parsed."
  [filename]
  (try
    (z/of-string (slurp filename) {:track-position? true})
    (catch Exception _ nil)))

(defn- threaded-call
  "The call `step` stands for once `threaded` is threaded into it at `slot`: `http/get` in `(-> url http/get)`
  becomes `(http/get url)`, and `(http/get {:as :json})` becomes `(http/get url {:as :json})`.

  Built from the original nodes and positioned at `step`, where clj-kondo reports the usage, so a rule sees the
  arguments the function really receives and taint still finds the locals by their source positions."
  [step threaded slot]
  (let [[head & args] (if (ast/call? step) (ast/children step) [step])
        args          (if (= :last slot) (concat args [threaded]) (cons threaded args))]
    (with-meta (n/list-node (vec (interpose (n/spaces 1) (cons head args))))
               (meta step))))

(defn- threaded-calls
  "For a threading form, the call each step stands for, in order; nil for any other form.

  Each step is threaded with the previous step's call, so `(-> url first http/get)` yields `(first url)` and then
  `(http/get (first url))`, and a request value at the head of a chain reaches the sink at its end. `cond->`
  alternates tests with steps, and `doto` threads its subject into every step rather than the previous result. A
  step that is neither a token nor a list -- a `#()` or a vector -- is left alone."
  [node]
  (let [head (ast/head-sym node)]
    (when-let [slot (get vocab/threading-slots head)]
      (let [[subject & steps] (ast/args node)
            steps (if (#{'cond-> 'cond->>} head) (take-nth 2 (rest steps)) steps)]
        (when subject
          (loop [threaded subject, [step & more] steps, acc []]
            (cond
              (nil? step)
              acc

              (#{:token :list} (n/tag step))
              (let [call (threaded-call step threaded slot)]
                (recur (if (= 'doto head) subject call) more (conj acc call)))

              :else
              (recur step more acc))))))))

(defn- call-index
  "Every call node in a parsed file, by the position it starts at.

  clj-kondo reports a var usage at the call form's opening paren, so a site is a key lookup here. It used to be a
  `find-last-by-pos` walk from the root once per site -- 3,520 sites, 32 seconds -- for 0.3s of indexed lookups.
  A position that is not a call (a `:refer`'d name in the ns form, say) is simply absent.

  Two shapes are not list forms at the reported position and used to be dropped on the floor. A `#(f x)` literal
  starts at the `#` and kondo reports the call one column in, at the `(`. A step in a threading macro is reported
  at the step itself -- the bare symbol, or the list without its threaded argument -- so those positions hold the
  call the step stands for, see [[threaded-calls]]."
  [root]
  (let [calls (ast/find-nodes ast/call? root)
        pos   (fn [nd]
                (let [{:keys [row col]} (meta nd)]
                  [row (if (= :fn (n/tag nd)) (inc col) col)]))
        at    (-> (into {} (map (juxt pos identity)) calls)
                  (into (map (juxt pos identity)) (mapcat threaded-calls calls)))]
    {:nodes (vals at)
     :at    at}))

(defn- node-at
  "The call form starting at `[row col]`, or nil."
  [{:keys [at]} row col]
  (get at [row col]))

(defn- run-analysis
  "clj-kondo's analysis for `paths`. We only want the analysis data, so linting output is discarded."
  [paths config-dir]
  (:analysis
   (kondo/run! (cond-> {:lint   (vec paths)
                        :config {:output {:analysis {:var-usages true :locals true} :format :edn}}}
                 config-dir (assoc :config-dir config-dir)))))

(defn- call-graph-positions
  "Tainted local-usage positions, by filename, computed across the whole scan.

  Unlike the other two policies this cannot be done a file at a time: a request value bound in one namespace
  reaches its sink through a call into another. `roots` is every parsed file, `{filename root-node}`; the rule
  pass reads the same trees, so each file is parsed once for the whole scan.

  Returns `{:tainted {filename {[row col] #{label}}} :reach <see [[cg/reachable-regions]]>}` -- the same walk answers both
  \"could a request influence this value\" and \"could a request get here at all\"."
  [analysis roots]
  (let [ns-by-file (into {} (map (juxt :filename :name)) (:namespace-definitions analysis))
        tables     (into {} (for [[f root] roots]
                              [f (cg/extract f (get ns-by-file f 'unknown) root)]))
        ;; clj-kondo has already resolved every call; reuse that rather than re-deriving it from aliases
        resolution (into {} (for [u (:var-usages analysis) :when (and (:to u) (:name u))]
                              [{:filename (:filename u) :row (:row u) :col (:col u)}
                               (symbol (str (:to u)) (str (:name u)))]))
        ;; the same, keyed by the symbol's own position: a defmethod's name is an argument, not a call head
        name-resolution (into {} (for [u (:var-usages analysis) :when (and (:to u) (:name u) (:name-row u))]
                                   [{:filename (:filename u) :row (:name-row u) :col (:name-col u)}
                                    (symbol (str (:to u)) (str (:name u)))]))
        tables     (-> tables
                       (cg/resolve-multimethods name-resolution)
                       (cg/add-value-reference-sites (:var-usages analysis)))
        reach      (cg/reachable-regions {:tables tables :resolve resolution})
        origins    (cg/origin-calls tables (:var-usages analysis))
        ;; the functions that return formatted SQL are sanitizers too, at a sink and across a binding
        sanitizing (into vocab/resolved-sanitizers (cg/sanitizing-fns tables resolution))
        sanitized  (cg/resolved-sanitized-regions tables (:var-usages analysis) sanitizing)
        {tainted :tainted return-sites :return-sites}
        (cg/propagate* {:tables          tables
                        :locals          (:locals analysis)
                        :local-usages    (:local-usages analysis)
                        :sources         (cg/source-labels tables (:locals analysis))
                        :origins         origins
                        :extra-sanitized sanitized
                        :resolve         resolution})
        ;; positions a validating guard has already vouched for, removed rather than reported again
        vouched    (cg/sanitized-positions {:tables       tables
                                            :local-usages (:local-usages analysis)
                                            :tainted      tainted})
        by-file    (reduce (fn [acc {:keys [id filename row col]}]
                             (if-let [ls (get tainted id)]
                               (update acc filename (fnil assoc {}) [row col] ls)
                               acc))
                           {}
                           (:local-usages analysis))]
    {;; {filename {[row col] #{label}}}: every label, at every usage
     :tainted    (into {} (for [[f ps] by-file]
                            [f (apply dissoc ps (get vouched f))]))
     ;; the same keyed by the *binding* position, for a rule that asks about a parameter that is never used
     :bindings   (reduce (fn [acc {:keys [id filename row col]}]
                           (if-let [ls (get tainted id)]
                             (update acc filename (fnil assoc {}) [row col] ls)
                             acc))
                         {}
                         (:locals analysis))
     ;; {filename {[row col] #{label}}}: the origin calls themselves, and the calls to functions that return
     ;; tainted data, so a value used straight out of one -- `(http/get (tile-server-url))`,
     ;; `(sink (:name (fetch id)))` -- is tainted at the sink with no binding in between
     :origins    (as-> {} acc
                   (reduce (fn [acc {:keys [filename row col label]}]
                             (update-in acc [filename [row col]] (fnil into #{}) (if (sequential? label) label [label])))
                           acc origins)
                   (reduce (fn [acc {:keys [filename row col labels]}]
                             (update-in acc [filename [row col]] (fnil into #{}) labels))
                           acc return-sites))
     ;; {filename #{[row col]}}: calls resolved to a sanitizer that no name would reveal -- `honey.sql/format`,
     ;; or a function whose every tail is one -- by the position clj-kondo reports the call at
     :sanitized  (reduce (fn [acc {:keys [filename row col to name]}]
                           (if (and to name (contains? sanitizing (symbol (str to) (str name))))
                             (update acc filename (fnil conj #{}) [row col])
                             acc))
                         {}
                         (:var-usages analysis))
     :reach      reach
     :ns-by-file ns-by-file}))

(defn- taint-positions
  "Positions of the local usages a rule should treat as attacker-influenced, under `policy`.

    :call-graph - trust-boundary values propagated through lets and calls (default)
    :any-local  - every local binding usage; an audit mode that assumes nothing

  A third policy, `:request`, once sourced taint at endpoint parameters without propagating it. It took four rules
  to zero because handlers delegate to helper namespaces, and `:call-graph` superseded it entirely. A zero from a
  taint-dependent rule is still not proof of absence: taint does not follow values routed through atoms or
  dynamic vars, protocol implementations, or the reduce/swap!/update family.

  A rule may pin `:any-local` for itself with `:taint-policy`, whatever the scan runs under. That is for the
  rules whose sources the graph cannot see: a warehouse column name or a stored card option is not a request
  value, and the raw-SQL sites those reach were the majority of the SQL findings in the security tracker. Such a
  rule still receives the call-graph positions as `:boundary-locals`, so it can grade a request-reachable value
  above a merely dynamic one."
  [policy per-file-cg local-usages]
  (case policy
    :any-local (into {} (map (fn [pos] [pos #{:local}])) (taint/all-local-positions local-usages))
    per-file-cg))

(defn- test-file?
  "Test code deliberately does insecure things. Scanning it was already refused by four separate rules'
  exemption lists; one decision here replaces those."
  [rel-path]
  (boolean (re-find #"(^|/)test/|_test\.clj[cs]?$" rel-path)))

(defn- relative-to
  "`path` relative to `root`, with any leading `./` dropped.

  clj-kondo echoes a lint path exactly as given, so `src/x.clj`, `./src/x.clj` and `/abs/src/x.clj` are three
  names for one file. Exemption patterns anchored on `^src/` matched only the first, and the same scan spelled
  two ways produced different findings."
  [root ^String path]
  (let [root (when root (str (str/replace root #"/+$" "") "/"))
        p    (if (and root (str/starts-with? path root)) (subs path (count root)) path)]
    (str/replace p #"^(\./)+" "")))

(defn- finding
  "Turn a rule's `:detect` result into a finding, carrying the rule's metadata along for the reporter."
  [{:keys [rule filename row col]} node result reachable-from & [ctx]]
  (let [{:keys [end-row end-col]} (meta node)
        ;; the boundaries the values *in* the form crossed -- its arguments, not the form itself, which may be
        ;; an origin in its own right (`http/get` is a sink for its URL and a source for its response) -- judged
        ;; over the boundary map whatever policy the rule ran under
        origins  (if ctx
                   (let [ctx (assoc ctx :locals (:boundary-locals ctx))]
                     (into #{} (comp (mapcat #(taint/origins ctx %))
                                     (remove #{:local :request/untyped :request/structured}))
                           (if (ast/call? node) (ast/args node) (rest (ast/children node)))))
                   #{})
        ;; A stored origin grades exactly as a request does. The model cannot tell a row the server wrote from
        ;; one a user did -- and should not try: a row in the application database can always be written by
        ;; other means than this code (SEC-1018 through SEC-1023 forged sessions and API keys that way), so
        ;; nothing read back from it is trusted.
        severity (rule/severity-for rule (:tainted? result))]
    (merge {:rule-id   (:id rule)
            :rule-name (:name rule)
            :file      filename
            :row       row
            :col       col
            :end-row   (or end-row row)
            :end-col   (or end-col col)
            :severity  severity
            :precision (:precision rule)
            :cwe       (:cwe rule)
            ;; the text report explains a rule once, above its findings
            :description (:description rule)
            :remediation (:remediation rule)
            :snippet   (some-> node n/string str/split-lines first)
            ;; the whole form, formatting removed: what the SARIF fingerprint hashes
            :form      (ast/normalized-text node)
            ;; :http means a request can trigger it -- the triage question; the full set says what else can
            :reachable-from      reachable-from
            :endpoint-reachable? (contains? reachable-from :http)
            :origins             origins}
           result)))

(defn- endpoint-findings
  "Findings from rules that fire once per endpoint form rather than per sink.

  These ask what an endpoint *reaches* -- an enablement check, a token verification, a model read with no
  authorization on the way -- which is a question about the call graph, not about any one call site. They only
  run under the `:call-graph` policy, since that is where the graph exists."
  [rules reach ns-sym index filename root {:keys [bindings labels origin-calls]}]
  (for [entry (cg/entries reach)
        ;; these rules are about HTTP endpoints; a job or a queue consumer is not one
        :when (and (= filename (:filename entry)) (= :http (:kind entry)))
        :let  [node    (node-at index (:row entry) (:col entry))
               ;; once per endpoint, not once per rule: with dispatch resolved a closure can hold every driver
               reaches (when node (cg/entry-closure reach entry))]
        :when node
        rule  rules
        :when (not (rule/exempt? rule (relative-to root filename)))
        :let  [site   {:rule rule :filename filename :row (:row entry) :col (:col entry)}
               ctx    {:node                node
                       :site                site
                       :filename            filename
                       :endpoint-ns         ns-sym
                       :reaches             reaches
                       ;; the endpoint's own helpers: two call hops, for rules the full closure drowns
                       :nearby              (cg/entry-neighbourhood reach entry 2)
                       :ns-middleware       (get-in reach [:ns-middleware-by-file filename] #{})
                       ;; every router wrapper applied to this namespace's handler, from any file
                       :ns-wrappers         (get-in reach [:wrappers-by-ns ns-sym] #{})
                       ;; labels by binding position and by usage position, for what an endpoint's own
                       ;; parameters carry -- the checks among them
                       :bindings            bindings
                       :labels              labels
                       ;; so `taint/origins` and `taint/checks` work on the endpoint's own body
                       :locals              (taint/boundary-labels labels)
                       :origin-calls        origin-calls
                       :reachable-from      #{:http}
                       :endpoint-reachable? true}
               result ((:detect rule) ctx)]
        :when result]
    (assoc (finding site node result #{:http})
           :flows {:http {:count   1
                          :entries [(:name entry)]
                          :path    [{:name (:name entry) :kind :http :filename filename
                                     :row (:row entry) :col (:col entry)}]}})))

(defn- distinct-findings
  "Drop duplicate findings for the same rule at the same position.

  A rule may declare overlapping triggers -- a macro that clj-kondo resolves as a var *and* a form trigger for the
  cases it doesn't -- and must still report once."
  [findings]
  (->> findings
       (reduce (fn [[seen acc] f]
                 (let [k [(:rule-id f) (:file f) (:row f) (:col f)]]
                   (if (contains? seen k) [seen acc] [(conj seen k) (conj acc f)])))
               [#{} []])
       second))

(defn analyze
  "Run `rules` over `paths` and return findings.

  Options:
    :paths      - directories or files to scan (required)
    :rules      - rules to apply, defaults to everything registered
    :config-dir - clj-kondo config directory, so project macros and hooks resolve correctly
    :taint-sources - :call-graph (default) or :any-local; see [[taint-positions]]
    :root       - repository root; filenames are made relative to it before exemption patterns are applied
    :include-tests? - scan test files too; off by default, since test code deliberately does insecure things

  Returns the findings, with `:unparsed` metadata listing any files rewrite-clj could not parse. Those files
  contribute nothing to the scan, and a report that hid that could not be told apart from a clean one."
  [{:keys [paths rules config-dir taint-sources root include-tests?]}]
  (let [rules    (or rules (rule/all))
        analysis (run-analysis paths config-dir)
        ;; group by file so each source file is read and parsed exactly once, however many sites it holds
        by-file  (group-by :filename (var-usage-sites analysis rules))
        uses     (group-by :filename (:local-usages analysis))
        locals-by-file (group-by :filename (:locals analysis))
        files    (cond->> (into (set (keys by-file)) (map :filename (:var-usages analysis)))
                   (not include-tests?) (into #{} (remove #(test-file? (relative-to root %)))))
        unparsed (volatile! [])
        ;; every file parsed once, for the graph and the rule pass alike. Trees were once parsed, reduced and
        ;; released to save memory, and parsed again -- twice more for the files with endpoints; at 2,000
        ;; files that was a third of the scan, for a few hundred megabytes of heap.
        roots    (into {} (for [f (sort files)]
                            (if-let [zloc (zloc-for f)]
                              [f (z/root zloc)]
                              (do (vswap! unparsed conj f) nil))))
        indexes  (into {} (for [[f root] roots] [f (call-index root)]))
        graph    (when-not (= :any-local taint-sources)
                   (call-graph-positions analysis roots))
        cg-pos   (:tainted graph)
        bindings (:bindings graph)
        origin-pos (:origins graph)
        sanitized-pos (:sanitized graph)
        reach    (:reach graph)
        ns-by-file (into {} (map (juxt :filename :name)) (:namespace-definitions analysis))
        endpoint-rules (filter :endpoint-rule rules)]
    (with-meta
     (vec
      (distinct-findings
       (concat
        (for [[filename root-node] (sort-by key roots)
              :let     [index   (get indexes filename)
                        labels  (get cg-pos filename {})
                        ;; a position whose only labels are checks is not tainted; the checks are asked for by name
                        tainted (taint-positions taint-sources (taint/boundary-labels labels) (get uses filename))
                        ;; only the rules that ask for it pay for the broader policy
                        any-local (delay (taint-positions :any-local nil (get uses filename)))
                        ;; the positions that may hold a string, a map or a vector, and the ones that may hold
                        ;; a HoneySQL clause, for rules about the *shape* of a value -- once per file, not per site
                        untyped    (if graph (taint/select-labels tainted taint/untyped-label?) tainted)
                        structured (if graph (taint/select-labels tainted taint/structured-label?) tainted)
                        marked  (delay (ast/shape-nodes root-node))
                        inits   (delay (taint/local-inits (:nodes index) (get locals-by-file filename) (get uses filename)))]
              site     (concat (get by-file filename)
                               (interop-sites (:nodes index) filename rules)
                               (when (some #(or (:vector-triggers %) (:mark-triggers %)) rules)
                                 (shape-sites @marked filename rules)))
              :when    (not (rule/exempt? (:rule site) (relative-to root filename)))
              :let     [node (or (:node site) (node-at index (:row site) (:col site)))]
              :when    node
              :let     [kinds  (if reach (cg/reachable-from reach site) #{})
                        ctx    {:node node :site site :filename filename :ns (get ns-by-file filename)
                                :locals (if (= :any-local (:taint-policy (:rule site))) @any-local tainted)
                                ;; the call-graph positions regardless of the rule's policy -- every value that
                                ;; crossed a trust boundary, with its labels -- so a rule under :any-local can
                                ;; still tell one from a merely dynamic value
                                :boundary-locals     tainted
                                ;; every label at every usage, checks included; `taint/checks` reads it
                                :labels              (if graph labels tainted)
                                :untyped-locals      untyped
                                :structured-locals   structured
                                :marks               (:marks site #{})
                                :origin-calls        (get origin-pos filename {})
                                :sanitized-calls     (get sanitized-pos filename #{})
                                ;; so a use of a local can be judged by what it was bound to
                                :local-inits         @inits
                                ;; what can reach this code: :http means a request can
                                :reachable-from      kinds
                                :endpoint-reachable? (contains? kinds :http)}
                        ;; `:tainted-arg` resolves the taint of one argument up front, so a rule can branch on it
                        ;; without every body repeating the same call
                        ctx    (if-let [n (:tainted-arg (:rule site))]
                                 (assoc ctx :tainted? (taint/tainted? ctx (ast/arg node n)))
                                 ctx)
                        result ((:detect (:rule site)) ctx)]
              :when    result]
          (cond-> (finding site node result kinds ctx)
            reach (assoc :flows (cg/flows-to reach site))))
        ;; endpoint-triggered rules visit only the files that hold an endpoint form
        (when (and reach (seq endpoint-rules))
          (for [filename (sort (distinct (map :filename (cg/entries reach))))
                :when    (contains? roots filename)
                f        (endpoint-findings endpoint-rules reach (get ns-by-file filename)
                                            (get indexes filename) filename root
                                            {:bindings     (get bindings filename {})
                                             :labels       (get cg-pos filename {})
                                             :origin-calls (get origin-pos filename {})})]
            f)))))
     {:unparsed @unparsed})))
