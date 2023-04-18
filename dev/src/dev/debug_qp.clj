(ns dev.debug-qp
  "TODO -- I think this should be moved to something like [[metabase.test.util.debug-qp]]"
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [lambdaisland.deep-diff2 :as ddiff]
   [medley.core :as m]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;;; [[->sorted-mbql-query-map]]

(def ^:private mbql-clause->sort-order
  (into {}
        (map-indexed (fn [i k]
                       [k i]))
        [;; top-level keys
         :database
         :type
         :query
         :native
         ;; inner-query and join keys
         :source-table
         :source-query
         :source-metadata
         :alias
         :joins
         :expressions
         :breakout
         :aggregation
         :condition
         :fields
         :strategy
         :filter
         :order-by
         :page
         :limit]))

(defn- sorted-mbql-query-map []
  ;; stuff in [[mbql-clause->sort-order]] should always get sorted according to that order. Everything else should go at
  ;; the end, with non-namespaced stuff first and namespaced stuff last; otherwise sort alphabetically
  (sorted-map-by (fn [x y]
                   (let [order   (fn [k]
                                   (or (mbql-clause->sort-order k)
                                       (when (and (keyword? k) (namespace k))
                                         Integer/MAX_VALUE)
                                       (dec Integer/MAX_VALUE)))
                         x-order (order x)
                         y-order (order y)]
                     (if (= x-order y-order)
                       (compare (str x) (str y))
                       (compare x-order y-order))))))

(def ^:dynamic *shorten-namespaced-keywords?*
  "Whether to shorten something like `:metabase.query-processor.util.add-alias-info/source-table` to
  `::add/source-table` if an alias exists for the keyword namespace in the current namespace ([[*ns*]])."
  true)

(defn- alias-for-namespace-in-*ns* [ns-symb]
  (let [a-namespace (find-ns (symbol ns-symb))]
    (some
     (fn [[ns-alias aliased-namespace]]
       (when (= aliased-namespace a-namespace)
         ns-alias))
     (ns-aliases *ns*))))

(defn ->sorted-mbql-query-map
  "Convert MBQL `query` to a special map type that keeps the keys sorted in the 'preferred' order (e.g. order roughly
  matches that of SQL, i.e. things like source query and joins come before order by or limit), which is easier to look
  at (maybe)."
  [query]
  (walk/postwalk
   (fn [form]
     (cond
       (map? form)
       (into (sorted-mbql-query-map) form)

       (and *shorten-namespaced-keywords?*
            (keyword? form)
            (namespace form))
       (if-let [ns-alias (alias-for-namespace-in-*ns* (symbol (namespace form)))]
         (symbol (format "::%s/%s" ns-alias (name form)))
         form)

       :else
       form))
   query))


;;;; [[add-names]]

(defn- field-and-table-name [field-id]
  (let [{field-name :name, table-id :table_id} (t2/select-one [Field :name :table_id] :id field-id)]
    [(t2/select-one-fn :name Table :id table-id) field-name]))

(defn- add-table-id-name [table-id]
  (list 'do
        (symbol (format "#_%s" (pr-str (t2/select-one-fn :name Table :id table-id))))
        table-id))

(defn add-names
  "Walk a MBQL snippet `x` and add comment forms with the names of the Fields referenced to any `:field` clauses nil
  encountered. Helpful for debugging!"
  [x]
  (-> (walk/postwalk
       (fn add-names* [form]
         (letfn [(add-name-to-field-id [id]
                   (when id
                     (let [[field-name table-name] (field-and-table-name id)]
                       (symbol (format "#_\"%s.%s\"" field-name table-name)))))
                 (field-id->name-form [field-id]
                   (list 'do (add-name-to-field-id field-id) field-id))]
           (mbql.u/replace form
             [:field (id :guard integer?) opts]
             [:field id (add-name-to-field-id id) (cond-> opts
                                                    (integer? (:source-field opts))
                                                    (update :source-field field-id->name-form))]

             (m :guard (every-pred map? (comp integer? :source-table)))
             (add-names* (update m :source-table add-table-id-name))

             (m :guard (every-pred map? (comp integer? :metabase.query-processor.util.add-alias-info/source-table)))
             (add-names* (update m :metabase.query-processor.util.add-alias-info/source-table add-table-id-name))

             (m :guard (every-pred map? (comp integer? :fk-field-id)))
             (-> m
                 (update :fk-field-id field-id->name-form)
                 add-names*)

             ;; don't recursively replace the `do` lists above, other we'll get vectors.
             (_ :guard (every-pred list? #(= (first %) 'do)))
             &match)))
       x)
      ->sorted-mbql-query-map))


;;;; [[process-query-debug]]

;; see docstring for [[process-query-debug]] for descriptions of what these do.

(def ^:private ^:dynamic *print-full?*     true)
(def ^:private ^:dynamic *print-metadata?* false)
(def ^:private ^:dynamic *print-names?*    true)
(def ^:private ^:dynamic *validate-query?* false)


(defn- remove-metadata
  "Replace field metadata in `x` with `...`."
  [x]
  (walk/prewalk
   (fn [form]
     (if (map? form)
       (reduce
        (fn [m k]
          (m/update-existing m k (constantly '...)))
        form
        [:cols :results_metadata :source-metadata])
       form))
   x))

(defn- format-output [x]
  (cond-> x
    (not *print-metadata?*) remove-metadata
    *print-names?*          add-names))

(defn- print-diff [before after]
  (assert (not= before after))
  (ddiff/pretty-print (ddiff/diff before after)
                      ;; the default printer is very (too?) colorful.
                      ;; this is one that strips color except for the diffs:
                      (ddiff/printer {:color-scheme
                                      {:lambdaisland.deep-diff2.printer-impl/deletion  [:red]
                                       :lambdaisland.deep-diff2.printer-impl/insertion [:green]
                                       :lambdaisland.deep-diff2.printer-impl/other     [:white]
                                       :delimiter       nil
                                       :tag             nil
                                       :nil             nil
                                       :boolean         nil
                                       :number          nil
                                       :string          nil
                                       :character       nil
                                       :keyword         nil
                                       :symbol          nil
                                       :function-symbol nil
                                       :class-delimiter nil
                                       :class-name      nil}}))
  (println))

(defn- print-transform-result [before after]
  (when *print-full?*
    (println (u/pprint-to-str 'cyan (format-output after))))
  (print-diff before after))

(defn- print-error [location middleware-var e]
  (println (format "Error %s in %s:\n%s"
                   location
                   middleware-var
                   (u/pprint-to-str 'red (Throwable->map e)))))

(defmulti print-formatted-event
  "Writes the debugger event to the standard output. Uses colors and
  deep diffing to show changes made by middlewares.

  This is the default printer of `process-query-debug`."
  first)

(defmethod print-formatted-event ::transformed-query
  [[_ middleware-var before after]]
  (println (format "[pre] %s transformed query:" middleware-var))
  (print-transform-result before after))

(defmethod print-formatted-event ::pre-process-query-error
  [[_ middleware-var e]]
  (print-error "pre-processing query" middleware-var e))

(defmethod print-formatted-event ::transformed-metadata
  [[_ middleware-var before after]]
  (println (format "[post] %s transformed metadata:" middleware-var))
  (print-transform-result before after))

(defmethod print-formatted-event ::post-process-metadata-error
  [[_ middleware-var e]]
  (print-error "post-processing result metadata" middleware-var e))

(defmethod print-formatted-event ::post-process-result-error
  [[_ middleware-var e]]
  (print-error "post-processing result" middleware-var e))

(defmethod print-formatted-event ::transformed-result
  [[_ middleware-var before after]]
  (println (format "[post] %s transformed result:" middleware-var))
  (print-transform-result before after))

(defmethod print-formatted-event ::error-reduce-row
  [[_ middleware-var e]]
  (print-error "reducing row" middleware-var e))

(defmethod print-formatted-event ::transformed-row
  [[_ middleware-var before after]]
  (println (format "[post] %s transformed row" middleware-var))
  (print-transform-result before after))

(def ^:private ^:dynamic *printer* print-formatted-event)

(defn- debug-query-changes [middleware-var middleware]
  (fn [next-middleware]
    (fn [query-before rff context]
      (try
        ((middleware
          (fn [query-after rff context]
            (when-not (= query-before query-after)
              (*printer* [::transformed-query middleware-var query-before query-after]))
            (when *validate-query?*
              (try
                (mbql.s/validate-query query-after)
                (catch Throwable e
                  (when (::our-error? (ex-data e))
                    (throw e))
                  (throw (ex-info (format "%s middleware produced invalid query" middleware-var)
                                  {::our-error? true
                                   :middleware  middleware-var
                                   :before      query-before
                                   :query       query-after}
                                  e)))))
            (next-middleware query-after rff context)))
         query-before rff context)
        (catch Throwable e
          (when (::our-error? (ex-data e))
            (throw e))
          (*printer* [::pre-process-query-error middleware-var e])
          (throw (ex-info "Error pre-processing query"
                          {::our-error? true
                           :middleware  middleware-var
                           :query       query-before}
                          e)))))))

(defn- debug-rffs [middleware-var middleware before-rff-xform after-rff-xform]
  (fn [next-middleware]
    (fn [query rff-after context]
      ((middleware
        (fn [query rff-before context]
          (next-middleware query (before-rff-xform rff-before) context)))
       query (after-rff-xform rff-after) context))))

(defn- debug-metadata-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rffs
     middleware-var
     middleware
     (fn before-rff-xform [rff]
       (fn [metadata-before]
         (reset! before metadata-before)
         (try
           (rff metadata-before)
           (catch Throwable e
             (when (::our-error? (ex-data e))
               (throw e))
             (*printer* [::post-process-metadata-error middleware-var e])
             (throw (ex-info "Error post-processing result metadata"
                             {::our-error? true
                              :middleware  middleware-var
                              :metadata    metadata-before}
                             e))))))
     (fn after-rff-xform [rff]
       (fn [metadata-after]
         (when-not (= @before metadata-after)
           (*printer* [::transformed-metadata middleware-var @before metadata-after]))
         (rff metadata-after))))))

(defn- debug-rfs [middleware-var middleware before-xform after-xform]
  (debug-rffs
   middleware-var
   middleware
   (fn before-rff-xform [rff]
     (fn [metadata]
       (let [rf (rff metadata)]
         (before-xform rf))))
   (fn after-rff-xform [rff]
     (fn [metadata]
       (let [rf (rff metadata)]
         (after-xform rf))))))

(defn- debug-result-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rfs
     middleware-var
     middleware
     (fn before-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (reset! before result)
          (try
            (rf result)
            (catch Throwable e
              (when (::our-error? (ex-data e))
                (throw e))
              (*printer* [::post-process-result-error middleware-var e])
              (throw (ex-info "Error post-processing result"
                              {::our-error? true
                               :middleware  middleware-var
                               :result      result}
                              e)))))
         ([result row] (rf result row))))
     (fn after-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (when-not (= @before result)
            (*printer* [::transformed-result middleware-var @before result]))
          (rf result))
         ([result row] (rf result row)))))))

(defn- debug-row-changes [middleware-var middleware]
  (let [before (atom nil)]
    (debug-rfs
     middleware-var
     middleware
     (fn before-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result row]
          (reset! before row)
          (try
            (rf result row)
            (catch Throwable e
              (when (::our-error? (ex-data e))
                (throw e))
              (*printer* [::error-reduce-row middleware-var e])
              (throw (ex-info "Error reducing row"
                              {::our-error? true
                               :middleware  middleware-var
                               :result      result
                               :row         row}
                              e)))))))
     (fn after-xform [rf]
       (fn
         ([] (rf))
         ([result]
          (rf result))
         ([result row]
          (when-not (= @before row)
            (*printer* [::transformed-row @before row]))
          (rf result row)))))))

(defn- default-debug-middleware
  "The default set of middleware applied to queries ran via [[process-query-debug]].
  Analogous to [[qp/default-middleware]]."
  []
  (into
   []
   (comp cat (keep identity))
   [@#'qp/execution-middleware
    @#'qp/compile-middleware
    @#'qp/post-processing-middleware
    ;; Normally, pre-processing middleware are applied to the query left-to-right, but in debug mode we convert each
    ;; one into a transducing middleware and compose them, which causes them to be applied right-to-left. So we need
    ;; to reverse the order here.
    (reverse @#'qp/pre-processing-middleware)
    @#'qp/around-middleware]))

(defn- alter-pre-processing-middleware
  "Takes a pre-processing middleware function, and converts it to a transducing middleware with the signature:

    (f (f query rff context)) -> (f query rff context)"
  [middleware]
  (fn [qp-or-query]
    (if (map? qp-or-query)
      ;; If we're passed a map, this means the middleware var is still being called on a query directly. This happens
      ;; if pre-processing middleware calls other pre-processing middleware, such as [[upgrade-field-literals]] which
      ;; calls [[resolve-fields]]. Fallback to the original middleware function in this case.
      (middleware qp-or-query)
      (fn [query rff context]
        (qp-or-query
         (middleware query)
         rff
         context)))))

(defn- alter-post-processing-middleware
  "Takes a pre-processing middleware function, and converts it to a transducing middleware with the signature:

    (f (f query rff context)) -> (f query rff context)"
  [middleware]
  (fn [qp]
    (fn [query rff context]
      (qp query (middleware query rff) context))))

(defn- with-altered-middleware-fn
  "Implementation function for [[with-altered-middleware]]. Temporarily alters the root bindings for pre- and
  post-processing middleware vars, changing them to transducing middleware which can individually be wrapped with
  debug middleware in [[process-query-debug]]."
  [f]
  (let [pre-processing-middleware-vars  @#'qp/pre-processing-middleware
        post-processing-middleware-vars @#'qp/post-processing-middleware
        pre-processing-original-fns     (zipmap pre-processing-middleware-vars
                                                (map deref pre-processing-middleware-vars))
        post-processing-original-fns    (zipmap post-processing-middleware-vars
                                                (map deref post-processing-middleware-vars))]
    (try
      (mapv #(alter-var-root % alter-pre-processing-middleware) pre-processing-middleware-vars)
      (mapv #(alter-var-root % alter-post-processing-middleware) post-processing-middleware-vars)
      (f)
      (finally
        (mapv (fn [[middleware-var middleware-fn]]
                (alter-var-root middleware-var (constantly middleware-fn)))
              (merge pre-processing-original-fns post-processing-original-fns))))))

(defmacro ^:private with-altered-middleware
  "Temporarily redefines pre-processing and post-processing middleware vars to equivalent transducing middlewares,
  so that [[process-query-debug]] can print the transformations for each middleware individually."
  [& body]
  `(with-altered-middleware-fn (fn [] ~@body)))

(defn process-query-debug
  "Process a query using a special QP that wraps all of the normal QP middleware and prints any transformations done
  during pre or post-processing.

  Options:

  * `:print-full?` -- whether to print the entire query/result/etc. after each transformation

  * `:print-metadata?` -- whether to print metadata columns such as `:cols`or `:source-metadata`
    in the query/results

  * `:print-names?` -- whether to print comments with the names of fields/tables as part of `:field` forms and
    for `:source-table`

  * `:validate-query?` -- whether to validate the query after each preprocessing step, so you can figure out who's
    breaking it. (TODO -- `mbql-to-native` middleware currently leaves the old mbql `:query` in place,
    which cases query to fail at that point -- manually comment that behavior out if needed

  * :printer -- the function to process the debug events, defaults to `print-formatted-event`"
  [query & {:keys [print-full? print-metadata? print-names? validate-query? printer context]
            :or   {print-full? true, print-metadata? false, print-names? true, validate-query? false
                   printer print-formatted-event}}]
  (binding [*print-full?*               print-full?
            *print-metadata?*           print-metadata?
            *print-names?*              print-names?
            *validate-query?*           validate-query?
            *printer*                   printer
            pprint/*print-right-margin* 80]
    (with-altered-middleware
      (let [middleware (for [middleware-var (default-debug-middleware)
                             :when          middleware-var]
                         (->> middleware-var
                              (debug-query-changes middleware-var)
                              (debug-metadata-changes middleware-var)
                              (debug-result-changes middleware-var)
                              (debug-row-changes middleware-var)))
            qp         (qp.reducible/sync-qp (#'qp/base-qp middleware))]
        (if context
          (qp query context)
          (qp query))))))


;;;; [[to-mbql-shorthand]]

(defn- strip-$ [coll]
  (into []
        (map (fn [x] (if (= x ::$) ::no-$ x)))
        coll))

(defn- can-symbolize? [x]
  (mbql.u/match-one x
    (_ :guard string?)
    (not (re-find #"\s+" x))

    [:field (id :guard integer?) nil]
    (every? can-symbolize? (field-and-table-name id))

    [:field (field-name :guard string?) (opts :guard #(= (set (keys %)) #{:base-type}))]
    (can-symbolize? field-name)

    [:field _ (opts :guard :join-alias)]
    (and (can-symbolize? (:join-alias opts))
         (can-symbolize? (mbql.u/update-field-options &match dissoc :join-alias)))

    [:field _ (opts :guard :temporal-unit)]
    (and (can-symbolize? (name (:temporal-unit opts)))
         (can-symbolize? (mbql.u/update-field-options &match dissoc :temporal-unit)))

    [:field _ (opts :guard :source-field)]
    (let [source-field-id (:source-field opts)]
      (and (can-symbolize? [:field source-field-id nil])
           (can-symbolize? (mbql.u/update-field-options &match dissoc :source-field))))

    _
    false))

(defn- expand [form table]
  (try
    (mbql.u/replace form
      ([:field (id :guard integer?) nil] :guard can-symbolize?)
      (let [[table-name field-name] (field-and-table-name id)
            field-name              (some-> field-name u/lower-case-en)
            table-name              (some-> table-name u/lower-case-en)]
        (if (= table-name table)
          [::$ field-name]
          [::$ table-name field-name]))

      ([:field (field-name :guard string?) (opts :guard #(= (set (keys %)) #{:base-type}))] :guard can-symbolize?)
      [::* field-name (name (:base-type opts))]

      ([:field _ (opts :guard :temporal-unit)] :guard can-symbolize?)
      (let [without-unit (mbql.u/update-field-options &match dissoc :temporal-unit)
            expansion    (expand without-unit table)]
        [::! (name (:temporal-unit opts)) (strip-$ expansion)])

      ([:field _ (opts :guard :source-field)] :guard can-symbolize?)
      (let [without-source-field   (mbql.u/update-field-options &match dissoc :source-field)
            expansion              (expand without-source-field table)
            source-as-field-clause [:field (:source-field opts) nil]
            source-expansion       (expand source-as-field-clause table)]
        [::-> source-expansion expansion])

      ([:field _ (opts :guard :join-alias)] :guard can-symbolize?)
      (let [without-join-alias (mbql.u/update-field-options &match dissoc :join-alias)
            expansion          (expand without-join-alias table)]
        [::& (:join-alias opts) expansion])

      [:field (id :guard integer?) opts]
      (let [without-opts [:field id nil]
            expansion    (expand without-opts table)]
        (if (= expansion without-opts)
          &match
          [:field [::% (strip-$ expansion)] opts]))

      (m :guard (every-pred map? (comp integer? :source-table)))
      (-> (update m :source-table (fn [table-id]
                                    [::$$ (some-> (t2/select-one-fn :name Table :id table-id) u/lower-case-en)]))
          (expand table))

      (m :guard (every-pred map? (comp integer? :fk-field-id)))
      (-> (update m :fk-field-id (fn [fk-field-id]
                                   (let [[table-name field-name] (field-and-table-name fk-field-id)
                                         field-name              (some-> field-name u/lower-case-en)
                                         table-name              (some-> table-name u/lower-case-en)]
                                     (if (= table-name table)
                                       [::% field-name]
                                       [::% table-name field-name]))))
          (expand table)))
    (catch Throwable e
      (throw (ex-info (format "Error expanding %s: %s" (pr-str form) (ex-message e))
                      {:form form, :table table}
                      e)))))

(defn- no-$ [x]
  (mbql.u/replace x [::$ & args] (into [::no-$] args)))

(defn- symbolize [form]
  (mbql.u/replace form
    [::-> x y]
    (symbol (format "%s->%s" (symbolize x) (str/replace (symbolize y) #"^\$" "")))

    [::no-$ & args]
    (str/join \. args)

    [(qualifier :guard #{::$ ::& ::! ::%}) & args]
    (symbol (str (name qualifier) (str/join \. (symbolize (no-$ args)))))

    [::* field-name base-type]
    (symbol (format "*%s/%s" field-name base-type))

    [::$$ table-name]
    (symbol (format "$$%s" table-name))))

(defn- query-table-name [{:keys [source-table source-query]}]
  (cond
    source-table
    (do
      (assert (integer? source-table))
      (u/lower-case-en (t2/select-one-fn :name Table :id source-table)))

    source-query
    (recur source-query)))

(defn to-mbql-shorthand
  ([query]
   (to-mbql-shorthand query (query-table-name (:query query))))

  ([query table-name]
   (let [symbolized (-> query (expand table-name) symbolize ->sorted-mbql-query-map)
         table-symb (some-> table-name symbol)]
     (if (:query symbolized)
       (list 'mt/mbql-query table-symb (-> (:query symbolized)
                                           (dissoc :source-table)))
       (list 'mt/$ids table-symb symbolized)))))

(defn expand-symbolize [x]
  (-> x (expand "orders") symbolize))

;; tests are in [[dev.debug-qp-test]] (in `./dev/test/dev` dir)
