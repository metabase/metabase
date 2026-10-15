(ns metabase-enterprise.library-branching.mutation.core
  "Mutation testing in the running JVM. A mutation is data: a name, a target, and edits of the target's source form.
  A run applies each mutation to the loaded code, runs the tests, restores the target, and gives one result per
  mutation:

  - :killed   a test failed or threw;
  - :survived every test passed;
  - :timeout  the tests did not end within the timeout. The run stops their thread; `:leaked` describes the thread
              when it still runs after the stop;
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
   (clojure.lang Compiler ExceptionInfo LineNumberingPushbackReader MultiFn Var)
   (java.io StringReader)))

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

(defn- mutated-text
  "The source form of `located` (a result of [[locate]]) after `edits`. Throws when an edit matches no form, or several
  forms and has no `{:nth n}`; the message names the edit, `target` and the source file and line of the form."
  [{:keys [ns file line text]} target edits]
  (try
    (apply-edits ns text edits)
    (catch ExceptionInfo e
      (throw (ex-info (format "%s Target %s, source form at %s:%d." (ex-message e) (pr-str target) file line)
                      (assoc (ex-data e) :target target :file file :line line))))))

(defn- load-form! [{:keys [ns file line]} text]
  (let [rdr (doto (LineNumberingPushbackReader. (StringReader. text))
              (.setLineNumber (int line)))]
    (binding [*ns* (the-ns ns)]
      (Compiler/load rdr ^String file (.getName (io/file ^String file))))))

;;; Stops
;;; The JVM cannot kill a thread, so a timed-out run stops the thread of its tests at stop points: each call through a
;;; function var of the module, and each `recur` of the mutated form.

(def ^:private stop-ns-prefix
  "The prefix of the names of the namespaces whose function vars are stop points."
  "metabase-enterprise.library-branching.")

(def ^:private rearm-ms
  "The time after which a stop point throws again while the stopped thread runs."
  1000)

(def ^:private stopping
  "The thread that a run stops, or nil."
  (atom nil))

(def ^:private armed?
  "True when the next stop point on the thread of [[stopping]] throws."
  (atom false))

(defn stop-point!
  "Throws a `ThreadDeath` on the thread that a run stops, once each time the run arms the stop; else nil."
  []
  (when (and (identical? (Thread/currentThread) @stopping)
             (compare-and-set! armed? true false))
    ;; test.check passes a ThreadDeath on and catches every other Throwable, so a property does not shrink on it.
    (throw (ThreadDeath.))))

(defn- stoppable-root? [root]
  (or (fn? root) (instance? MultiFn root)))

(defn- stoppable-vars
  "The function and multimethod vars of the loaded namespaces whose names start with [[stop-ns-prefix]], but those
  of this namespace, protocol methods, macros and dynamic vars."
  []
  (let [this-ns (:ns (meta #'stop-point!))]
    (for [ns-obj  (all-ns)
          :when   (and (not= this-ns ns-obj) (str/starts-with? (str (ns-name ns-obj)) stop-ns-prefix))
          ^Var v  (vals (ns-interns ns-obj))
          :let    [m (meta v)]
          :when   (and (.hasRoot v) (not (.isDynamic v)) (not (:macro m)) (not (:protocol m))
                       (stoppable-root? (.getRawRoot v)))]
      v)))

(defn- wrap-var!
  "Puts a stop point before each call of the root of `v`. Returns `[v wrapper root]`, or nil when the root is not a
  function."
  [^Var v]
  (let [wrapped (volatile! nil)]
    (alter-var-root v (fn [root]
                        (if (stoppable-root? root)
                          ;; The metadata of the root goes with it: `with-dynamic-fn-redefs` knows its proxies by it.
                          (let [wrapper (with-meta (fn [& args] (stop-point!) (apply root args)) (meta root))]
                            (vreset! wrapped [v wrapper root])
                            wrapper)
                          root)))
    @wrapped))

(defn- unwrap-var!
  "Gives `v` its root back, when its root is still `wrapper`. A root that changed since the wrap, for example by the
  end of a `with-redefs` on the stopped thread, stays."
  [[^Var v wrapper root]]
  (alter-var-root v (fn [current] (if (identical? current wrapper) root current))))

(defn- with-stop-points
  "`form-text` with a call of [[stop-point!]] before each `recur`, so that a loop of the form that calls no var stops."
  [form-text]
  (let [stop (n/list-node [(n/token-node `stop-point!)])]
    (loop [loc (z/of-string form-text)]
      (cond
        (z/end? loc)
        (z/root-string loc)

        (and (z/list? loc)
             (some-> (z/down loc) (form= 'recur)))
        ;; `(do (stop-point!) (recur ...))` keeps the `recur` in tail position. The walk goes on inside the `recur`.
        (recur (-> (z/replace loc (n/list-node [(n/token-node 'do) (n/spaces 1) stop (n/spaces 1) (z/node loc)]))
                   z/down z/right z/right z/down z/next))

        :else
        (recur (z/next loc))))))

(defn- thread-description
  "The name of `thread` and its innermost frames."
  [^Thread thread]
  (str/join " at " (cons (.getName thread) (take 8 (.getStackTrace thread)))))

(defn- stop!
  "Stops `thread`, the thread of the tests of a timeout, within `grace-ms`: interrupts it, and makes its stop points
  throw while it runs. The thread runs its `finally` blocks as it ends, so its `with-redefs` give back their roots.
  Returns the [[thread-description]] of `thread` when it still runs after `grace-ms`, else nil."
  [^Thread thread grace-ms]
  (let [deadline (+ (System/currentTimeMillis) grace-ms)
        wrapped  (volatile! [])]
    (try
      (reset! stopping thread)
      (doseq [v (stoppable-vars)]
        (some->> (wrap-var! v) (vswap! wrapped conj)))
      (reset! armed? true)
      (.interrupt thread)
      (loop []
        (let [left (- deadline (System/currentTimeMillis))]
          (when (and (pos? left) (.isAlive thread))
            ;; A stop point throws once, so that the `finally` blocks of the tests can call the module. It throws
            ;; again after `rearm-ms`, for a thread that caught the first one and runs on.
            (.join thread (long (min left rearm-ms)))
            (reset! armed? true)
            (recur))))
      (when (.isAlive thread)
        (thread-description thread))
      (finally
        (reset! armed? false)
        (reset! stopping nil)
        (run! unwrap-var! (rseq @wrapped))))))

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
  "The :fail and :error reports of `v`. On a thread that a run stops, an error ends the test."
  [v]
  (let [events (atom [])]
    (binding [t/report (fn [m]
                         (when (#{:fail :error} (:type m))
                           (swap! events conj (assoc m :test (var-symbol v))))
                         ;; `is` reports every Throwable and goes on, so the stop or the interrupt would end only the
                         ;; one assertion. The `finally` blocks of the test still run.
                         (when (and (= :error (:type m))
                                    (instance? Throwable (:actual m))
                                    (identical? (Thread/currentThread) @stopping))
                           (throw (:actual m))))]
      (try
        (t/test-vars [v])
        (catch Throwable e
          (swap! events conj {:type :error :test (var-symbol v) :actual e}))))
    @events))

(defn- run-tests
  "`{:failed [test-symbol ...] :failure first-report}`. Stops at the first failing test, and on a thread that a run
  stops."
  [vars]
  (reduce (fn [acc v]
            (if (identical? (Thread/currentThread) @stopping)
              (reduced acc)
              (if-let [[event] (seq (run-test-var v))]
                (reduced {:failed [(var-symbol v)] :failure event})
                acc)))
          {:failed []}
          vars))

(defn- with-timeout
  "Runs `f` on a new thread named `thread-name`. `{:value (f)}`, or `{:timeout true :leaked l}` when `f` takes more
  than `timeout-ms`: then [[stop!]] stops the thread within `timeout-ms` more, and `l` is its result. With no
  `timeout-ms`, runs `f` on this thread. Throws what `f` throws."
  [timeout-ms thread-name f]
  (if-not timeout-ms
    {:value (f)}
    (let [ended  (promise)
          thread (doto (Thread. ^Runnable (bound-fn* (fn []
                                                       (deliver ended (try
                                                                        {:value (f)}
                                                                        (catch Throwable e
                                                                          {:error e})))))
                                ^String thread-name)
                   (.setDaemon true)
                   (.start))
          result (deref ended timeout-ms nil)]
      (cond
        (nil? result)   {:timeout true :leaked (stop! thread timeout-ms)}
        (:error result) (throw (:error result))
        :else           result))))

;;; Runs

(defn- run-one [{:keys [target edits] :as mutation} vars timeout-ms]
  (let [located (locate target)
        start   (System/nanoTime)
        result  (try
                  (load-form! located (with-stop-points (mutated-text located target edits)))
                  (let [{:keys [value timeout leaked]} (with-timeout timeout-ms
                                                         (str "mutation " (:name mutation))
                                                         #(run-tests vars))]
                    (cond
                      timeout               (cond-> {:result :timeout}
                                              leaked (assoc :leaked leaked))
                      (seq (:failed value)) {:result    :killed
                                             :killed-by (:failed value)
                                             :failure   (select-keys (:failure value)
                                                                     [:type :message :expected :actual])}
                      :else                 {:result :survived}))
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
  `:result`, `:ms`, and `:killed-by` and `:failure` for :killed, `:reason` for :invalid, `:leaked` for a :timeout
  whose thread still runs. Returns nil when another run is in progress, so a run among the tests of a run does not
  recurse.

  `opts`: `:tests`, the test vars or a loaded test namespace symbol for each mutation that names none; `:timeout-ms`
  (default 30000, nil for none), the time the tests of one mutation may take. After a timeout, the run stops the
  tests within as long again: it interrupts their thread, and throws a `ThreadDeath` on it at its next call through a
  function var of a library-branching namespace, or at the next `recur` of the mutated form. A loop that does neither
  does not stop; its result has `:leaked`, the thread and its frames.

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
  "`{:original text :mutated text}`: the source form of the target of `mutation`, without and with its edits. Throws
  when an edit matches no form, or several forms and has no `{:nth n}`."
  [{:keys [target edits]}]
  (let [{:keys [text] :as located} (locate target)]
    {:original text
     :mutated  (mutated-text located target edits)}))

;;; Results

(defn- target-string [target]
  (if (symbol? target)
    (str target)
    (let [[_ multi dispatch] target]
      (str multi " " (pr-str dispatch)))))

(defn- detail [{:keys [result killed-by reason ms leaked]}]
  (case result
    :killed   (str/join ", " killed-by)
    :invalid  reason
    :timeout  (cond-> (str "no end in " ms " ms")
                leaked (str "; the stop did not end the thread " leaked))
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

(defn- satisfied? [{:keys [expect result leaked]}]
  (case result
    :killed   (= :killed expect)
    :timeout  (and (= :killed expect) (not leaked))
    :survived (= :survived expect)
    false))

(defn is-expected
  "One `clojure.test/is` for each of `results`: its result is its expected result. A :timeout counts as :killed, but
  fails when its thread still runs; an :invalid result fails."
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
