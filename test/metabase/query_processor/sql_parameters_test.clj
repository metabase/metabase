(ns metabase.query-processor.sql-parameters-test
  (:require [expectations :refer :all]
            [metabase.query-processor.sql-parameters :refer :all]))


;;; simple substitution -- {{x}}

(expect "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    {:toucans_are_cool true}))

(expect AssertionError
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}}"
    nil))

(expect "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {:toucans_are_cool true, :bird_type "toucan"}))

(expect AssertionError
  (substitute "SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
    {:toucans_are_cool true}))


;;; optional substitution -- [[ ... {{x}} ... ]]

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool }}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool }}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{ toucans_are_cool}}]]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool_2}}]]"
    {:toucans_are_cool_2 true}))

(expect
  "SELECT * FROM bird_facts WHERE toucans_are_cool = TRUE AND bird_type = 'toucan'"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = 'toucan']]"
    {:toucans_are_cool true}))

(expect
  "SELECT * FROM bird_facts"
  (substitute "SELECT * FROM bird_facts [[WHERE toucans_are_cool = {{toucans_are_cool}}]]"
    nil))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > NULL"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans nil}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > TRUE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans true}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > FALSE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans false}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 'abc'"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans "abc"}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 'yo\\' mama'"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    {:num_toucans "yo' mama"}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
    nil))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 2 AND total_birds > 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 2, :total_birds 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE  AND total_birds > 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:total_birds 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 3"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 3}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    nil))

(expect
  "SELECT * FROM toucanneries WHERE bird_type = 'toucan' AND num_toucans > 2 AND total_birds > 5"
  (substitute "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:bird_type "toucan", :num_toucans 2, :total_birds 5}))

(expect
  AssertionError
  (substitute "SELECT * FROM toucanneries WHERE bird_type = {{bird_type}} [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
    {:num_toucans 2, :total_birds 5}))

(expect
  "SELECT * FROM toucanneries WHERE TRUE AND num_toucans > 5 AND num_toucans < 5"
  (substitute "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND num_toucans < {{num_toucans}}]]"
    {:num_toucans 5}))


;;; ------------------------------------------------------------ end-to-end tests ------------------------------------------------------------

;; unspecified optional param
(expect
  "SELECT * FROM orders ;"
  (-> (expand-params {:native        {:query "SELECT * FROM orders [[WHERE id = {{id}}]];"}
                      :template_tags {:id {:name "id", :display_name "ID", :type "number"}}
                      :parameters    []})
      :native :query))

;; unspecified *required* param
(expect
  Exception
  (expand-params {:native        {:query "SELECT * FROM orders [[WHERE id = {{id}}]];"}
                  :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true}}
                  :parameters    []}))

;; default value
(expect
  "SELECT * FROM orders WHERE id = '100';"
  (-> (expand-params {:native        {:query "SELECT * FROM orders WHERE id = {{id}};"}
                      :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}}
                      :parameters    []})
      :native :query))

;; specified param (numbers)
(expect
  "SELECT * FROM orders WHERE id = '2';"
  (-> (expand-params {:native        {:query "SELECT * FROM orders WHERE id = {{id}};"}
                      :template_tags {:id {:name "id", :display_name "ID", :type "number", :required true, :default "100"}}
                      :parameters    [{:type "category", :target ["variable" ["template-tag" "id"]], :value "2"}]})
      :native :query))

;; specified param (date)
(expect
  "SELECT * FROM orders WHERE created_at > '2016-07-19';"
  (-> (expand-params {:native        {:query "SELECT * FROM orders WHERE created_at > {{created_at}};"}
                      :template_tags {:created_at {:name "created_at", :display_name "Created At", :type "date"}}
                      :parameters    [{:type "date/single", :target ["variable" ["template-tag" "created_at"]], :value "2016-07-19"}]})
      :native :query))

;; specified param (text)
(expect
  "SELECT * FROM products WHERE category = 'Gizmo';"
  (-> (expand-params {:native        {:query "SELECT * FROM products WHERE category = {{category}};"},
                      :template_tags {:category {:name "category", :display_name "Category", :type "text"}},
                      :parameters    [{:type "category", :target ["variable" ["template-tag" "category"]], :value "Gizmo"}],})
      :native :query))

;; dimension
(expect
  "SELECT * FROM checkins WHERE \"PUBLIC\".\"CHECKINS\".\"DATE\" > '2016-01-01';"
  (-> (expand-params {:driver        (metabase.driver/engine->driver :h2)
                      :native        {:query "SELECT * FROM checkins WHERE {{date}} > '2016-01-01';"},
                      :template_tags {:date {:name "date", :display_name "Checkin Date", :type "dimension", :dimension ["field-id" (metabase.test.data/id :checkins :date)]}},
                      :parameters    []})
      :native :query))
