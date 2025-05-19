(ns metabase.query-processor.middleware.binning-min-max
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]))

(defn- clause-with-binning?
  [clause]
  (and (vector? clause)
       (map? (second clause))
       (boolean (:binning (second clause)))))

(defn find-matching-column-index
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

;; naive, assert :field not present -- an other stuff maybe
(def min-max-stage-keys [:source-table #_#_:source-query :source-card
                         :joins :expressions :filters
                         :qp/stage-had-source-card
                         :source-query/model? :source-query/entity-id])

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
(defn- swap-stage
  [query stage-number stages]
  (-> query
      (drop-stage stage-number)
      (inject-stages stage-number stages)))

(defn- extract-stage-range
  "xix"
  [query start end]
  (let [stages (:stages query)
        _ (assert (and (>= start 0) (<= end (count stages))))]
    (subvec (vec stages) start end)))

(defn- inject-stage
  [query index stage]
  (inject-stages query index [stage]))

(defn- drop-from-index
  [s index]
  (let [upper-bound (min (max 0 index) (count s))]
    (into (empty s) (take upper-bound) s)))

(defn- binned-breakout-index->ref
  [query stage-number]
  (into {}
        (keep-indexed (fn [index breakout]
                        (when-some [matching-ref (lib.util.match/match-one breakout
                                                   [_ (_opts :guard :binning) _]
                                                   &match)]
                          [index matching-ref])))
        (lib/breakouts query stage-number)))

(defn- stages-after
  [query stage-number]
  (subvec (vec (:stages query)) (inc stage-number)))

(def options-to-remove-for-match
  [:lib/uuid :ident])

(defn- remove-options-for-match
  [clause]
  (lib.options/update-options clause #(apply dissoc % options-to-remove-for-match)))

(defn- windows-for-binning
  [min-max-query stage-number original-query]
  (let [min-max-visible-cols (vec (lib/visible-columns min-max-query
                                                       stage-number
                                                       (lib.util/query-stage min-max-query stage-number)
                                                       {:include-joined?                              true
                                                        :include-expressions?                         true
                                                        :include-implicitly-joinable?                 false
                                                        :include-implicitly-joinable-for-source-card? false}))
        binned-breakout-index->ref (binned-breakout-index->ref original-query stage-number)
        min-max-visible-col-index->binned-breakout-indices
        (transduce
         (keep (fn [[breakout-index ref]]
                 (when-some [visible-cols-index (find-matching-column-index ref min-max-visible-cols)]
                   [visible-cols-index breakout-index])))
         (completing (fn [acc [visible-cols-index breakout-index]]
                       (update acc visible-cols-index (fnil conj #{}) breakout-index)))
         {}
         binned-breakout-index->ref)]
    (into []
          (mapcat (fn [[col-index breakout-indices]]
                    [[:window-min
                      {:lib/uuid (str (random-uuid))
                       :binned-breakout-refs (set (map (comp remove-options-for-match
                                                             binned-breakout-index->ref)
                                                       breakout-indices))
                       :binning-window-type :min}
                      (lib/ref (min-max-visible-cols col-index))]
                     [:window-max
                      {:lib/uuid (str (random-uuid))
                       :binned-breakout-refs (set (map (comp remove-options-for-match
                                                             binned-breakout-index->ref)
                                                       breakout-indices))
                       :binning-window-type :max}
                      (lib/ref (min-max-visible-cols col-index))]]))
          min-max-visible-col-index->binned-breakout-indices)))

(defn- with-windows-for-binning
  [min-max-query stage-number original-query]
  (let [windows (windows-for-binning min-max-query stage-number original-query)]
    (lib.util/update-query-stage min-max-query stage-number assoc :windows windows)))

(defn- min-max-query
  [original-query stage-number]
  (let [stage-number (lib.util/canonical-stage-index original-query stage-number)
        stages (vec (:stages original-query))
        stage (lib.util/query-stage original-query stage-number)
        min-max-stage (merge {:lib/type :mbql.stage/mbql}
                             (select-keys stage min-max-stage-keys))
        min-max-query (lib.query/query-with-stages original-query (conj (drop-from-index stages stage-number)
                                                                        min-max-stage))
        min-max-visible-cols (vec (lib/visible-columns min-max-query
                                                       stage-number
                                                       (lib.util/query-stage min-max-query stage-number)
                                                       {:include-joined?                              true
                                                        :include-expressions?                         true
                                                        :include-implicitly-joinable?                 false
                                                        :include-implicitly-joinable-for-source-card? false}))
        min-max-fields (mapv lib/ref min-max-visible-cols)]
    (-> min-max-query
        (lib/with-fields stage-number min-max-fields)
        (with-windows-for-binning stage-number original-query)
        (update :stages #(into (vec %) (stages-after original-query stage-number))))))

(defn- decorate-binned-refs
  [refs binned-ref->window-type->window-ref]
  (lib.util.match/replace
    refs
    clause-with-binning?
    (let [match* (remove-options-for-match &match)
          legacy-window-refs (binned-ref->window-type->window-ref match*)
          {legacy-window-min-ref :min
           legacy-window-max-ref :max} legacy-window-refs]
      (-> &match
          (lib.options/update-options update :binning assoc :min-wref legacy-window-min-ref)
          (lib.options/update-options update :binning assoc :max-wref legacy-window-max-ref)))))

(defn binning-query
  [min-max-query stage-number original-query]
  (let [stage-number (lib.util/canonical-stage-index min-max-query stage-number)
        original-stage (lib.util/query-stage original-query stage-number)
        binning-stage (merge {:lib/type :mbql.stage/mbql}
                             (apply dissoc original-stage min-max-stage-keys))
        binning-stage-number (inc stage-number)
        binning-query (-> min-max-query
                          (inject-stage binning-stage-number binning-stage))
        binning-visible-columns (vec (lib/visible-columns binning-query
                                                          binning-stage-number
                                                          (lib.util/query-stage binning-query binning-stage-number)
                                                          {:include-joined?                              true
                                                           :include-expressions?                         true
                                                           :include-implicitly-joinable?                 false
                                                           :include-implicitly-joinable-for-source-card? false}))
        binned-ref->window-type->window-ref
        (transduce
         (comp (keep (fn [{:keys [binning-window-type binned-breakout-refs] :as col}]
                       (not-empty (for [ref binned-breakout-refs]
                                    [ref binning-window-type (lib.convert/->legacy-MBQL (lib/ref col))]))))
               cat)
         (completing (fn [acc [binned-ref window-type window-legacy-ref]]
                       (assoc-in acc [binned-ref window-type] window-legacy-ref)))
         {}
         binning-visible-columns)]
    (-> binning-query
        (lib.util/update-query-stage binning-stage-number
                                     update :breakout
                                     decorate-binned-refs binned-ref->window-type->window-ref)
        (lib.util/update-query-stage binning-stage-number
                                     update :order-by
                                     decorate-binned-refs binned-ref->window-type->window-ref)
        (update :stages #(into (vec %) (stages-after original-query stage-number))))))

;; TODO: ensure intact uuids
(defn- rewrite-binning-stage-in-query
  [query stage-number]
  (let [stage-number (lib.util/canonical-stage-index query stage-number)
        min-max-query* (min-max-query query stage-number)
        binning-query* (binning-query min-max-query* stage-number query)
        binning-stages (extract-stage-range binning-query* stage-number (+ 2 stage-number))]
    (swap-stage query stage-number binning-stages)))

;; TODO: breakout, order-by should be enough for now, binning of expressions will happend again in breakout...
(def ^:private stage-keys-binning
  [:breakout :order-by])

(defn- stage-with-binning?
  [query stage-number]
  (let [stage (-> (lib.util/query-stage query stage-number)
                  (select-keys stage-keys-binning))]
    (lib.util.match/match stage
      clause-with-binning?
      &match)))

(defn- maybe-rewrite-binning-stage
  "For lib.walk"
  [query stage-number]
  (let [stage-number (lib.util/canonical-stage-index query stage-number)
        stage (lib.util/query-stage query stage-number)]
    (if-not (stage-with-binning? query stage-number)
      stage
      (extract-stage-range (rewrite-binning-stage-in-query query stage-number)
                           stage-number
                           (+ 2 stage-number)))))

(defn rewrite-binning-window-min-max
  [query]
  @(def qqqqq (lib.walk/walk-stages
               query
               (fn [query stage-path _stage]
                 (lib.walk/apply-f-for-stage-at-path
                  maybe-rewrite-binning-stage query stage-path)))))
