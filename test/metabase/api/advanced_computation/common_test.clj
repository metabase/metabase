(ns metabase.api.advanced-computation.common-test
  (:require [metabase.models :refer [Card Dashboard DashboardCard]]
            [metabase.test :as mt])
  (:import java.util.UUID))

;; Redshift takes A LONG TIME to insert the sample-dataset, so do not
;; run these tests against Redshift (for now?)
;;TODO: refactor Redshift testing to support a bulk COPY or something
;; other than INSERT INTO statements
(def applicable-drivers
  "Drivers that these pivot table tests should run on"
  (disj (mt/normal-drivers-with-feature :expressions :left-join) :redshift))

(defn pivot-query
  "A basic pivot table query"
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count] [:sum $orders.quantity]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]
                       [:fk-> $orders.product_id $products.category]]})
      (assoc :pivot_rows [1 0]
             :pivot_cols [2])))

(defn filters-query
  "A pivot table query with a filter applied"
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]]
         :filter      [:and [:= [:fk-> $orders.user_id $people.source] "Google" "Organic"]]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn parameters-query
  "A pivot table query with parameters"
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]]
         :filter      [:and [:= [:fk-> $orders.user_id $people.source] "Google" "Organic"]]
         :parameters  [{:type   "category"
                        :target [:dimension [:fk-> $orders.product_id $products.category]]
                        :value  "Gadget"}]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn pivot-card
  "A dashboard card query with a pivot table"
  []
  {:dataset_query (pivot-query)})

(defn shared-obj
  "basic fields for a shared object"
  []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(defn do-with-temp-pivot-card
  {:style/indent 0}
  [f]
  (mt/with-temp* [Card [card  {:dataset_query (pivot-query)}]]
    (f (mt/db) card)))

(defmacro with-temp-pivot-card
  "A macro to create a pivot table card and put it in scope"
  {:style/indent 1}
  [[db-binding card-binding] & body]
  `(do-with-temp-pivot-card (fn [~(or db-binding '_) ~(or card-binding '_)]
                              ~@body)))

(defmacro with-temp-pivot-public-card
  "A macro to create a pivot table public card and put it in scope"
  {:style/indent 1}
  [[binding & [card]] & body]
  `(let [card-settings# (merge (pivot-card) (shared-obj) ~card)]
     (mt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(defmacro with-temp-card
  "A macro that creates a temporary card with a pivot query and puts it in scope"
  {:style/indent 1}
  [[card-binding & [card]] & body]
  `(mt/with-temp Card [~card-binding (merge (pivot-card) ~card)]
     ~@body))

(defmacro with-temp-dashcard
  "A macro that creates a temporary dashboard card with a pivot query and puts it in scope"
  {:style/indent 1}
  [[dashcard-binding {:keys [dash card dashcard]}] & body]
  `(with-temp-card [card# ~card]
     (mt/with-temp* [Dashboard     [dash# ~dash]
                     DashboardCard [~dashcard-binding (merge {:card_id      (u/get-id card#)
                                                              :dashboard_id (u/get-id dash#)}
                                                             ~dashcard)]]
       ~@body)))
