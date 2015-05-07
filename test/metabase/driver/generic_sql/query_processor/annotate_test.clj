(ns metabase.driver.generic-sql.query-processor.annotate-test
  (:require [expectations :refer :all]
            [metabase.driver.generic-sql.query-processor.annotate :refer :all]
            [metabase.driver.query-processor :as qp]
            [metabase.test.util :refer [resolve-private-fns]]))

(resolve-private-fns metabase.driver.generic-sql.query-processor.annotate uncastify)

(defn -order-columns [& args]
  (binding [qp/*uncastify-fn* uncastify]
    (apply qp/-order-columns args)))

;; ## TESTS FOR -ORDER-COLUMNS

(def ^:const ^:private mock-fields
  [{:position 0, :name "id", :id 224}
   {:position 1, :name "name", :id 341}
   {:position 2, :name "author_name", :id 453}
   {:position 3, :name "allows_suggestions", :id 433}
   {:position 4, :name "author_url", :id 455}
   {:position 5, :name "content_creator_id", :id 446}
   {:position 6, :name "created_at", :id 263}
   {:position 7, :name "description", :id 375}
   {:position 8, :name "external_url", :id 424}
   {:position 9, :name "updated_at", :id 284}])

(def ^:const ^:private mock-castified-field-names
  [:allows_suggestions
   :description
   :author_url
   :name
   (keyword "CAST(updated_at AS DATE)")
   :id
   :author_name
   :external_url
   :content_creator_id
   (keyword "CAST(created_at AS DATE)")])

;; Check that `Field.order` is respected. No breakout fields
(expect [:id
         :name
         :author_name
         :allows_suggestions
         :author_url
         :content_creator_id
         (keyword "CAST(created_at AS DATE)")
         :description
         :external_url
         (keyword "CAST(updated_at AS DATE)")]
  (-order-columns mock-fields [] []  mock-castified-field-names))

;; Check that breakout fields are returned first, in order, before other fields
(expect [:description
         :allows_suggestions
         :id
         :name
         :author_name
         :author_url
         :content_creator_id
         (keyword "CAST(created_at AS DATE)")
         :external_url
         (keyword "CAST(updated_at AS DATE)")]
  (-order-columns mock-fields [375 433] [] mock-castified-field-names))

;; Check that aggregate fields are returned ahead of other fields
(expect [:allows_suggestions
         :description
         :count
         :id
         :name
         :author_name
         :author_url
         :content_creator_id
         (keyword "CAST(created_at AS DATE)")
         :external_url
         (keyword "CAST(updated_at AS DATE)")]
  (-order-columns mock-fields [433 375] []  (concat [:count] mock-castified-field-names)))
