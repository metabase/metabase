(ns dev.debug-qp
  "TODO -- I think this should be moved to something like [[metabase.test.util.debug-qp]]"
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [lambdaisland.deep-diff2 :as ddiff]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
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
           (lib.util.match/replace form
             [:field (id :guard pos-int?) opts]
             [:field id (add-name-to-field-id id) (cond-> opts
                                                    (pos-int? (:source-field opts))
                                                    (update :source-field field-id->name-form))]

             (m :guard (every-pred map? (comp pos-int? :source-table)))
             (add-names* (update m :source-table add-table-id-name))

             (m :guard (every-pred map? (comp pos-int? :metabase.query-processor.util.add-alias-info/source-table)))
             (add-names* (update m :metabase.query-processor.util.add-alias-info/source-table add-table-id-name))

             (m :guard (every-pred map? (comp pos-int? :fk-field-id)))
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


;;;; [[to-mbql-shorthand]]

(defn- strip-$ [coll]
  (into []
        (map (fn [x] (if (= x ::$) ::no-$ x)))
        coll))

(defn- can-symbolize? [x]
  (lib.util.match/match-one x
    (_ :guard string?)
    (not (re-find #"\s+" x))

    [:field (id :guard pos-int?) nil]
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
    (lib.util.match/replace form
      ([:field (id :guard pos-int?) nil] :guard can-symbolize?)
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

      [:field (id :guard pos-int?) opts]
      (let [without-opts [:field id nil]
            expansion    (expand without-opts table)]
        (if (= expansion without-opts)
          &match
          [:field [::% (strip-$ expansion)] opts]))

      (m :guard (every-pred map? (comp pos-int? :source-table)))
      (-> (update m :source-table (fn [table-id]
                                    [::$$ (some-> (t2/select-one-fn :name Table :id table-id) u/lower-case-en)]))
          (expand table))

      (m :guard (every-pred map? (comp pos-int? :fk-field-id)))
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
  (lib.util.match/replace x [::$ & args] (into [::no-$] args)))

(defn- symbolize [form]
  (lib.util.match/replace form
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

(defn- query-table-name [{:keys [source-table source-query], :as inner-query}]
  (cond
    (pos-int? source-table)
    (u/lower-case-en (or (t2/select-one-fn :name Table :id source-table)
                         (throw (ex-info (format "Table %d does not exist!" source-table)
                                         {:source-table source-table, :inner-query inner-query}))))

    source-query
    (recur source-query)))

(defn to-mbql-shorthand
  ([query]
   (let [query (mbql.normalize/normalize query)]
     (to-mbql-shorthand query (query-table-name (:query query)))))

  ([query table-name]
   (let [symbolized (-> query (expand table-name) symbolize ->sorted-mbql-query-map)
         table-symb (some-> table-name symbol)]
     (if (:query symbolized)
       (list 'mt/mbql-query table-symb (cond-> (:query symbolized)
                                         table-name (dissoc :source-table)))
       (list 'mt/$ids table-symb symbolized)))))

(defn expand-symbolize [x]
  (-> x (expand "orders") symbolize))

;; tests are in [[dev.debug-qp-test]] (in `./dev/test/dev` dir)

(defn pprint-sql
  "Pretty print a SQL string."
  ([sql]
   (pprint-sql (mdb/db-type) sql))
  ([driver sql]
   #_{:clj-kondo/ignore [:discouraged-var]}
   (println (driver/prettify-native-form driver sql))))
