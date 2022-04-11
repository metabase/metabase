(ns metabase.driver.common.parameters.parse-test
  (:require [clojure.test :refer :all]
            [metabase.driver.common.parameters.parse :as parse]))

(def ^:private ^{:arglists '([field-name])} param    (var-get #'parse/param))
(def ^:private ^{:arglists '([& args])}     optional (var-get #'parse/optional))

(deftest tokenize-test
  (doseq [[query expected]
          {"{{num_toucans}}"
           [:param-begin "num_toucans" :param-end]

           "[[AND num_toucans > {{num_toucans}}]]"
           [:optional-begin "AND num_toucans > " :param-begin "num_toucans" :param-end :optional-end]

           "}}{{]][["
           [:param-end :param-begin :optional-end :optional-begin]

           "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]]"
           ["SELECT * FROM toucanneries WHERE TRUE " :optional-begin "AND num_toucans > " :param-begin "num_toucans" :param-end :optional-end]

           "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
           ["SELECT * FROM toucanneries WHERE TRUE " :optional-begin "AND num_toucans > " :param-begin "num_toucans" :param-end :optional-end
            " " :optional-begin "AND total_birds > " :param-begin "total_birds" :param-end :optional-end]}]
    (is (= expected
           (#'parse/tokenize query))
        (format "%s should get tokenized to %s" (pr-str query) (pr-str expected)))))

(deftest parse-test
  (doseq [[group s->expected]
          {"queries with one param"
           {"select * from foo where bar=1"              ["select * from foo where bar=1"]
            "select * from foo where bar={{baz}}"        ["select * from foo where bar=" (param "baz")]
            "select * from foo [[where bar = {{baz}} ]]" ["select * from foo " (optional "where bar = " (param "baz") " ")]}

           "multiple params"
           {"SELECT * FROM bird_facts WHERE toucans_are_cool = {{toucans_are_cool}} AND bird_type = {{bird_type}}"
            ["SELECT * FROM bird_facts WHERE toucans_are_cool = " (param "toucans_are_cool")
             " AND bird_type = " (param "bird_type")]}

           "Multiple optional clauses"
           {(str "select * from foo where bar1 = {{baz}} "
                 "[[and bar2 = {{baz}}]] "
                 "[[and bar3 = {{baz}}]] "
                 "[[and bar4 = {{baz}}]]")
            ["select * from foo where bar1 = " (param "baz") " "
             (optional "and bar2 = " (param "baz")) " "
             (optional "and bar3 = " (param "baz")) " "
             (optional "and bar4 = " (param "baz"))]

            "SELECT * FROM toucanneries WHERE TRUE [[AND num_toucans > {{num_toucans}}]] [[AND total_birds > {{total_birds}}]]"
            ["SELECT * FROM toucanneries WHERE TRUE "
             (optional "AND num_toucans > " (param "num_toucans"))
             " "
             (optional "AND total_birds > " (param "total_birds"))]

            "select * from foobars [[ where foobars.id in (string_to_array({{foobar_id}}, ',')::integer[]) ]]"
            ["select * from foobars "
             (optional " where foobars.id in (string_to_array(" (param "foobar_id") ", ',')::integer[]) ")]}

           "single square brackets shouldn't get parsed"
           (let [query (str "SELECT [test_data.checkins.venue_id] AS [venue_id], "
                            "       [test_data.checkins.user_id] AS [user_id], "
                            "       [test_data.checkins.id] AS [checkins_id] "
                            "FROM [test_data.checkins] "
                            "LIMIT 2")]
             {query [query]})

           "Valid syntax in PG -- shouldn't get parsed"
           (let [query "SELECT array_dims(1 || '[0:1]={2,3}'::int[])"]
             {query [query]})

           "Queries with newlines (#11526)"
           {"SELECT count(*)\nFROM products\nWHERE category = {{category}}"
            ["SELECT count(*)\nFROM products\nWHERE category = " (param "category")]}

           "JSON queries that contain non-param fragments like '}}'"
           {"{x: {y: \"{{param}}\"}}"         ["{x: {y: \"" (param "param") "\"}}"]
            "{$match: {{{date}}, field: 1}}}" ["{$match: {" (param "date") ", field: 1}}}"]}}]
    (testing group
      (doseq [[s expected] s->expected]
        (is (= expected
               (parse/parse s))
            (format "%s should get parsed to %s" (pr-str s) (pr-str expected))))))

  (testing "Testing that invalid/unterminated template params/clauses throw an exception"
    (doseq [invalid ["select * from foo [[where bar = {{baz}} "
                     "select * from foo [[where bar = {{baz]]"
                     "select * from foo {{bar}} {{baz"
                     "select * from foo [[clause 1 {{bar}}]] [[clause 2"]]
      (is (thrown? clojure.lang.ExceptionInfo
                   (parse/parse invalid))
          (format "Parsing %s should throw an exception" (pr-str invalid))))))
