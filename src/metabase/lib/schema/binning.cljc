(ns metabase.lib.schema.binning
  "Malli schema for binning of a column's values.

  There are two approaches to binning, selected by `:strategy`:
  - `{:strategy :bin-width :bin-width 10}` makes 1 or more bins that are 10 wide;
  - `{:strategy :num-bins  :num-bins  12}` splits the column into 12 bins."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::strategy
  [:enum
   {:decode/normalize keyword}
   :bin-width :default :num-bins])

(mr/def ::num-bins
  pos-int?)

(mr/def ::bin-width
  ::lib.schema.common/positive-number)

;;; the binning options that goes in a `:field` ref under the `:binning` key
(mr/def ::binning
  [:multi {:dispatch (fn [x]
                       (keyword (some #(get x %) [:strategy "strategy"])))
           :error/fn (fn [{:keys [value]} _]
                       (str "Invalid binning strategy" (pr-str value)))}
   [:default   [:map
                {:decode/normalize lib.schema.common/normalize-map}
                [:strategy [:= {:decode/normalize keyword} :default]]]]
   [:bin-width [:map
                {:decode/normalize lib.schema.common/normalize-map}
                [:strategy  [:= {:decode/normalize keyword} :bin-width]]
                [:bin-width [:ref ::bin-width]]]]
   [:num-bins  [:map
                {:decode/normalize lib.schema.common/normalize-map}
                [:strategy [:= {:decode/normalize keyword} :num-bins]]
                [:num-bins [:ref ::num-bins]]]]])

(mr/def ::binning-option
  [:map
   [:lib/type [:= :option/binning]]
   [:display-name :string]
   [:mbql [:maybe ::binning]]
   [:default {:optional true} :boolean]])
