(ns metabase.lib.schema.binning
  "Malli schema for binning of a column's values.

  There are two approaches to binning, selected by `:strategy`:
  - `{:strategy :bin-width :bin-width 10}` makes 1 or more bins that are 10 wide;
  - `{:strategy :num-bins  :num-bins  12}` splits the column into 12 bins."
  (:refer-clojure :exclude [some])
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some]]))

(mr/def ::strategy
  [:enum
   {:decode/normalize lib.schema.common/normalize-keyword}
   :bin-width
   :default ; called 'auto' in the GUI
   :num-bins])

(mr/def ::num-bins
  "Number of bins to use."
  pos-int?)

(mr/def ::bin-width
  "Bin width (size of each bin)."
  ::lib.schema.common/positive-number)

;;; the binning options that goes in a `:field` ref under the `:binning` key
(mr/def ::binning
  "Schema for `:binning` options passed to a `:field` clause."
  [:and
   {:decode/normalize (fn [binning]
                        (when-some [binning (lib.schema.common/normalize-map binning)]
                          (cond-> binning
                            (:strategy binning) (update :strategy lib.schema.common/normalize-keyword))))
    :decode/api       lib.schema.common/remove-internal-keys
    :encode/serialize lib.schema.common/remove-internal-keys}
   [:multi {:dispatch (fn [x]
                        (keyword (some #(get x %) [:strategy "strategy"])))
            :ts/dispatch-key :strategy
            :error/fn (fn [{:keys [value]} _]
                        (str "Invalid binning strategy" (pr-str value)))}
    [:default   [:map {:closed true}
                 [:strategy  [:= :default]]
                 [:bin-width {:optional true} [:ref ::bin-width]]
                 [:num-bins  {:optional true} [:ref ::num-bins]]
                 [:min-value {:optional true} number?]
                 [:max-value {:optional true} number?]]]
    [:bin-width [:map {:closed true}
                 [:strategy  [:= :bin-width]]
                 [:bin-width [:ref ::bin-width]]
                 [:num-bins  {:optional true} [:ref ::num-bins]]
                 [:min-value {:optional true} number?]
                 [:max-value {:optional true} number?]]]
    [:num-bins  [:map {:closed true}
                 [:strategy  [:= :num-bins]]
                 [:num-bins  [:ref ::num-bins]]
                 [:bin-width {:optional true} [:ref ::bin-width]]
                 [:min-value {:optional true} number?]
                 [:max-value {:optional true} number?]]]]])

(mr/def ::binning.resolved
  "What [[metabase.lib.binning/binning]] returns: the `:binning` options of a `:field` ref or of column metadata, plus
  the `:lib/type` tag and the `:metadata-fn` closure that [[metabase.lib.metadata.calculation/display-info]] uses to
  fetch the column those options apply to.

  This is a Lib return value, never part of a query -- the two extra keys are attached on the way out
  by [[metabase.lib.binning/binning-method]] and are `dissoc`ed again before the options go back into a query. They
  are optional because the equality helpers ([[metabase.lib.binning/binning=]] and friends) compare a resolved
  binning against a plain [[binning]] taken straight from a ref."
  [:merge
   ::binning
   [:map
    [:lib/type    {:optional true} [:= :metabase.lib.binning/binning]]
    [:metadata-fn {:optional true} ifn?]]])

(mr/def ::binning-option
  [:map
   [:lib/type [:= :option/binning]]
   [:display-name :string]
   [:mbql [:maybe ::binning]]
   [:default {:optional true} :boolean]])
