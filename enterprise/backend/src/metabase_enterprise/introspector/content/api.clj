(ns metabase-enterprise.introspector.content.api
  "Admin Introspector — content area. Lists stale/broken/unreferenced cards, dashboards, and
  transforms across the whole instance, with multi-condition badges per row.

  POC: no premium-feature gating; routes registered unconditionally for EE builds."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.introspector.content.queries :as q]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(defn- parse-conditions
  "Accepts a comma-separated string like \"stale,broken\" or nil; returns a keyword set of
  recognized condition names. Invalid entries are dropped silently."
  [s]
  (when s
    (->> (str/split s #",")
         (map str/trim)
         (remove str/blank?)
         (map keyword)
         (filter #{:stale :broken :unreferenced})
         set
         not-empty)))

(defn- parse-cutoff
  "Parse a yyyy-MM-dd string into a LocalDate, or throw a 400."
  [s]
  (when (some-> s str/blank? not)
    (try (t/local-date "yyyy-MM-dd" s)
         (catch Exception _
           (throw (ex-info (str "invalid stale-before: '" s "' expected yyyy-MM-dd")
                           {:status 400}))))))

(def ^:private list-query-args
  [:map
   [:conditions       {:optional true} [:maybe :string]]
   [:stale-before     {:optional true} [:maybe :string]]
   [:collection-id    {:optional true} [:maybe ms/PositiveInt]]
   [:include-personal {:optional true} [:maybe :boolean]]
   [:search           {:optional true} [:maybe :string]]
   [:sort-column      {:optional true} [:maybe [:enum "name" "last_used_at"]]]
   [:sort-direction   {:optional true} [:maybe [:enum "asc" "desc"]]]
   [:limit            {:optional true} [:maybe ms/PositiveInt]]
   [:offset           {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]])

(def ^:private transforms-query-args
  [:map
   [:conditions     {:optional true} [:maybe :string]]
   [:search         {:optional true} [:maybe :string]]
   [:sort-column    {:optional true} [:maybe [:enum "name" "last_used_at"]]]
   [:sort-direction {:optional true} [:maybe [:enum "asc" "desc"]]]
   [:limit          {:optional true} [:maybe ms/PositiveInt]]
   [:offset         {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]])

(api.macros/defendpoint :get "/cards"
  "Federated list of cards in problematic states. Returns rows with `is_stale`, `is_broken`,
  `is_unreferenced` flags plus standard card display fields."
  [_route
   {:keys [conditions stale-before collection-id include-personal search
           sort-column sort-direction limit offset]} :- list-query-args]
  (api/check-superuser)
  (q/fetch-cards {:conditions        (parse-conditions conditions)
                  :cutoff-date       (parse-cutoff stale-before)
                  :collection-id     collection-id
                  :include-personal? (boolean include-personal)
                  :search            search
                  :sort-column       (keyword (or sort-column "name"))
                  :sort-direction    (keyword (or sort-direction "asc"))
                  :limit             (or limit 50)
                  :offset            (or offset 0)}))

(api.macros/defendpoint :get "/dashboards"
  "Federated list of dashboards in problematic states."
  [_route
   {:keys [conditions stale-before collection-id include-personal search
           sort-column sort-direction limit offset]} :- list-query-args]
  (api/check-superuser)
  (q/fetch-dashboards {:conditions        (parse-conditions conditions)
                       :cutoff-date       (parse-cutoff stale-before)
                       :collection-id     collection-id
                       :include-personal? (boolean include-personal)
                       :search            search
                       :sort-column       (keyword (or sort-column "name"))
                       :sort-direction    (keyword (or sort-direction "asc"))
                       :limit             (or limit 50)
                       :offset            (or offset 0)}))

(api.macros/defendpoint :get "/transforms"
  "Federated list of transforms in problematic states. Supports `:broken` and `:unreferenced`;
  `:stale` is ignored if passed (transforms have no `last_used_at`)."
  [_route
   {:keys [conditions search sort-column sort-direction limit offset]} :- transforms-query-args]
  (api/check-superuser)
  (q/fetch-transforms {:conditions     (parse-conditions conditions)
                       :search         search
                       :sort-column    (keyword (or sort-column "name"))
                       :sort-direction (keyword (or sort-direction "asc"))
                       :limit          (or limit 50)
                       :offset         (or offset 0)}))

(api.macros/defendpoint :get "/summary"
  "Per-entity-type, per-condition counts for the stat strip."
  [_route _query]
  (api/check-superuser)
  (q/summary))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/introspector/content` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
