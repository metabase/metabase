(ns metabase-enterprise.metabot-v3.tools.change-column-settings
  (:require [metabase-enterprise.metabot-v3.tools.registry :refer [deftool]]))

(deftool change-column-settings
  :applicable? #(contains? (some-> % :current_visualization_settings) :column_settings))
