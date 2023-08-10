(ns metabase.lib.join.common
  (:require
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(def JoinWithOptionalAlias
  "A Join that may not yet have an `:alias`, which is normally required; [[join]] accepts this and will add a default
  alias if one is not present."
  [:merge
   [:ref ::lib.schema.join/join]
   [:map
    [:alias {:optional true} [:ref ::lib.schema.join/alias]]]])

(def PartialJoin
  "A join that may not yet have an `:alias` or `:conditions`."
  [:merge
   JoinWithOptionalAlias
   [:map
    [:conditions {:optional true} [:ref ::lib.schema.join/conditions]]]])

(def Field
  "Schema for either Column metadata or a `:field` ref."
  [:or
   lib.metadata/ColumnMetadata
   [:ref :mbql.clause/field]])

(def FieldOrPartialJoin
  "Schema for Column metadata, a `:field` ref, or a join clause that may not yet be fully formed."
  [:or Field PartialJoin])

(defn join?
  "Is `x` a join map? Does not check for validity; just checks `:lib/type`."
  [x]
  (= (lib.dispatch/dispatch-value x) :mbql/join))

;; TODO -- you can also join other queries, right?
(def Joinable
  "Schema for something we can create a join clause from. Either a Table metadata or Card metadata."
  [:or lib.metadata/TableMetadata lib.metadata/CardMetadata])

(def JoinOrJoinable
  "Schema for either a complete (valid) join clause or something that is [[Joinable]]."
  [:or
   [:ref ::lib.schema.join/join]
   Joinable])

(mu/defn resolve-join :- ::lib.schema.join/join
  "Resolve a join with a specific `join-alias`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (let [{:keys [joins]} (lib.util/query-stage query stage-number)]
    (or (m/find-first #(= (:alias %) join-alias)
                      joins)
        (throw (ex-info (i18n/tru "No join named {0}, found: {1}"
                                  (pr-str join-alias)
                                  (pr-str (mapv :alias joins)))
                        {:join-alias   join-alias
                         :query        query
                         :stage-number stage-number})))))

(mu/defn joins :- [:maybe ::lib.schema.join/joins]
  "Get all joins in a specific `stage` of a `query`. If `stage` is unspecified, returns joins in the final stage of the
  query."
  ([query]
   (joins query -1))
  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (get (lib.util/query-stage query stage-number) :joins))))

(mu/defn joined-thing :- [:maybe Joinable]
  "Return metadata about the origin of `a-join` using `metadata-providerable` as the source of information."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   a-join                :- PartialJoin]
  (let [origin (-> a-join :stages first)]
    (cond
      (:source-card origin)  (lib.metadata/card metadata-providerable (:source-card origin))
      (:source-table origin) (lib.metadata/table metadata-providerable (:source-table origin)))))
