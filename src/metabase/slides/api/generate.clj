(ns metabase.slides.api.generate
  "`/api/slides/generate` — AI-driven slide deck generation. Accepts a prompt
   plus optional cards/dashboards to anchor the deck in real Metabase content,
   and returns a structured deck the editor can load."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.slides.ai :as slides.ai]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private GenerateOptions
  [:map
   [:prompt ms/NonBlankString]
   [:card_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:dashboard_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(defn- readable [entities]
  (filter (fn [e] (try (api/read-check e) true (catch Exception _ false))) entities))

(defn- fetch-cards
  "Cards the current user can read, by id."
  [card-ids]
  (when (seq card-ids)
    (readable
     (t2/select [:model/Card :id :name :description :display :collection_id]
                :id [:in card-ids] :archived false))))

(defn- fetch-dashboards
  "Dashboards the current user can read, by id."
  [dashboard-ids]
  (when (seq dashboard-ids)
    (readable
     (t2/select [:model/Dashboard :id :name :description :collection_id]
                :id [:in dashboard-ids] :archived false))))

(defn- cards-on-dashboards
  "Pull all cards living on the given dashboards via dashboard_cards. The LLM
   gets the full bag and decides which to actually embed."
  [dashboards]
  (when (seq dashboards)
    (let [card-ids (->> (t2/select [:model/DashboardCard :card_id]
                                   :dashboard_id [:in (map :id dashboards)])
                        (keep :card_id)
                        distinct)]
      (fetch-cards card-ids))))

(defn- dedupe-by-id [items]
  (->> items (group-by :id) vals (map first)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate"
  "Generate a slide deck from a prompt and optional Metabase content."
  [_route-params
   _query-params
   {:keys [prompt card_ids dashboard_ids]} :- GenerateOptions]
  (let [picked-cards    (fetch-cards card_ids)
        dashboards      (fetch-dashboards dashboard_ids)
        dashboard-cards (cards-on-dashboards dashboards)
        cards           (dedupe-by-id (concat picked-cards dashboard-cards))]
    (slides.ai/generate-deck {:prompt prompt
                              :cards cards
                              :dashboards dashboards})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/generate` routes."
  (api.macros/ns-handler *ns* +auth))
