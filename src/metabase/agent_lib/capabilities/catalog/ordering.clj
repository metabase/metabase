(ns metabase.agent-lib.capabilities.catalog.ordering
  "Breakout and ordering structured capability entries."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(def capabilities
  "Breakout-ordering helper capability entries."
  [{:op 'with-temporal-bucket, :binding #'lib/with-temporal-bucket, :kind :nested, :group :breakout-ordering, :prompt-forms ["[\"with-temporal-bucket\", [\"field\", 302], \"month\"]"], :shape "[\"with-temporal-bucket\", [\"field\", 2205], \"month\"]", :example "[\"with-temporal-bucket\", [\"field\", 2205], \"month\"]"}
   {:op 'with-binning,         :binding #'lib/with-binning,         :kind :nested, :group :breakout-ordering, :prompt-forms ["[\"with-binning\", [\"field\", 303], strategy]"]}
   {:op 'asc,                  :kind :nested, :group :breakout-ordering, :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"asc\", [\"field\", 301]]"]}
   {:op 'desc,                 :kind :nested, :group :breakout-ordering, :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"desc\", [\"field\", 301]]"]}])
