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

(defn- load-cards
  "Fetch the requested cards the current user can read. Silently drops cards
   the user lacks permissions for — the LLM only sees what's allowed."
  [card-ids]
  (when (seq card-ids)
    (->> (t2/select [:model/Card :id :name :description :display :collection_id]
                    :id [:in card-ids] :archived false)
         (filter (fn [card] (try (api/read-check card) true (catch Exception _ false)))))))

(defn- load-dashboards
  [dashboard-ids]
  (when (seq dashboard-ids)
    (->> (t2/select [:model/Dashboard :id :name :description :collection_id]
                    :id [:in dashboard-ids] :archived false)
         (filter (fn [dash] (try (api/read-check dash) true (catch Exception _ false)))))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/generate"
  "Generate a slide deck from a prompt and optional Metabase content."
  [_route-params
   _query-params
   {:keys [prompt card_ids dashboard_ids]} :- GenerateOptions]
  (let [cards      (load-cards card_ids)
        dashboards (load-dashboards dashboard_ids)]
    (slides.ai/generate-deck {:prompt prompt
                              :cards cards
                              :dashboards dashboards})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/slides/generate` routes."
  (api.macros/ns-handler *ns* +auth))
