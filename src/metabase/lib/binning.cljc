(ns metabase.lib.binning
  (:require
    [metabase.lib.dispatch :as lib.dispatch]
    [metabase.lib.hierarchy :as lib.hierarchy]
    [metabase.lib.metadata.calculation :as lib.metadata.calculation]
    [metabase.lib.schema :as lib.schema]
    [metabase.lib.schema.binning :as lib.schema.binning]
    [metabase.shared.formatting.numbers :as fmt.num]
    [metabase.shared.util.i18n :as i18n]
    [metabase.util.malli :as mu]))

(defmulti with-binning-method
  "Implementation for [[with-binning]]. Implement this to tell [[with-binning]] how to add binning to a particular MBQL
  clause."
  {:arglists '([x binning])}
  (fn [x _binning]
    (lib.dispatch/dispatch-value x)) :hierarchy lib.hierarchy/hierarchy)

(defmethod with-binning-method :dispatch-type/fn
  [f binning]
  (fn [query stage-number]
    (let [x (f query stage-number)]
      (with-binning-method x binning))))

(mu/defn with-binning
  "Add binning to an MBQL clause or something that can be converted to an MBQL clause.
  Eg. for a Field or Field metadata or `:field` clause, this might do something like this:

    (with-binning some-field (bin-by :num-bins 4))

    =>

    [:field {:binning {:strategy :num-bins :num-bins 4}} 1]

  Pass `nil` `binning` to remove any binning."
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
  `:metabase.lib.schema.binning/binning-strategies` that are allowed to be used with `x`."
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

(defn- default-auto-bin []
  {:display-name (i18n/tru "Auto bin")
   :default      true
   :mbql         {:strategy :default}})

(defn- with-binning-option-type [m]
  (assoc m :lib/type ::binning-option))

(def ^:private *numeric-binning-strategies
  (delay (mapv with-binning-option-type
               [(default-auto-bin)
                {:display-name (i18n/tru "10 bins")  :mbql {:strategy :num-bins :num-bins 10}}
                {:display-name (i18n/tru "50 bins")  :mbql {:strategy :num-bins :num-bins 50}}
                {:display-name (i18n/tru "100 bins") :mbql {:strategy :num-bins :num-bins 100}}])))

(defn numeric-binning-strategies
  "List of binning options for numeric fields. These split the data evenly into a fixed number of bins."
  []
  @*numeric-binning-strategies)

(def ^:private *coordinate-binning-strategies
  (delay
    (mapv with-binning-option-type
          [(default-auto-bin)
           {:display-name (i18n/tru "Bin every 0.1 degrees") :mbql {:strategy :bin-width :bin-width 0.1}}
           {:display-name (i18n/tru "Bin every 1 degree")    :mbql {:strategy :bin-width :bin-width 1.0}}
           {:display-name (i18n/tru "Bin every 10 degrees")  :mbql {:strategy :bin-width :bin-width 10.0}}
           {:display-name (i18n/tru "Bin every 20 degrees")  :mbql {:strategy :bin-width :bin-width 20.0}}])))

(defn coordinate-binning-strategies
  "List of binning options for coordinate fields (ie. latitude and longitude). These split the data into as many
  ranges as necessary, with each range being a certain number of degrees wide."
  []
  @*coordinate-binning-strategies)

(defn binning-display-name
  "This is implemented outside of [[lib.metadata.calculation/display-name]] because it needs access to the field type.
  It's called directly by `:field` or `:metadata/field`'s [[lib.metadata.calculation/display-name]]."
  [{:keys [bin-width num-bins strategy] :as binning-options} field-metadata]
  (when binning-options
    (case strategy
      :num-bins  (i18n/trun "{0} bin" "{0} bins" num-bins)
      :bin-width (str (fmt.num/format-number bin-width {})
                      (when (isa? (:semantic-type field-metadata) :type/Coordinate)
                        "°"))
      :default   (i18n/tru "Auto binned"))))

(defmethod lib.metadata.calculation/display-info-method ::binning-option
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
