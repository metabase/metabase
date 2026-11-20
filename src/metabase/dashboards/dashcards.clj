(ns metabase.dashboards.dashcards
  "Reads of DashboardCards that the rendering of dashboards and their notifications needs, apart from the model
  namespaces, which load the write functions of the module."
  (:require
   [metabase.dashboards.db :as dashboards.db]))

(set! *warn-on-reflection* true)

(defn dashcard->multi-cards
  "Return the cards which have been added to this dashcard using the 'add series' dashboard feature.

  Dashboards allow Line, Area, and Bar dashcards to have other questions (series) added to them
  so that several Questions are displayed in a single dashcard.

  It's important to know that this is different from the combo display,
  which is its own visualization type for Questions.

  This is also different from having multiple series displayed on Line, Area, or Bar Questions."
  [dashcard]
  (dashboards.db/multi-cards-for-dashcard (:id dashcard)))

(defn link-card-entities
  "The instances of the link-card `model` (a string like \"card\" or \"table\") with integer `ids`."
  [model ids]
  (dashboards.db/link-card-entities model ids))

(defn dashcard-comparator
  "Comparator that determines which of two dashcards comes first in the layout order used for pulses.
  This is the same order used on the frontend for the mobile layout. Orders cards left-to-right, then top-to-bottom"
  [{row-1 :row col-1 :col} {row-2 :row col-2 :col}]
  (if (= row-1 row-2)
    (compare col-1 col-2)
    (compare row-1 row-2)))
