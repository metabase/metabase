(ns metabase.dashboards.autoplace
  "NOTE: It's not SUPER high impact if it falls out of sync - hopefully both will place things in a reasonable spot - but
  ideally this namespace should be kept in sync with
  [the frontend version](https://github.com/metabase/metabase/blob/master/frontend/src/metabase/lib/dashboard_grid.js)."
  (:require
   [metabase.dashboards.constants :as dashboard.constants]))

(def ^:constant default-grid-width
  "The default grid width."
  dashboard.constants/grid-width)

(defn- intersects? [a b]
  (not (or
        (>= (:col b) (+ (:col a) (:size_x a)))
        (<= (+ (:col b) (:size_x b)) (:col a))
        (>= (:row b) (+ (:row a) (:size_y a)))
        (<= (+ (:row b) (:size_y b)) (:row a)))))

(defn- intersects-with-any-card? [cards position]
  (boolean (some #(intersects? position %) cards)))

(defn get-position-for-new-dashcard
  "Where should a new card be placed on a tab, given the existing dashcards?

  NOTE: almost identical in behavior to `getPositionForNewDashCard` in
  https://github.com/metabase/metabase/blob/master/frontend/src/metabase/lib/dashboard_grid.js

  If you make changes here, we should keep the frontend version in sync.

  There are two differences, both unlikely to matter:

  - in the case where we couldn't find any position at all (there is no space at all in 1000 rows) this will return
  `nil`, which will result in an error bubbling up. This should never happen, but something to call out.

  - this includes a `dashboard_tab_id` in the returned value (which may be `nil`). This is just to make it a bit
  easier for the caller.
  "
  ([cards display-type]
   (let [{:keys [width height]} (:default (get dashboard.constants/card-size-defaults display-type))]
     (get-position-for-new-dashcard cards
                                    width
                                    height
                                    default-grid-width)))
  ([cards size-x size-y grid-width]
   (let [dashboard-tab-id (:dashboard_tab_id (first cards))]
     (first
      (for [row (range 1000)
            col (range (inc (- grid-width size-x)))
            :let [this-card {:col col
                             :row row
                             :size_x size-x
                             :size_y size-y
                             :dashboard_tab_id dashboard-tab-id}]
            :when (not (intersects-with-any-card? cards this-card))]
        this-card)))))
