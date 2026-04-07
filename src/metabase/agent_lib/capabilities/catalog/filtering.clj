(ns metabase.agent-lib.capabilities.catalog.filtering
  "Filtering structured capability entries."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(def capabilities
  "Filtering helper capability entries."
  [{:op '=,                  :binding #'lib/=,                 :kind :nested, :group :filtering, :prompt-forms ["[\"=\", [\"field\", 101], \"value\"]"]}
   {:op '!=,                 :binding #'lib/!=,                :kind :nested, :group :filtering, :prompt-forms ["[\"!=\", [\"field\", 101], \"value\"]"]}
   {:op '<,                  :binding #'lib/<,                 :kind :nested, :group :filtering, :prompt-forms ["[\"<\", [\"field\", 101], 10]"]}
   {:op '<=,                 :binding #'lib/<=,                :kind :nested, :group :filtering, :prompt-forms ["[\"<=\", [\"field\", 101], 10]"]}
   {:op '>,                  :binding #'lib/>,                 :kind :nested, :group :filtering, :prompt-forms ["[\">\", [\"field\", 101], 10]"]}
   {:op '>=,                 :binding #'lib/>=,                :kind :nested, :group :filtering, :prompt-forms ["[\">=\", [\"field\", 101], 10]"]}
   {:op 'between,            :binding #'lib/between,           :kind :nested, :group :filtering, :prompt-forms ["[\"between\", [\"field\", 101], 1, 100]"], :shape "[\"between\", [\"field\", 2205], 1, 100]", :example "[\"between\", [\"field\", 2205], 1, 100]", :prompt-notes ["If the question explicitly asks for 2024 or another exact year, use an exact 2024 restriction, not a relative current-year or last-year filter." "Using an exact helper year field like `[\"=\", [\"field\", year_field], 2024]` is acceptable when it is clearly equivalent to filtering the requested date field to 2024."]}
   {:op 'contains,           :binding #'lib/contains,          :kind :nested, :group :filtering, :prompt-forms ["[\"contains\", [\"field\", 101], \"text\"]"]}
   {:op 'does-not-contain,   :binding #'lib/does-not-contain,  :kind :nested, :group :filtering, :prompt-forms ["[\"does-not-contain\", [\"field\", 101], \"text\"]"], :shape "[\"does-not-contain\", [\"field\", 2204], \"trial\"]", :example "[\"does-not-contain\", [\"field\", 2204], \"trial\"]"}
   {:op 'starts-with,        :binding #'lib/starts-with,       :kind :nested, :group :filtering, :prompt-forms ["[\"starts-with\", [\"field\", 101], \"prefix\"]"]}
   {:op 'ends-with,          :binding #'lib/ends-with,         :kind :nested, :group :filtering, :prompt-forms ["[\"ends-with\", [\"field\", 101], \"suffix\"]"]}
   {:op 'is-null,            :binding #'lib/is-null,           :kind :nested, :group :filtering, :prompt-forms ["[\"is-null\", [\"field\", 101]]"]}
   {:op 'not-null,           :binding #'lib/not-null,          :kind :nested, :group :filtering, :prompt-forms ["[\"not-null\", [\"field\", 101]]"]}
   {:op 'is-empty,           :binding #'lib/is-empty,          :kind :nested, :group :filtering, :prompt-forms ["[\"is-empty\", [\"field\", 101]]"], :shape "[\"is-empty\", [\"field\", 2204]]", :example "[\"is-empty\", [\"field\", 2204]]"}
   {:op 'not-empty,          :binding #'lib/not-empty,         :kind :nested, :group :filtering, :prompt-forms ["[\"not-empty\", [\"field\", 101]]"], :shape "[\"not-empty\", [\"field\", 2204]]", :example "[\"not-empty\", [\"field\", 2204]]"}
   {:op 'and,                :binding #'lib/and,               :kind :nested, :group :filtering, :prompt-forms ["[\"and\", clause1, clause2]"]}
   {:op 'or,                 :binding #'lib/or,                :kind :nested, :group :filtering, :prompt-forms ["[\"or\", clause1, clause2]"]}
   {:op 'not,                :binding #'lib/not,               :kind :nested, :group :filtering, :prompt-forms ["[\"not\", clause]"]}
   {:op 'time-interval,      :binding #'lib/time-interval,     :kind :nested, :group :filtering, :prompt-forms ["[\"time-interval\", [\"field\", 101], -30, \"day\"]"]}
   {:op 'relative-time-interval, :binding #'lib/relative-time-interval, :kind :nested, :group :filtering, :arities #{5}, :prompt-forms ["[\"relative-time-interval\", [\"field\", 101], -30, \"day\", 0, \"day\"]"], :shape "[\"relative-time-interval\", [\"field\", 2205], -30, \"day\", 0, \"day\"]", :example "[\"relative-time-interval\", [\"field\", 2205], -30, \"day\", 0, \"day\"]"}
   {:op 'in,                 :binding #'lib/in,                :kind :nested, :group :filtering, :prompt-forms ["[\"in\", [\"field\", 101], [\"a\", \"b\"]]"], :shape "[\"in\", [\"field\", 2492], [\"authorized\", \"pending\", \"partially_paid\"]]", :example "[\"in\", [\"field\", 2492], [\"authorized\", \"pending\", \"partially_paid\"]]"}
   {:op 'not-in,             :binding #'lib/not-in,            :kind :nested, :group :filtering, :prompt-forms ["[\"not-in\", [\"field\", 101], [\"a\", \"b\"]]"], :shape "[\"not-in\", [\"field\", 2492], [\"authorized\", \"pending\"]]", :example "[\"not-in\", [\"field\", 2492], [\"authorized\", \"pending\"]]"}
   {:op 'inside,             :binding #'lib/inside,            :kind :nested, :group :filtering, :prompt-forms ["[\"inside\", [\"field\", 401], [\"field\", 402], 40.0, 30.0, -70.0, -80.0]"], :shape "[\"inside\", [\"field\", 401], [\"field\", 402], 40.0, 30.0, -70.0, -80.0]", :example "[\"inside\", [\"field\", 401], [\"field\", 402], 40.0, 30.0, -70.0, -80.0]"}
   {:op 'segment,            :binding #'lib/segment,           :kind :nested, :group :filtering, :prompt-forms ["[\"segment\", 88]"], :shape "[\"segment\", 88]", :example "[\"segment\", 88]"}])
