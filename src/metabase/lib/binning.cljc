(ns metabase.lib.binning
  (:require
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.shared.formatting.numbers :as fmt.num]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmulti with-binning-method
  "Implementation for [[with-binning]]. Implement this to tell [[with-binning]] how to add binning to a particular MBQL
  clause."
  {:arglists '([x binning])}
  (fn [x _binning]
    (lib.dispatch/dispatch-value x)) :hierarchy lib.hierarchy/hierarchy)

(mu/defn with-binning
  "Add binning to an MBQL clause or something that can be converted to an MBQL clause.
  Eg. for a Field or Field metadata or `:field` clause, this might do something like this:

    (with-binning some-field (bin-by :num-bins 4))

    =>

    [:field {:binning {:strategy :num-bins :num-bins 4}} 1]

  Pass `nil` `binning` to remove any binning."
  {:style/indent [:form]}
  [x binning :- [:maybe [:or ::lib.schema.binning/binning ::lib.schema.binning/binning-option]]]
  (with-binning-method x (if (contains? binning :mbql)
                           (:mbql binning)
                           binning)))

(defmulti binning-method
  "Implementation of [[binning]]. Return the current binning options associated with `x`."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod binning-method :default
  [_x]
  nil)

(mu/defn binning :- [:maybe ::lib.schema.binning/binning]
  "Get the current binning options associated with `x`, if any."
  [x]
  (binning-method x))

(defmulti available-binning-strategies-method
  "Implementation for [[available-binning-strategies]]. Return a set of binning strategies from
  `:metabase.lib.schema.binning/strategy` that are allowed to be used with `x`."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod available-binning-strategies-method :default
  [_query _stage-number _x]
  nil)

(mu/defn available-binning-strategies :- [:sequential [:ref ::lib.schema.binning/binning-option]]
  "Get a set of available binning strategies for `x`. Returns nil if none are available."
  ([query x]
   (available-binning-strategies query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (available-binning-strategies-method query stage-number x)))

(mu/defn default-auto-bin :- ::lib.schema.binning/binning-option
  "Returns the basic auto-binning strategy.

  Public because it's used directly by some drill-thrus."
  []
  {:lib/type     :option/binning
   :display-name (i18n/tru "Auto bin")
   :default      true
   :mbql         {:strategy :default}})

(defn- with-binning-option-type [m]
  (assoc m :lib/type :option/binning))

(mu/defn numeric-binning-strategies :- [:sequential ::lib.schema.binning/binning-option]
  "List of binning options for numeric fields. These split the data evenly into a fixed number of bins."
  []
  (mapv with-binning-option-type
        [(default-auto-bin)
         {:display-name (i18n/tru "10 bins")  :mbql {:strategy :num-bins :num-bins 10}}
         {:display-name (i18n/tru "50 bins")  :mbql {:strategy :num-bins :num-bins 50}}
         {:display-name (i18n/tru "100 bins") :mbql {:strategy :num-bins :num-bins 100}}]))

(mu/defn coordinate-binning-strategies :- [:sequential ::lib.schema.binning/binning-option]
  "List of binning options for coordinate fields (ie. latitude and longitude). These split the data into as many
  ranges as necessary, with each range being a certain number of degrees wide."
  []
  (mapv with-binning-option-type
        [(default-auto-bin)
         {:display-name (i18n/tru "Bin every 0.1 degrees") :mbql {:strategy :bin-width :bin-width 0.1}}
         {:display-name (i18n/tru "Bin every 1 degree")    :mbql {:strategy :bin-width :bin-width 1.0}}
         {:display-name (i18n/tru "Bin every 10 degrees")  :mbql {:strategy :bin-width :bin-width 10.0}}
         {:display-name (i18n/tru "Bin every 20 degrees")  :mbql {:strategy :bin-width :bin-width 20.0}}]))

(mu/defn binning-display-name :- ::lib.schema.common/non-blank-string
  "This is implemented outside of [[lib.metadata.calculation/display-name]] because it needs access to the field type.
  It's called directly by `:field` or `:metadata/column`'s [[lib.metadata.calculation/display-name]]."
  [{:keys [bin-width num-bins strategy] :as binning-options} :- ::lib.schema.binning/binning
   column-metadata                                           :- ::lib.schema.metadata/column]
  (when binning-options
    (case strategy
      :num-bins  (i18n/trun "{0} bin" "{0} bins" num-bins)
      :bin-width (str (fmt.num/format-number bin-width {})
                      (when (isa? (:semantic-type column-metadata) :type/Coordinate)
                        "°"))
      :default   (i18n/tru "Auto binned"))))

(defmethod lib.metadata.calculation/display-info-method :option/binning
  [_query _stage-number binning-option]
  (select-keys binning-option [:display-name :default :selected]))

(defmethod lib.metadata.calculation/display-info-method ::binning
  [query stage-number binning-value]
  (let [field-metadata ((:metadata-fn binning-value) query stage-number)]
    (merge {:display-name (binning-display-name binning-value field-metadata)}
           (when (= :default (:strategy binning-value))
             {:default true}))))

(mu/defn strategy= :- boolean?
  "Given a binning option (as returned by [[available-binning-strategies]]) and the binning value (possibly nil) from
  a column, check if they match."
  [binning-option :- ::lib.schema.binning/binning-option
   column-binning :- [:maybe ::lib.schema.binning/binning]]
  (= (:mbql binning-option)
     (select-keys column-binning [:strategy :num-bins :bin-width])))

(mu/defn resolve-bin-width :- [:maybe [:map
                                       [:bin-width ::lib.schema.binning/bin-width]
                                       [:min-value number?]
                                       [:max-value number?]]]
  "If a `column` is binned, resolve the actual bin width that will be used when a query is processed as well as min
  and max values."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   column-metadata       :- ::lib.schema.metadata/column
   value                 :- number?]
  (when-let [binning-options (binning column-metadata)]
    (case (:strategy binning-options)
      :num-bins
      (when-let [{min-value :min, max-value :max, :as _number-fingerprint} (get-in column-metadata [:fingerprint :type :type/Number])]
        (let [{:keys [num-bins]} binning-options
              bin-width          (lib.binning.util/nicer-bin-width min-value max-value num-bins)]
          {:bin-width bin-width
           :min-value value
           :max-value (+ value bin-width)}))

      :bin-width
      (let [{:keys [bin-width]} binning-options]
        (assert (number? bin-width))
        {:bin-width bin-width
         :min-value value
         :max-value (+ value bin-width)})

      :default
      (when-let [{min-value :min, max-value :max, :as _number-fingerprint} (get-in column-metadata [:fingerprint :type :type/Number])]
        (when-let [[_strategy {:keys [bin-width]}] (lib.binning.util/resolve-options metadata-providerable
                                                                                     :default
                                                                                     nil
                                                                                     column-metadata
                                                                                     min-value
                                                                                     max-value)]
          {:bin-width bin-width
           :min-value value
           :max-value (+ value bin-width)})))))
