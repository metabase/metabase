(ns metabase.agent-lib.capabilities.catalog.sources
  "Source and query-reference structured capability entries."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(def ^{:doc "Source and query-reference capability entries."}
  capabilities
  [{:op 'field,           :kind :nested, :group :sources,    :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"field\", 101]"], :shape "[\"field\", 101]", :example "[\"field\", 101]"}
   {:op 'table,           :kind :nested, :group :sources,    :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"table\", 42]"], :shape "[\"table\", 42]", :example "[\"table\", 42]"}
   {:op 'card,            :kind :nested, :group :sources,    :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"card\", 55]"], :shape "[\"card\", 55]", :example "[\"card\", 55]"}
   {:op 'metric,          :kind :nested, :group :sources,    :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"metric\", 77]"], :shape "[\"metric\", 77]", :example "[\"metric\", 77]"}
   {:op 'measure,         :kind :nested, :group :sources,    :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"measure\", 91]"], :shape "[\"measure\", 91]", :example "[\"measure\", 91]", :prompt-notes ["Use `measure` for a named table/model measure aggregation when it is available in the source context. Measures use real numeric ids."]}
   {:op 'expression-ref,  :binding lib/expression-ref, :kind :nested, :group :query-refs, :arities #{1}, :prompt-forms ["[\"expression-ref\", \"Net Amount\"]"], :shape "[\"expression-ref\", \"Net Amount\"]", :example "[\"expression-ref\", \"Net Amount\"]"}
   {:op 'aggregation-ref, :kind :nested, :group :query-refs, :runtime-provided? true, :arities #{1}, :prompt-forms ["[\"aggregation-ref\", 0]"], :shape "[\"aggregation-ref\", 0]", :example "[\"aggregation-ref\", 0]"}])
