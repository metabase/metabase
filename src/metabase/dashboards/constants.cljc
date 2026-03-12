(ns metabase.dashboards.constants)

(def grid-width
  "Default width of a dashboard"
  24)

(def card-size-defaults
  "Default card sizes per visualization type"
  {:table       {:min {:width 4 :height 3} :default {:width 12 :height 9}}
   :list        {:min {:width 12 :height 6} :default {:width 12 :height 9}}
   :gauge       {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :bar         {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :pie         {:min {:width 4 :height 3} :default {:width 12 :height 8}}
   :scatter     {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :boxplot     {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :waterfall   {:min {:width 4 :height 3} :default {:width 14 :height 6}}
   :combo       {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :sankey      {:min {:width 4 :height 3} :default {:width 16 :height 10}}
   :scalar      {:min {:width 2 :height 2} :default {:width 6 :height 3}}
   :line        {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :link        {:min {:width 1 :height 1} :default {:width 8 :height 1}}
   :iframe      {:min {:width 4 :height 3} :default {:width 12 :height 8}}
   :action      {:min {:width 1 :height 1} :default {:width 4 :height 1}}
   :area        {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :pivot       {:min {:width 4 :height 3} :default {:width 12 :height 9}}
   :funnel      {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :progress    {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :smartscalar {:min {:width 2 :height 2} :default {:width 6 :height 3}}
   :map         {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :object      {:min {:width 4 :height 3} :default {:width 12 :height 9}}
   :row         {:min {:width 4 :height 3} :default {:width 12 :height 6}}
   :heading     {:min {:width 1 :height 1} :default {:width grid-width :height 1}}
   :text        {:min {:width 1 :height 1} :default {:width 12 :height 3}}})

#?(:cljs (def ^:export CARD_SIZE_DEFAULTS_JSON
           "Default card sizes per visualization type as a json object suitable for the FE"
           (clj->js card-size-defaults)))
