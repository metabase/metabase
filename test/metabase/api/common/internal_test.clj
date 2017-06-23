(ns metabase.api.common.internal-test
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.api.common.internal :refer :all]
            [metabase.util :as u]))

;;; TESTS FOR ROUTE-FN-NAME

(expect 'GET_
  (route-fn-name 'GET "/"))

(expect 'GET_:id_cards
  (route-fn-name 'GET "/:id/cards"))

;; check that route-fn-name can handle routes with regex conditions
(expect 'GET_:id
  (route-fn-name 'GET ["/:id" :id #"[0-9]+"]))

;;; TESTS FOR ARG-TYPE

(expect nil
  (arg-type :fish))

(expect :int
  (arg-type :id))

(expect :int
  (arg-type :card-id))


;;; TESTS FOR ROUTE-PARAM-REGEX

;; expectations (internally, `clojure.data/diff`) doesn't think two regexes with the same exact pattern are equal.
;; so in order to make sure we're getting back the right output we'll just change them to strings, e.g. `#"[0-9]+" -> "#[0-9]+"`
(defmacro no-regex [& body]
  `(binding [*auto-parse-types* (m/map-vals #(update % :route-param-regex (partial str "#"))
                                            *auto-parse-types*) ]
     ~@body))

(expect nil
  (no-regex (route-param-regex :fish)))

(expect [:id "#[0-9]+"]
  (no-regex (route-param-regex :id)))

(expect [:card-id "#[0-9]+"]
  (no-regex (route-param-regex :card-id)))


;;; TESTS FOR ROUTE-ARG-KEYWORDS

(expect []
  (no-regex (route-arg-keywords "/")))

(expect [:id]
  (no-regex (route-arg-keywords "/:id")))

(expect [:id]
  (no-regex (route-arg-keywords "/:id/card")))

(expect [:id :org]
  (no-regex (route-arg-keywords "/:id/etc/:org")))

(expect [:card-id]
  (no-regex (route-arg-keywords "/:card-id")))


;;; TESTS FOR TYPE-ARGS

(expect []
  (no-regex (typify-args [])))

(expect []
  (no-regex (typify-args [:fish])))

(expect []
  (no-regex (typify-args [:fish :fry])))

(expect [:id "#[0-9]+"]
  (no-regex (typify-args [:id])))

(expect [:id "#[0-9]+"]
  (no-regex (typify-args [:id :fish])))

(expect [:id "#[0-9]+" :card-id "#[0-9]+"]
  (no-regex (typify-args [:id :card-id])))


;;; TESTS FOR TYPE-ROUTE

(expect "/"
  (no-regex (typify-route "/")))

(expect ["/:id" :id "#[0-9]+"]
  (no-regex (typify-route "/:id")))

(expect ["/:id/card" :id "#[0-9]+"]
  (no-regex (typify-route "/:id/card")))

(expect ["/:card-id" :card-id "#[0-9]+"]
  (no-regex (typify-route "/:card-id")))

(expect "/:fish"
  (no-regex (typify-route "/:fish")))

(expect ["/:id/tables/:card-id" :id "#[0-9]+" :card-id "#[0-9]+"]
  (no-regex (typify-route "/:id/tables/:card-id")))

;; don't try to typify route that's already typified
(expect ["/:id/:crazy-id" :crazy-id "#[0-9]+"]
  (no-regex (typify-route ["/:id/:crazy-id" :crazy-id "#[0-9]+"])))

;; Check :uuid args
(expect ["/:uuid/toucans" :uuid (str \# u/uuid-regex)]
  (no-regex (typify-route "/:uuid/toucans")))


;; TESTS FOR LET-FORM-FOR-ARG

(expect '[id (clojure.core/when id (metabase.api.common.internal/parse-int id))]
  (let-form-for-arg 'id))

(expect '[org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))]
  (let-form-for-arg 'org_id))

(expect nil
  (let-form-for-arg 'fish))

;; make sure we don't try to generate let forms for any fancy destructuring
(expect nil
  (let-form-for-arg :as))

(expect nil
  (let-form-for-arg '{body :body}))

;; Tests for AUTO-PARSE presently live in `metabase.api.common-test`
