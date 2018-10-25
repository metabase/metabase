(ns metabase.sync.analyze.fingerprint.insights
  "Deeper statistical analysis of results."
  (:require [kixi.stats
             [core :as stats]
             [math :as math]]
            [metabase.models.field :as field]
            [metabase.sync.analyze.fingerprint.fingerprinters :as f]
            [redux.core :as redux]))

(defn- last-n
  [n]
  (fn
    ([] [])
    ([acc]
     (concat (repeat (- n (count acc)) nil) acc))
    ([acc x]
     (if (< (count acc) n)
       (conj acc x)
       (conj (subvec acc 1) x)))))

(defn change
  "Relative difference between `x1` an `x2`."
  [x2 x1]
  (when (and x1 x2 (not (zero? x1)))
    (let [x2 (double x2)
          x1 (double x1)]
      (cond
        (every? neg? [x1 x2])     (change (- x1) (- x2))
        (and (neg? x1) (pos? x2)) (- (change x1 x2))
        (neg? x1)                 (- (change x2 x1))
        :else                     (/ (- x2 x1) x1)))))

(defn reservoir-sample
  "Transducer that samples a fixed number `n` of samples.
   https://en.wikipedia.org/wiki/Reservoir_sampling"
  [n]
  (fn
    ([] [(transient []) 0])
    ([[reservoir c] x]
     (let [c   (inc c)
           idx (rand-int c)]
       (cond
         (<= c n)  [(conj! reservoir x) c]
         (< idx n) [(assoc! reservoir idx x) c]
         :else     [reservoir c])))
    ([[reservoir _]] (persistent! reservoir))))

(defn mae
  "Given two functions: (fŷ input) and (fy input), returning the predicted and actual values of y
   respectively, calculates the mean absolute error of the estimate.
   https://en.wikipedia.org/wiki/Mean_absolute_error"
  [fy-hat fy]
  ((map (fn [x]
          (when x
            (math/abs (- (fy x) (fy-hat x))))))
   stats/mean))

(def ^:private trendline-function-families
  ;; http://mathworld.wolfram.com/LeastSquaresFitting.html
  [{:x-link-fn identity
    :y-link-fn identity
    :model     (fn [offset slope]
                 (fn [x]
                   (+ offset (* slope x))))
    :formula   (fn [offset slope]
                 [:+ offset [:* slope :x]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingExponential.html
   {:x-link-fn identity
    :y-link-fn math/log
    :model     (fn [offset slope]
                 (fn [x]
                   (* (math/exp offset) (math/exp (* slope x)))))
    :formula   (fn [offset slope]
                 [:* (math/exp offset) [:exp [:* slope :x]]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingLogarithmic.html
   {:x-link-fn math/log
    :y-link-fn identity
    :model     (fn [offset slope]
                 (fn [x]
                   (+ offset (* slope (math/log x)))))
    :formula   (fn [offset slope]
                 [:+ offset [:* slope [:log :x]]])}
   ;; http://mathworld.wolfram.com/LeastSquaresFittingPowerLaw.html
   {:x-link-fn math/log
    :y-link-fn math/log
    :model     (fn [offset slope]
                 (fn [x]
                   (* (math/exp offset) (math/pow x slope))))
    :formula   (fn [offset slope]
                 [:* (math/exp offset) [:pow :x slope]])}])

(def ^:private ^:const ^Long validation-set-size 20)

(defn- best-fit
  "Fit curves from `trendline-function-families` and pick the one with the smallest RMSE.
   To keep the operation single pass we collect a small validation set as we go using reservoir
   sampling, and use it to calculate RMSE."
  [fx fy]
  (redux/post-complete
   (redux/fuse
    {:fits (->> (for [{:keys [x-link-fn y-link-fn formula model]} trendline-function-families]
                  (redux/post-complete
                   (stats/simple-linear-regression (comp (stats/somef x-link-fn) fx)
                                                   (comp (stats/somef y-link-fn) fy))
                   (fn [[offset slope]]
                     (when-not (or (nil? offset)
                                   (nil? slope)
                                   (Double/isNaN offset)
                                   (Double/isNaN slope))
                       {:model   (model offset slope)
                        :formula (formula offset slope)}))))
                (apply redux/juxt))
     :validation-set ((keep (fn [row]
                              (let [x (fx row)
                                    y (fy row)]
                                (when (and x y)
                                  [x y]))))
                      (reservoir-sample validation-set-size))})
   (fn [{:keys [validation-set fits]}]
     (some->> fits
              (remove nil?)
              not-empty
              (apply min-key #(transduce identity
                                         (mae (comp (:model %) first) second)
                                         validation-set))
              :formula))))

(defn- timeseries?
  [{:keys [numbers datetimes others]}]
  (and (pos? (count numbers))
       (= (count datetimes) 1)
       (empty? others)))

(def ^:private ms->day
  "We downsize UNIX timestamps to lessen the chance of overflows and numerical instabilities."
  #(/ % (* 1000 60 60 24)))

(defn- timeseries-insight
  [{:keys [numbers datetimes]}]
  (let [datetime   (first datetimes)
        x-position (:position datetime)
        xfn        (if (or (-> datetime :base_type (isa? :type/DateTime))
                           (field/unix-timestamp? datetime))
                     #(some-> %
                              (nth x-position)
                              ;; at this point in the pipeline, dates are still stings
                              f/->date
                              (.getTime)
                              ms->day)
                     ;; unit=year workaround. While the field is in this case marked as :type/Text,
                     ;; at this stage in the pipeline the value is still an int, so we can use it
                     ;; directly.
                     (comp (stats/somef ms->day) #(nth % x-position)))]
    (apply redux/juxt (for [number-col numbers]
                        (redux/post-complete
                         (let [y-position (:position number-col)
                               yfn        #(nth % y-position)]
                           (redux/juxt ((map yfn) (last-n 2))
                                       (stats/simple-linear-regression xfn yfn)
                                       (best-fit xfn yfn)))
                         (fn [[[previous current] [offset slope] best-fit]]
                           {:last-value     current
                            :previous-value previous
                            :last-change    (change current previous)
                            :slope          slope
                            :offset         offset
                            :best-fit       best-fit
                            :col            (:name number-col)}))))))

(defn- datetime-truncated-to-year?
  "This is hackish as hell, but we change datetimes with year granularity to strings upstream and
   this is the only way to recover the information they were once datetimes."
  [{:keys [base_type unit fingerprint] :as field}]
  (and (= base_type :type/Text)
       (contains? field :unit)
       (nil? unit)
       (or (nil? (:type fingerprint))
           (-> fingerprint :type :type/DateTime))))

(defn insights
  "Based on the shape of returned data construct a transducer to statistically analyize data."
  [cols]
  (let [cols-by-type (->> cols
                          (map-indexed (fn [idx col]
                                         (assoc col :position idx)))
                          (group-by (fn [{:keys [base_type unit] :as field}]
                                      (cond
                                        (datetime-truncated-to-year? field)          :datetimes
                                        (metabase.util.date/date-extract-units unit) :numbers
                                        (field/unix-timestamp? field)                :datetimes
                                        (isa? base_type :type/Number)                :numbers
                                        (isa? base_type :type/DateTime)              :datetimes
                                        :else                                        :others))))]
    (cond
      (timeseries? cols-by-type) (timeseries-insight cols-by-type)
      :else                      (f/constant-fingerprinter nil))))
