(ns metabase.api.search
  "/api/search endpoints."
  (:require [clojure.math.numeric-tower :as math]
            [compojure.core :refer [GET POST]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]]
                             [field :refer [Field]]
                             [dashboard :refer [Dashboard]]
                             [database :refer [Database]]
                             [org :refer [Org]]
                             [table :refer [Table]])))

(def search-choices
  "Different things that can be searched for.
   TODO: Foreign Key, Query"
  {:card      {:name "Card"
               :plural-name "Cards"
               :entity Card
               :url-prefix "card/"}
   :dashboard {:name "Dashboard"
               :plural-name "Dashboards"
               :entity Dashboard
               :url-prefix "dash/"}
   :database  {:name "Database"
               :plural-name "Databases"
               :entity Database
               :url-prefix "admin/databases/"}
   :field     {:name "Field"
               :plural-name "Fields"
               :entity Field
               :url-prefix "admin/datasets/field/"}
   :table     {:name "Table"
               :plural-name "Tables"
               :entity Table
               :url-prefix "explore/table/"}})

(defn get-search-results
  "Get search results for a given MODEL choice.

    (get-search-results \"main_\" :table)"
  [query {:keys [entity url-prefix] :as model}]
  (->> (sel :many [entity :name :description :id] :name [like (str "%" query "%")])
       (map (fn [{:keys [name description id]}]
              {:display_type (:name model)
               :name name
               :description description
               :url (str url-prefix id)}))))

(defn results-for-models
  "Given a set of search-choices MODELS, get matching search results for QUERY.

    (results-for-models #{:card :dashboard} \"guides\")"
  [models query]
  (mapcat (partial get-search-results query)
          models))

;; primary search endpoint
(defendpoint POST "/" [:as {{:keys [org page results_per_page load_all q models]
                             :org {page 1
                                   results_per_page 10}} :body}]
  (let [models (if (empty? models) (vals search-choices)         ; if search-choices is unspecified default to all choices
                   (->> models                                   ; otherwise get corresponding model-choice maps
                        (map keyword)
                        (map search-choices)))
        results (results-for-models models q)
        offset (* results_per_page (- page 1))
        num-results (count results)
        num-pages (math/ceil (/ num-results results_per_page))
        page-results (->> results
                          (drop offset)
                          (take results_per_page))]
    {:results page-results
     :page {:num_results num-results
            :has_next (< page num-pages)
            :has_previous (> page 1)
            :num_results_per_page results_per_page
            :page_number page
            :num_pages num-pages
            :start_index (+ 1 offset)
            :end_index (+ offset (count page-results))}}))

;; return map of available search choices -> plural name like `{:table "Tables"}`
(defendpoint GET "/model_choices" [org]
  {:choices {:metabase (->> search-choices
                            (map (fn [[choice {:keys [plural-name]}]]
                                   {choice plural-name}))
                            (reduce merge))}})

(define-routes)
