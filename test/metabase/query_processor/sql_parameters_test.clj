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
