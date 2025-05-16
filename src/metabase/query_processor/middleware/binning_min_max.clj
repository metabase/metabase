(ns metabase.query-processor.middleware.binning-min-max
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.query :as lib.query]
   [metabase.lib.options :as lib.options]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.ident :as lib.ident]))

;; 
;;
;; naive, assert :field not present -- an other stuff maybe
(def min-max-stage-keys [:source-table #_#_:source-query :source-card
                         :joins :expressions :filters
                         :qp/stage-had-source-card
                         :source-query/model? :source-query/entity-id])

;; binning could be only in breakout
(def potential-binning-clauses [:breakout :order-by])

(def potential-binning-top-level-clauses [:breakout :order-by])


(defn- drop-stage
  [query stage-number]
  (let [stages (vec (:stages query))]
    (assoc query :stages (into []
                               cat
                               [(subvec stages 0 stage-number)
                                (subvec stages (inc stage-number))]))))

(defn- inject-stages
  [query index new-stages]
  (let [stages (vec (:stages query))]
    (assert (<= index (count stages)))
    (assoc query :stages (into []
                               cat
                               [(subvec stages 0 index)
                                new-stages
                                (subvec stages index)]))))

(defn- inject-stage
  [query index stage]
  (inject-stages query index [stage]))

;; inject-stage ;; add metadata there
;; TODO: window functions
;; TODO: which fields are used for binning 
(defn- min-max-stage-x
  [query stage-number binned-refs]
  (def brbr binned-refs)
  (let [stage (lib.util/query-stage query stage-number)
        min-max-stage-base (select-keys stage min-max-stage-keys)
        new-stage (merge {:lib/type :mbql.stage/mbql}
                         min-max-stage-base)
        _ @(def ccs (let [qqq (lib.query/query-with-stages query (conj (subvec (vec (:stages query)) 0 stage-number)
                                                                       new-stage))
                          rc (lib/returned-columns qqq)
                          ;; return everything (be be added cols for window)
                          vc (lib/visible-columns qqq 
                                                  stage-number
                                                  (-> qqq :stages last)
                                                  {:include-joined?                              true
                                                   :include-expressions?                         true
                                                   :include-implicitly-joinable?                 false
                                                   :include-implicitly-joinable-for-source-card? false})]
                      vc))
        ffs @(def ffs (mapv lib/ref ccs))
        ccs-indices (set @(def cci (mapv (fn [ref]
                                           (let [found-col (lib/find-matching-column ref ccs)]
                                             (some (fn [[index col]]
                                                     (when (= col found-col)
                                                       index))
                                                   (map vector (range) ccs))))
                                         binned-refs)))
        ffs2 (into ffs (map (fn [ccs-index]
                              [:my-cool-window {:lib/uuid (str (random-uuid))} (lib/ref (ccs ccs-index))])
                            ccs-indices))]
    (merge {:lib/type :mbql.stage/mbql}
           min-max-stage-base
           {:fields ffs2})))

(defn- min-max-fields
  [query stage-number]
  (mapv lib/ref (lib/visible-columns query
                                     stage-number
                                     (lib.util/query-stage query stage-number)
                                     {:include-joined?                              true
                                      :include-expressions?                         true
                                      :include-implicitly-joinable?                 false
                                      :include-implicitly-joinable-for-source-card? false})))

(defn- binned-refs
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    (lib.util.match/match (select-keys stage potential-binning-top-level-clauses)
      [_ (opts :guard :binning) _]
      &match)))

(defn- binned-refs-from-breakout
  [query stage-number]
  (lib.util.match/match (lib/breakouts query stage-number)
    [_ (opts :guard :binning) _]
    &match))

(comment
  
  (binned-refs-from-breakout quee 0)
  bb
  )

(defn- binned-ref-paths
  [query stage-number]
  )

(defn- min-max-cols-for-windows
  [min-max-query stage-number binned-refs]
  )

(defn- drop-from-index
  [s index]
  (let [upper-bound (min (max 0 index) (count s))]
    (into (empty s) (take upper-bound) s)))
(comment
  (drop-from-index [0] 0)
  (drop-from-index [0] 1)
  (drop-from-index [0] 2)
  (drop-from-index [] 2)
  (drop-from-index [] 0)
  (drop-from-index [] -1))

(defn min-max-windows
  [query stage-number]
  (let [stages (vec (:stages query))
        stage (lib.util/query-stage query stage-number)
        min-max-stage (merge {:lib/type :mbql.stage/mbql}
                             (select-keys stage min-max-stage-keys))
        min-max-query (lib.query/query-with-stages query stage-number (conj (drop-from-index stages stage-number)
                                                                            min-max-stage))
        binned-refs (binned-refs-from-breakout query stage-number)
        ]
    )
  )



;; assert size?
(defn- drop-stages-from
  [query stage-number]
  (let [stages      (vec (:stages query))
        len         (count stages)
        upper-bound (min (max 0 stage-number) len)]
    (assoc query :stages (subvec stages 0 upper-bound))))

(defn find-matching-column-index
  [ref columns]
  (some (fn [[index column]]
          (when (lib/find-matching-column ref [column])
            index))
        (map vector (range) columns)))

(defn- binned-refs-from-stage
  [query stage-number]
  (let [stage @(def qsqs (lib.util/query-stage query stage-number))]
    (lib.util.match/match @(def aaa (select-keys stage potential-binning-top-level-clauses))
      [_ (opts :guard :binning) _]
      &match)))

;; returned-columns -> breakouts
;; has to be a breakout swapped for that expression
;; in that expression binned field swapped for formula
(defn- breakout-expr-name
  [])

(defn- binned-breakout-index->binned-ref
  [query stage-number]
  (into {}
        (keep-indexed (fn [index breakout]
                        (when-some [matching-ref (lib.util.match/match-one breakout
                                                   [_ (_opts :guard :binning) _]
                                                   &match)]
                          [index matching-ref])))
        (lib/breakouts query stage-number)))

(defn find-matching-column-index-2
  "Use find matching column to map ref indices to columns.
   Then for every ref index (1) check it has matching column.
   if so find its index.
   else nil"
  [ref columns]
  (when-some [matching-col (lib/find-matching-column ref columns)]
    (some (fn [[index col]]
            (when (= matching-col col)
              index))
          (map vector (range) columns))))

(defn- min-max-query
  [original-query stage-number]
  (let [stage-number (lib.util/canonical-stage-index original-query stage-number)
        stages (vec (:stages original-query))
        stage (lib.util/query-stage original-query stage-number)
        min-max-stage (merge {:lib/type :mbql.stage/mbql}
                             (select-keys stage min-max-stage-keys))
        min-max-query (lib.query/query-with-stages original-query (conj (drop-from-index stages stage-number)
                                                                        min-max-stage))
        min-max-cols (vec (lib/visible-columns min-max-query
                                               stage-number
                                               (lib.util/query-stage min-max-query stage-number)
                                               {:include-joined?                              true
                                                :include-expressions?                         true
                                                :include-implicitly-joinable?                 false
                                                :include-implicitly-joinable-for-source-card? false}))
        min-max-fields (mapv lib/ref min-max-cols)
        binned-refs (binned-refs-from-breakout original-query stage-number)
        min-max-col-indices-for-windows (into #{}
                                              (map #(find-matching-column-index % min-max-cols))
                                              binned-refs)
        bbi->br @(def bbi->br (binned-breakout-index->binned-ref original-query stage-number))
        bbi->col-index @(def bbi->col-index (update-vals bbi->br (fn [binned-ref]
                                                                   (find-matching-column-index-2 binned-ref min-max-cols))))
        col-index->bbi-indices @(def ci->bbis (reduce (fn [acc [k v]]
                                                        (update acc v (fnil conj #{}) k))
                                                      {}
                                                      bbi->col-index))
        min-max-windows @(def w2 (into []
                                         (mapcat (fn [[col-index breakout-indices]]
                                                   [[:window-min
                                                     {:lib/uuid (str (random-uuid))
                                                      :binning-breakout-indices breakout-indices
                                                      :binning-window-type :min}
                                                     (lib/ref (min-max-cols col-index))]
                                                    [:window-max
                                                     {:lib/uuid (str (random-uuid))
                                                      :binning-breakout-indices breakout-indices
                                                      :binning-window-type :max}
                                                     (lib/ref (min-max-cols col-index))]]))
                                         col-index->bbi-indices))
        min-max-col-indices-for-windows-2 (into #{}
                                                (map #(find-matching-column-index % min-max-cols))
                                                binned-refs)
        min-max-windows-2 (into []
                              (mapcat #(vector (lib.options/ensure-uuid [:window-min (lib/ref (min-max-cols %))])
                                               (lib.options/ensure-uuid [:window-max (lib/ref (min-max-cols %))])))
                              min-max-col-indices-for-windows)]
    (-> min-max-query
        (lib/with-fields stage-number min-max-fields)
        (lib.util/update-query-stage stage-number
                                     assoc :windows min-max-windows))))

(defn find-matching-column-indices
  "Use find matching column to map ref indices to columns.
   Then for every ref index (1) check it has matching column.
   if so find its index.
   else nil"
  [refs columns]
  (let [refs (vec refs)
        ref-index->column (into {}
                                (keep-indexed (fn [index ref]
                                                [index (lib/find-matching-column ref columns)]))
                                refs)]
    (vec (for [index (range (count refs))
               :let [matched-col (ref-index->column index)]]
           (when matched-col
             (some (fn [[col-index col]]
                     (when (= matched-col col)
                       col-index))
                   (map vector (range) columns)))))))



(comment
  
  (find-matching-column-index-2
   (second (map #(nth % 2) (lib/order-bys bq bsn)))
   bc
   )

  )


(defn adjust-fields-with-formulas
  [binning-query stage-number]
  (let [bei->bbi @(def beii (vec (keep-indexed (fn [index expr]
                                                 (when (lib.util.match/match expr
                                                         [_ (_opts :guard :binning) _]
                                                         &match)
                                                   [index (:binning-breakout-index (lib.options/options expr))]))
                                               (lib/expressions binning-query stage-number))))

        window-columns @(def wcs (into []
                                       (filter (comp #{:source/windows} :lib/source))
                                       @(def avcs (lib/returned-columns binning-query
                                                                        (dec stage-number)
                                                                        (lib.util/query-stage binning-query stage-number)
                                                                        {:include-joined?                              true
                                                                         :include-expressions?                         true
                                                                         :include-implicitly-joinable?                 false
                                                                         :include-implicitly-joinable-for-source-card? false}))))
        bbi->type->wci @(def bbitwci (reduce (fn [acc [windex {:keys [binning-breakout-indices
                                                                      binning-window-type]
                                                               :as wcol}]]
                                               (reduce (fn [acc' breakout-index]
                                                         (assoc-in acc' [breakout-index binning-window-type] windex))
                                                       acc
                                                       binning-breakout-indices))
                                             {}
                                             (map vector (range) window-columns)))
        with-expressions-updated (loop [bei->bbi* bei->bbi
                                        acc-query binning-query]
                                   (if-some [[ei bi] (first bei->bbi*)]
                                     (let [expr (nth (lib/expressions acc-query) ei)
                                           binned-ref @(def bir (lib.util.match/match-one
                                                                 expr
                                                                 [_ (_opts :guard :binning) _]
                                                                 &match))
                                           num-bins (get-in (lib.options/options binned-ref) [:binning :num-bins])
                                           _ (assert (pos-int? num-bins))
                                           expr-name (get-in binned-ref [1 :lib/expression-name])
                                           ref-no-binning (update binned-ref 1 dissoc :binning :lib/expression-name)
                                           w-max-ref (lib/ref (nth window-columns (get-in bbi->type->wci [bi :max])))
                                           w-min-ref (lib/ref (nth window-columns (get-in bbi->type->wci [bi :min])))
                                           bin-width-expr @(def ahojj (lib//
                                                                       (lib/abs (lib/- w-max-ref w-min-ref))
                                                                       (lib.expression/value num-bins)))
                                           ;; toplevel expression-name
                                           final-expr @(def fff (lib.options/update-options (lib.util/fresh-uuids (lib/+
                                                                                                                   (lib/*
                                                                                                                    (lib/floor
                                                                                                                     (lib//
                                                                                                                      (lib/-
                                                                                                                       ref-no-binning
                                                                                                                       w-min-ref)
                                                                                                                      bin-width-expr))
                                                                                                                    bin-width-expr)
                                                                                                                   w-min-ref))
                                                                                            assoc 
                                                                                            :lib/expression-name expr-name
                                                                                            :ident (lib.ident/random-ident)))]
                                       (recur
                                        (next bei->bbi*)
                                        (lib.util/update-query-stage
                                         acc-query
                                         stage-number
                                         assoc-in [:expressions ei] final-expr)))
                                     acc-query))]
    with-expressions-updated))
(comment
  
  (metabase.util.malli/explain :metabase.lib.schema.expression/expression fff)

  )

(comment
  (map #(select-keys % [:lib/source :name]) avcs)
  (take-last 4 avcs)
  )

(defn binning-query
  [min-max-query stage-number query]
  (let [stage-number (lib.util/canonical-stage-index query stage-number)
        stage (lib.util/query-stage query stage-number)
        binning-stage (merge {:lib/type :mbql.stage/mbql}
                             (apply dissoc stage min-max-stage-keys))
        binning-stage-number @(def bsn (inc stage-number))
        binning-query @(def bq (-> min-max-query
                                   (inject-stage binning-stage-number binning-stage)))
        binning-ret-cols @(def bc (vec (lib/returned-columns binning-query
                                                             binning-stage-number
                                                             (lib.util/query-stage binning-query binning-stage-number)
                                                             {:include-joined?                              true
                                                              :include-expressions?                         true
                                                              :include-implicitly-joinable?                 false
                                                              :include-implicitly-joinable-for-source-card? false})))
        breakout-cols (filter (comp #{:source/breakouts} :lib/source) binning-ret-cols)
        breakout-index->order-by-index @(def biobi (into {}
                                                         (keep-indexed
                                                          (fn [order-by-index [_dir _opts order-by]]
                                                            (when-some [breakout-index
                                                                        (find-matching-column-index-2 order-by breakout-cols)]
                                                              [breakout-index order-by-index]))
                                                          (lib/order-bys binning-query binning-stage-number))))
        binning-cols  (vec (lib/visible-columns binning-query
                                                binning-stage-number
                                                (lib.util/query-stage binning-query binning-stage-number)
                                                {:include-joined?                              true
                                                 :include-expressions?                         true
                                                 :include-implicitly-joinable?                 false
                                                 :include-implicitly-joinable-for-source-card? false}))
        binning-breakout-binned-indices @(def bbbi (keep-indexed (fn [index ref]
                                                                   (when (lib.util.match/match ref
                                                                           [_ (opts :guard :binning) _]
                                                                           &match)
                                                                     index))
                                                                 (lib/breakouts binning-query binning-stage-number)))
        expressions-another-try @(def eat (vec (for [index binning-breakout-binned-indices
                                                     :let [breakout-elm ((vec (lib/breakouts binning-query)) index)
                                                           col (lib/find-matching-column breakout-elm binning-ret-cols)
                                                           breakout-name (:lib/desired-column-alias col)]]
                                                 [index breakout-name breakout-elm])))
        binning-query-expr @(def bqe (reduce (fn [query* [breakout-index expr-name expr]]
                                               ;; uuid should be conveyed to expr, breakout should have new one generated
                                               (let [expr (lib.options/update-options (lib.util/fresh-uuids expr)
                                                                                      assoc :binning-breakout-index breakout-index)]
                                                 (let [qwe (lib/expression query* binning-stage-number expr-name expr)
                                                       ref (metabase.lib.expression/expression-ref qwe binning-stage-number expr-name)
                                                       qbu (lib.util/update-query-stage qwe binning-stage-number
                                                                                        assoc-in [:breakout breakout-index]
                                                                                        (lib.util/fresh-uuids ref))
                                                       qou (if-some [order-by-index (breakout-index->order-by-index breakout-index)]
                                                             (lib.util/update-query-stage qbu binning-stage-number
                                                                                          assoc-in [:order-by order-by-index 2]
                                                                                          (lib.util/fresh-uuids ref))
                                                             qbu)]
                                                   ;; swap in breakout and order-by --- all of this should be part of lib omg
                                                   qou)))
                                             binning-query
                                             expressions-another-try))
        binning-q-exprs-bin (adjust-fields-with-formulas binning-query-expr binning-stage-number)]
    binning-q-exprs-bin
    #_binning-query-expr))

(comment

  (lib/find-matching-column (first (lib/breakouts bq bsn)) fbrc)

  (into {}
        (map-indexed (fn [breakout-index breakout-metadata]
                       (def bibib breakout-index)
                       (def bmbmb breakout-metadata)
                       (println (:metabase.lib.field/binning breakout-metadata))
                       (when-some [order-by-index (some (fn [[order-by-index [_dir _opts order-by]]]
                                                          (def ooo order-by)
                                                          (println order-by)
                                                          (when (lib/find-matching-column order-by [breakout-metadata])
                                                            order-by-index))
                                                        @(def fds (map vector (range)
                                                                       (lib/order-bys bq bsn))))]
                         [breakout-index order-by-index])))

        fbrc)
  ooo
  (lib/find-matching-column ooo fbrc)
  fds

  (fbrc)
  ;; goes to same col wtf!!!
  (some (fn [[order-by-index [_dir _opts order-by]]]
          (when (lib/find-matching-column order-by [(first fbrc)])
            order-by-index))
        @(def fds (map vector (range)
                       (lib/order-bys bq bsn))))
  
  (lib/find-matching-column (nth (first (lib/order-bys bq bsn)) 2) fbrc)
  
  
  
  
  )

(defn- rewrite-binning-stage
  [query stage-number]
  (let [mmq (min-max-query query stage-number)
        bq (binning-query mmq stage-number query)]
    bq))



(comment
  (metabase.test/test-driver
    :postgres
    (let [mp (metabase.test/metadata-provider)]
      (-> (lib/query mp (metabase.lib.metadata/table mp (metabase.test/id :orders)))
          (lib/expression "ahoj" (lib/+ (metabase.lib.metadata/field mp (metabase.test/id :orders :total))1 )))))
  )

(comment

  ;; per breakout
  ;; create an expression and reference that in breakout
  ;; go through
  
  ;; i prob need something else
  (def dualb (mapv lib/ref (map (fn [col]
                                  (if (:id col)
                                    (assoc col :force-name true)
                                    col))
                                brc)))
  ;; binning is taken into account great -- both, name and also number field finds the column!!!
  ;; use desired-column-alias!!! for name
  (lib/find-matching-column (second dualb) brc)

  ;; using br and bc do the replacement
  ;; probably I do need a binning expression
  ;; probably I need to make sure that naming is correct! -- later
  
  ;; take 
  ;; put it ot expression
  ;; swap all of its occurrences for
  ;; order by, breakout
  ;; 
  
  ;; for every breakout
  ;; check whether in contains binned element
  ;; if so add to expressions
  ;; swap for expression reference
  ;; check order-bys, by breakout index now
  ;; and if present swap for that expression
  ;;
  ;; 
  )

(comment
  
  
  (lib.util/query-stage bq bsn)


  bc
  (lib/visible-columns bq
                       bsn
                       (lib.util/query-stage bq bsn)
                       {:include-joined?                              true
                        :include-expressions?                         true
                        :include-implicitly-joinable?                 false
                        :include-implicitly-joinable-for-source-card? false})

  (lib/returned-columns bq
                        0
                        #_(lib.util/query-stage bq bsn)
                        #_{:include-joined?                              true
                           :include-expressions?                         true
                           :include-implicitly-joinable?                 false
                           :include-implicitly-joinable-for-source-card? false})
  )

#_(defn- binning-stage
  [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)
        binning-stage-base (apply dissoc stage min-max-stage-keys)]
    (merge {:lib/type :mbql.stage/mbql}
           binning-stage-base)))

(defn- stage?
  [x]
  ((every-pred map? (comp #{:mbql.stage/native :mbql.stage/mbql} :lib/type)) x))

(defn- swap-stage
  [query stage-number stages]
  (-> query
      (drop-stage stage-number)
      (doto (as-> $ (def dii $)))
      (inject-stages stage-number stages)
      (doto (as-> $ (def iii $)))))

(defn- binned-fields-from-last-stage
  [query]
  (let [stage (lib.util/query-stage query -1)]
    (lib.util.match/match (select-keys stage potential-binning-clauses)
      [_ (opts :guard :binning) _]
      [&parents &match])))

#_(defn- binned-REFS-from-last-stage
  [query]
  (let [stage (lib.util/query-stage query -1)]
    (not-empty (vec (lib.util.match/match (select-keys stage potential-binning-clauses)
                      [_ (opts :guard :binning) _]
                      &match)))))

;; only the top level (last stage) handling now -- simplest case
;; big part of functions created during this work should end up in lib!
;; only if driver supports binning
(defn rewrite-binning-window-min-max
  [query]
  (def quee query)
  (if-some [binned-fields (binned-fields-from-last-stage query)]
    #_query @(def rrrr (rewrite-binning-stage query -1))
    query))

(comment
  
  (lib/returned-columns reu)
  
  (metabase.lib.metadata.calculation/metadata reu -1 [:window-max
                                                      #:lib{:uuid "0bd3c5a8-411c-4bfe-a3ce-c76925786d2f"}
                                                      [:field
                                                       {:lib/uuid "96e45e86-cdca-46bc-b789-1b9e346ccc6b", :base-type :type/Integer, :effective-type :type/Integer}
                                                       250]])
  
  (metabase.lib.stage/windows-columns reu -1 {:unique-name-fn metabase.lib.stage/ufn})

  )

(comment
  (lib.query/query-with-stages #_query quee [mm bb])
  )

(comment
  (swap-stage qq (lib.util/canonical-stage-index qq -1) [mm bb])
  (lib/find-matching-column (-> (binned-fields-from-last-stage dummy-mmq-meta) first second)
                            (-> dummy-mmq-meta :stages first :lib/stage-metadata :columns))
  
  )

(comment
  (lib/returned-columns (update dummy-mmq :stages subvec 0 1)))