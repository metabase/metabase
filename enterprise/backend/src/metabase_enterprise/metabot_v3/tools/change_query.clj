(ns metabase-enterprise.metabot-v3.tools.change-query
  (:require [metabase-enterprise.metabot-v3.tools.registry :refer [deftool]]))

(deftool change-query
  :applicable? #(some? (:current_query %)))
