(ns metabase.api.common.internal-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.api.common.internal :as internal :refer :all]))

(deftest route-fn-name-test
  (mt/are+ [method route expected] (= expected
                                      (internal/route-fn-name method route))
    'GET "/"                    'GET_
    'GET "/:id/cards"           'GET_:id_cards
    ;; check that internal/route-fn-name can handle routes with regex conditions
    'GET ["/:id" :id #"[0-9]+"] 'GET_:id))

(deftest arg-type-test
  (mt/are+ [param expected] (= expected
                               (internal/arg-type param))
    :fish    nil
    :id      :int
    :card-id :int))

(defmacro ^:private no-route-regexes
  "`clojure.data/diff` doesn't think two regexes with the same exact pattern are equal. so in order to make sure we're
  getting back the right output we'll just change them to strings, e.g.

    #\"[0-9]+\" -> \"#[0-9]+\""
  {:style/indent 0}
  [& body]
  `(binding [*auto-parse-types* (m/map-vals #(update % :route-param-regex (partial str "#"))
                                            *auto-parse-types*)]
     ~@body))

(deftest route-param-regex-test
  (no-route-regexes
    (mt/are+ [param expected] (= expected
                                 (internal/route-param-regex param))
      :fish    nil
      :id      [:id "#[0-9]+"]
      :card-id [:card-id "#[0-9]+"])))

(deftest route-arg-keywords-test
  (no-route-regexes
    (mt/are+ [route expected] (= expected
                                 (internal/route-arg-keywords route))
      "/"             []
      "/:id"          [:id]
      "/:id/card"     [:id]
      "/:id/etc/:org" [:id :org]
      "/:card-id"     [:card-id])))

(deftest type-args-test
  (no-route-regexes
    (mt/are+ [args expected] (= expected
                                (#'internal/typify-args args))
      []             []
      [:fish]        []
      [:fish :fry]   []
      [:id]          [:id "#[0-9]+"]
      [:id :fish]    [:id "#[0-9]+"]
      [:id :card-id] [:id "#[0-9]+" :card-id "#[0-9]+"])))

(deftest add-route-param-regexes-test
  (no-route-regexes
    (mt/are+ [route expected] (= expected
                                 (internal/add-route-param-regexes route))
      "/"                                    "/"
      "/:id"                                 ["/:id" :id "#[0-9]+"]
      "/:id/card"                            ["/:id/card" :id "#[0-9]+"]
      "/:card-id"                            ["/:card-id" :card-id "#[0-9]+"]
      "/:fish"                               "/:fish"
      "/:id/tables/:card-id"                 ["/:id/tables/:card-id" :id "#[0-9]+" :card-id "#[0-9]+"]
      ;; don't try to typify route that's already typified
      ["/:id/:crazy-id" :crazy-id "#[0-9]+"] ["/:id/:crazy-id" :crazy-id "#[0-9]+"]
      ;; Check :uuid args
      "/:uuid/toucans"                       ["/:uuid/toucans" :uuid (str \# u/uuid-regex)])))

(deftest let-form-for-arg-test
  (mt/are+ [arg expected] (= expected
                             (internal/let-form-for-arg arg))
    'id           '[id (clojure.core/when id (metabase.api.common.internal/parse-int id))]
    'org_id       '[org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))]
    'fish         nil
    ;; make sure we don't try to generate let forms for any fancy destructuring
    :as           nil
    '{body :body} nil))

(deftest auto-parse-test
  (mt/are+ [args expected] (= expected
                              (macroexpand-1 `(internal/auto-parse ~args '~'body)))
    ;; when auto-parse gets an args form where arg is present in *autoparse-types*
    ;; the appropriate let binding should be generated
    '[id]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)

    ;; params not in *autoparse-types* should be ignored
    '[id some-other-param]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)

    ;; make sure multiple autoparse params work correctly
    '[id org_id]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))
                       org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))] 'body)

    ;; make sure it still works if no autoparse params are passed
    '[some-other-param]
    '(clojure.core/let [] 'body)

    ;; should work with no params at all
    '[]
    '(clojure.core/let [] 'body)

    ;; should work with some wacky binding form
    '[id :as {body :body}]
    '(clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)))
