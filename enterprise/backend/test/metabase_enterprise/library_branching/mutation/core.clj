(ns metabase-enterprise.library-branching.mutation.core
  "Mutation testing in the running JVM. A mutation is data: a name, a target, and edits of the target's source form.
  A run applies each mutation to the loaded code, runs the tests, restores the target, and gives one result per
  mutation:

  - :killed   a test failed or threw;
  - :survived every test passed;
  - :timeout  the tests did not end within the timeout;
  - :invalid  an edit matched no form or several forms, or the mutated form did not compile.

  A mutation declaration:

    {:name   :nowitness                 ; keyword
     :doc    \"The rule it removes.\"    ; string
     :target `ns/f                      ; a var, or [:method `ns/multi dispatch-value]
     :edits  [[:replace '(check! x) nil]]
     :expect :killed                    ; or :survived; default :killed
     :tests  [#'ns-test/f-test]}        ; optional: overrides the :tests option of the run

  An edit finds the one form in the target's source form that equals its pattern (as read in the target's namespace,
  so `::k` and `::alias/k` match their full names), then changes it:

  - [:replace pattern form]  the form instead of the match;
  - [:negate pattern]        `(clojure.core/not match)`;
  - [:remove pattern]        the match removed from its parent form;
  - [:edit pattern f]        `(f match)`.

  A last element `{:nth n}` chooses the nth match (from 0, depth-first) when several forms equal the pattern.

  The target's namespace must be loaded. The mutated code is visible only to callers that call through the var at
  call time: not to inlined functions, to direct-linked code, or to values captured at load time. A run changes
  global state: no other test may run in the same JVM at the same time."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :as t]
   [malli.error :as me]
   [metabase.util.malli.registry :as mr]
   [rewrite-clj.node :as n]
   [rewrite-clj.zip :as z])
  (:import
   (clojure.lang Compiler LineNumberingPushbackReader MultiFn Var)
   (java.io StringReader)
   (java.util.concurrent ExecutionException)))

(set! *warn-on-reflection* true)

(def ^:private running?
  "True while a run is in progress in this JVM."
  (atom false))

;;; Declarations

(def ^:private Edit
  (let [opts [:? [:map {:closed true} [:nth nat-int?]]]]
    [:and vector?
     [:orn
      [:replace [:cat [:= :replace] :any :any opts]]
      [:negate  [:cat [:= :negate] :any opts]]
      [:remove  [:cat [:= :remove] :any opts]]
      [:edit    [:cat [:= :edit] :any ifn? opts]]]]))

(def ^:private Tests
  [:or simple-symbol? [:sequential {:min 1} [:fn var?]]])

(def ^:private Mutation
  [:map
   [:name :keyword]
   [:doc :string]
   [:target [:or qualified-symbol? [:tuple [:= :method] qualified-symbol? :any]]]
   [:edits [:sequential {:min 1} Edit]]
   [:expect {:optional true} [:enum :killed :survived]]
   [:tests {:optional true} Tests]])

(defn- validate-mutation! [mutation]
  (when-not (mr/validate Mutation mutation)
    (throw (ex-info (str "Invalid mutation " (pr-str (:name mutation)) ": "
                         (pr-str (me/humanize (mr/explain Mutation mutation))))
                    {:mutation mutation}))))

;;; Edits

(defn- zipper-opts [ns-sym]
  (let [ns-obj (the-ns ns-sym)]
    {:auto-resolve (fn [alias]
                     (if (= alias :current)
                       ns-sym
                       (or (some-> (get (ns-aliases ns-obj) alias) ns-name)
                           alias)))}))

(defn- form= [loc pattern]
  (and (z/sexpr-able? loc)
       (= pattern (try (z/sexpr loc) (catch Exception _ ::unreadable)))))

(defn- matches [loc pattern]
  (->> (iterate z/next loc)
       (take-while (complement z/end?))
       (filter #(form= % pattern))))

(defn- apply-edit [zopts form-text [op pattern & more :as edit]]
  (let [[value opts] (case op
                       (:replace :edit) more
                       [nil (first more)])
        found   (vec (matches (z/of-string form-text zopts) pattern))
        loc     (cond
                  (:nth opts)
                  (or (get found (:nth opts))
                      (throw (ex-info (format "Edit %s: pattern matches %d forms, so it has no match %d."
                                              (pr-str edit) (count found) (:nth opts))
                                      {:edit edit})))

                  (empty? found)
                  (throw (ex-info (format "Edit %s: pattern matches no form." (pr-str edit)) {:edit edit}))

                  (next found)
                  (throw (ex-info (format "Edit %s: pattern matches %d forms; give {:nth n}." (pr-str edit)
                                          (count found))
                                  {:edit edit}))

                  :else
                  (first found))]
    (z/root-string
     (case op
       :replace (z/replace loc value)
       :negate  (z/replace loc (n/list-node [(n/token-node 'clojure.core/not) (n/spaces 1) (z/node loc)]))
       :remove  (z/remove loc)
       :edit    (z/replace loc (value (z/sexpr loc)))))))

(defn apply-edits
  "The source text `form-text` after `edits`, in order. `ns-sym` names the namespace that resolves `::` keywords.
  Throws when an edit matches no form, or several forms and has no `{:nth n}`."
  [ns-sym form-text edits]
  (let [zopts (zipper-opts ns-sym)]
    (reduce (partial apply-edit zopts) form-text edits)))

;;; Targets

(defn- source-text [file]
  (cond
    (io/resource file)          (slurp (io/resource file))
    (.exists (io/file ^String file)) (slurp file)
    :else (throw (ex-info (str "No source file " file) {:file file}))))

(defn- top-level-forms [text]
  (->> (z/of-string text {:track-position? true})
       (iterate z/right)
       (take-while some?)))

(defn- find-form [text pred]
  (or (some #(when (pred %) %) (top-level-forms text))
      (throw (ex-info "No source form for the target." {}))))

(defn- loaded-var ^Var [sym]
  (or (find-var sym)
      (throw (ex-info (str "No var " sym "; load its namespace first.") {:symbol sym}))))

(defn- resolves-to? [ns-obj loc v]
  (and loc
       (symbol? (try (z/sexpr loc) (catch Exception _ nil)))
       (= v (ns-resolve ns-obj (z/sexpr loc)))))

(defn- locate
  "`{:ns ns-sym :file path :line n :text form-text :snapshot f}`, where `(f)` restores the target."
  [target]
  (if (symbol? target)
    (let [v                     (loaded-var target)
          {:keys [file line ns]} (meta v)
          _                     (when-not (and file line)
                                  (throw (ex-info (str "Var " target " has no source location.") {:target target})))
          loc                   (find-form (source-text file) #(= line (first (z/position %))))
          root                  (.getRawRoot v)
          var-meta              (meta v)]
      {:ns       (ns-name ns)
       :file     file
       :line     line
       :text     (z/string loc)
       :snapshot (fn []
                   (alter-var-root v (constantly root))
                   (reset-meta! v var-meta))})
    (let [[_ multi-sym dispatch] target
          multi-var              (loaded-var multi-sym)
          ^MultiFn mf            @multi-var
          {:keys [file ns]}      (meta multi-var)
          method                 (get (methods mf) dispatch)
          loc                    (find-form (source-text file)
                                            (fn [loc]
                                              (let [head (z/down loc)]
                                                (and (z/list? loc)
                                                     (resolves-to? ns head #'defmethod)
                                                     (resolves-to? ns (z/right head) multi-var)
                                                     (= dispatch (z/sexpr (z/right (z/right head))))))))]
      {:ns       (ns-name ns)
       :file     file
       :line     (first (z/position loc))
       :text     (z/string loc)
       :snapshot (fn []
                   (if method
                     (.addMethod mf dispatch method)
                     (remove-method mf dispatch)))})))

(defn- load-form! [{:keys [ns file line]} text]
  (let [rdr (doto (LineNumberingPushbackReader. (StringReader. text))
              (.setLineNumber (int line)))]
    (binding [*ns* (the-ns ns)]
      (Compiler/load rdr ^String file (.getName (io/file ^String file))))))

;;; Tests

(defn- var-symbol [v]
  (let [{:keys [ns name]} (meta v)]
    (symbol (str (ns-name ns)) (str name))))

(defn- test-vars [tests]
  (if (symbol? tests)
    (->> (vals (ns-interns (the-ns tests)))
         (filter (comp :test meta))
         (sort-by (comp :line meta)))
    tests))

(defn- run-test-var
  "The :fail and :error reports of `v`."
  [v]
  (let [events (atom [])]
    (binding [t/report (fn [m]
                         (when (#{:fail :error} (:type m))
                           (swap! events conj (assoc m :test (var-symbol v)))))]
      (try
        (t/test-vars [v])
        (catch Throwable e
          (swap! events conj {:type :error :test (var-symbol v) :actual e}))))
    @events))

(defn- run-tests
  "`{:failed [test-symbol ...] :failure first-report}`. Stops at the first failing test."
  [vars]
  (reduce (fn [acc v]
            (if-let [[event] (seq (run-test-var v))]
              (reduced {:failed [(var-symbol v)] :failure event})
              acc))
          {:failed []}
          vars))

(defn- with-timeout [timeout-ms f]
  (if-not timeout-ms
    (f)
    (let [ended  (promise)
          fut    (future (try (f) (finally (deliver ended true))))
          result (try
                   (deref fut timeout-ms ::timeout)
                   (catch ExecutionException e
                     (throw (or (.getCause e) e))))]
      (when (= ::timeout result)
        (future-cancel fut)
        ;; The cancelled tests still run their finally blocks, which clean up the app DB. The next run must not start
        ;; before they end.
        (deref ended timeout-ms nil))
      result)))

;;; Runs

(defn- run-one [{:keys [target edits] :as mutation} vars timeout-ms]
  (let [located (locate target)
        start   (System/nanoTime)
        result  (try
                  (load-form! located (apply-edits (:ns located) (:text located) edits))
                  (let [outcome (with-timeout timeout-ms #(run-tests vars))]
                    (cond
                      (= ::timeout outcome) {:result :timeout}
                      (seq (:failed outcome)) {:result    :killed
                                               :killed-by (:failed outcome)
                                               :failure   (select-keys (:failure outcome)
                                                                       [:type :message :expected :actual])}
                      :else {:result :survived}))
                  (catch Throwable e
                    {:result :invalid
                     :reason (str (ex-message e)
                                  (some->> (ex-cause e) ex-message (str " ")))})
                  (finally
                    ((:snapshot located))))]
    (merge (select-keys mutation [:name :doc :target])
           {:expect (:expect mutation :killed)
            :ms     (quot (- (System/nanoTime) start) 1000000)}
           result)))

(defn run-mutations
  "The result of each of `mutations`, in order: the mutation's `:name`, `:doc`, `:target` and `:expect`, its
  `:result`, `:ms`, and `:killed-by` and `:failure` for :killed, `:reason` for :invalid. Returns nil when another
  run is in progress, so a run among the tests of a run does not recurse.

  `opts`: `:tests`, the test vars or a loaded test namespace symbol for each mutation that names none; `:timeout-ms`
  (default 30000, nil for none), the time the tests of one mutation may take. After a timeout, the run waits at most as
  long again for the cancelled tests to end.

  Each test var runs at most once with no mutation, however many mutations name it.

  Throws when a declaration is invalid, when a mutation has no tests, or when its tests fail with no mutation."
  ([mutations]
   (run-mutations mutations {}))
  ([mutations {:keys [tests timeout-ms] :or {timeout-ms 30000}}]
   (when (compare-and-set! running? false true)
     (try
       (run! validate-mutation! mutations)
       (let [vars-of   (fn [mutation]
                         (or (some-> (or (:tests mutation) tests) test-vars seq vec)
                             (throw (ex-info (str "Mutation " (:name mutation) " has no tests.")
                                             {:mutation mutation}))))
             ;; The test vars that passed with no mutation. The lists of several mutations can share a test var.
             passed    (atom #{})
             baseline! (fn [vars]
                         (let [{:keys [failed failure]} (run-tests (remove @passed vars))]
                           (when (seq failed)
                             (throw (ex-info (str "The tests fail with no mutation: " (str/join ", " failed))
                                             {:failed failed :failure failure})))
                           (swap! passed into vars)))]
         (mapv (fn [mutation]
                 (let [vars (vars-of mutation)]
                   (baseline! vars)
                   (run-one mutation vars timeout-ms)))
               mutations))
       (finally
         (reset! running? false))))))

(defn preview
  "`{:original text :mutated text}`: the source form of the target of `mutation`, without and with its edits."
  [{:keys [target edits]}]
  (let [{:keys [ns text]} (locate target)]
    {:original text
     :mutated  (apply-edits ns text edits)}))

;;; Results

(defn- target-string [target]
  (if (symbol? target)
    (str target)
    (let [[_ multi dispatch] target]
      (str multi " " (pr-str dispatch)))))

(defn- detail [{:keys [result killed-by reason ms]}]
  (case result
    :killed   (str/join ", " killed-by)
    :invalid  reason
    :timeout  (str "no end in " ms " ms")
    ""))

(defn report
  "A Markdown table of `results`, one row for each, then a list of their docs."
  [results]
  (str/join "\n"
            (concat ["| mutation | target | expect | result | detail |"
                     "|---|---|---|---|---|"]
                    (for [r results]
                      (format "| %s | %s | %s | %s | %s |"
                              (:name r) (target-string (:target r)) (name (:expect r)) (name (:result r))
                              (str/replace (str (detail r)) #"[|\n]" " ")))
                    [""]
                    (for [r results]
                      (str "- " (:name r) ": " (:doc r))))))

(defn- satisfied? [{:keys [expect result]}]
  (case result
    (:killed :timeout) (= :killed expect)
    :survived          (= :survived expect)
    false))

(defn is-expected
  "One `clojure.test/is` for each of `results`: its result is its expected result. A :timeout counts as :killed;
  an :invalid result fails."
  [results]
  (doseq [r results]
    (t/is (satisfied? r)
          (str "Mutation " (:name r) ": expected " (name (:expect r)) ", got " (name (:result r)) ". "
               (:doc r) "\n" (report [r])))))

(defn check
  "Runs `mutations` with `opts`, asserts the expected result of each, and returns the results."
  [mutations opts]
  (doto (run-mutations mutations opts)
    is-expected))
