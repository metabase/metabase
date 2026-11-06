(ns metabase.product-analytics.core
  "Saved analyses. An analysis is a query: ordinary stages, which are all anything but the analysis page reads, and an
  `:analysis` key holding the form that built them. See [[metabase.lib.schema.analysis]]."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.analysis :as lib.schema.analysis]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.product-analytics.compile :as product-analytics.compile]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::settings.input
  "The settings a request names. The rest take their defaults, and are stored as values."
  [:map {:closed true}
   [:date_range {:optional true} ::lib.schema.analysis/date-range]
   [:grain      {:optional true} [:enum "person" "session"]]
   [:sub_period {:optional true} [:enum "day" "week"]]
   [:active     {:optional true} [:maybe ::lib.schema.analysis/event]]
   [:filters    {:optional true} [:sequential ::lib.schema.analysis/filter]]])

(mr/def ::analysis.input
  "What a request asks for. `:columns` are the analysis's own once chosen. Without them, a new analysis starts from the
  columns its event table suggests."
  [:map {:closed true}
   [:table_id ::lib.schema.id/table]
   [:kind     [:enum "habit"]]
   [:columns  {:optional true} ::lib.schema.analysis/columns]
   [:settings ::settings.input]])

(def ^:private analysis-version 1)

(def ^:private default-settings
  {:date_range {:type "relative", :value -90, :unit "day"}
   :grain      "person"
   :sub_period "day"
   :active     nil
   :filters    []})

(defn- suggested-columns
  "The columns each role suggests: what sync detected, overridden by what a person set."
  [{:keys [detected_event_settings event_settings]}]
  (let [settings (merge (get detected_event_settings "settings") event_settings)]
    {:timestamp (get settings "columns.timestamp")
     :person    (get settings "columns.person")
     :session   (get settings "columns.session")}))

(defn- required-columns
  [{:keys [timestamp person], :as columns}]
  (when-not (and timestamp person)
    (throw (ex-info (tru "This table needs an event time column and a person column before it can be analyzed.")
                    {:status-code 400})))
  columns)

(mu/defn build-analysis :- ::lib.schema/query
  "The query for the analysis `input` asks for, with every setting written out. Checks the current user can read the
  event table."
  [{:keys [table_id kind columns settings]} :- ::analysis.input]
  (let [table (api/read-check :model/Table table_id)]
    (-> (lib-be/application-database-metadata-provider (:db_id table))
        (product-analytics.compile/habit-query
         table_id
         {:version          analysis-version
          :compiler_version product-analytics.compile/compiler-version
          :kind             kind
          :columns          (required-columns (or columns (suggested-columns table)))
          :settings         (merge default-settings settings)})
        (dissoc :lib/metadata))))

(defn- built-from-analysis?
  [{:keys [analysis], :as query}]
  (try
    (= (seq (lib-be/query-hash query))
       (seq (lib-be/query-hash (product-analytics.compile/habit-query query
                                                                      (lib/primary-source-table-id query)
                                                                      analysis))))
    (catch clojure.lang.ExceptionInfo e
      (log/warn e "Couldn't build this query's analysis again")
      false)))

(defn without-outdated-analysis
  "`query`, without its `:analysis` if its stages are no longer what that analysis builds, because someone edited them.
  It's an ordinary question from then on. A query from an earlier compiler can't be checked, so it keeps its analysis."
  [{:keys [analysis], :as query}]
  (if (and analysis
           (= (:compiler_version analysis) product-analytics.compile/compiler-version)
           (not (built-from-analysis? query)))
    (dissoc query :analysis)
    query))
