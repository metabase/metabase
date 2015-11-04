(ns metabase.models.pulse-card
  (:require [korma.core :as k]
            [metabase.models.interface :refer :all]))

(defentity PulseCard
  [(k/table :pulse_card)])
