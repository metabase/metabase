(ns metabase.api.common.internal-test
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [compojure.core :refer [POST]]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.common.internal :as internal]
   [metabase.config :as config]
   [metabase.logger :as mb.logger]
   [metabase.plugins.classloader :as classloader]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [ring.mock.request :as ring.mock]))

(set! *warn-on-reflection* true)

(def ^:private TestAddress
  [:map
   {:title "Address"}
   [:id :string]
   [:tags [:set :keyword]]
   [:address
    [:map
     [:street :string]
     [:city :string]
     [:zip :int]
     [:lonlat [:tuple :double :double]]]]])

(def ^:private ClosedTestAddress
  (mut/closed-schema TestAddress))

(api/defendpoint POST "/post/any" [:as {body :body :as _request}]
  {:status 200 :body body})

(api/defendpoint POST "/post/id-int"
  [:as {{:keys [id] :as body} :body :as _request}]
  {id :int}
  {:status 200 :body body})

(api/defendpoint POST "/post/test-address"
  [:as {address :body :as _request}]
  {address TestAddress}
  {:status 200 :body address})

(api/defendpoint POST "/post/closed-test-address"
  [:as {address :body :as _request}]
  {address ClosedTestAddress}
  {:status 200 :body address})

(api/defendpoint POST "/test-localized-error"
  [:as {address :body :as _request}]
  {address ms/NonBlankString}
  {:status 200 :body address})

(api/defendpoint POST "/auto-coerce-pos-square/:x"
  [x]
  ;; if not for this annotation, x would continue to be a string:
  {x ms/PositiveInt}
  (* x x))

(api/defendpoint POST "/auto-coerce-string-repeater"
  [:as {body :body :as _req}]
  {body [:map
         [:str :string]
         [:n pos-int?]
         [:join [:maybe :string]]]}
  (let [{:keys [str n join]} body]
    (str/join (or join "") (repeat n str))))

(api/defendpoint POST "/auto-coerce-destructure"
  [:as {{:keys [set-of-kw]} :body :as _req}]
  {set-of-kw [:set :keyword]}
  {:pr-strd (pr-str set-of-kw)
   :api-returns set-of-kw})

(api/defendpoint POST "/closed-map-spellcheck"
  [:as {body :body :as _req}]
  {body [:map {:closed true}
         [:user-state :string]
         [:po-box [:string {:min 1 :max 10}]]
         [:archipelago :string]]}
  (let [{:keys [state po-box archipelago]} body]
    (str/join " | " [state po-box archipelago])))

(api/defendpoint POST "/accept-thing/:a" [a] {a [:re #"a.*"]} "hit route for a.")
(api/defendpoint POST "/accept-thing/:b" [b] {b [:re #"b.*"]} "hit route for b.")
(api/defendpoint POST "/accept-thing/:c" [c] {c [:re #"c.*"]} "hit route for c.")
(api/defendpoint POST "/accept-thing/:d" [d] {d [:re #"d.*"]} "hit route for d.")
(api/defendpoint POST "/accept-thing/:e" [e] {e [:re #"e.*"]} "hit route for e.")

(api/define-routes)

(defn- json-mw [handler]
  (fn [req]
    (handler
     (update req :body #(-> % slurp (json/parse-string true))))))

(defn exception-mw [handler]
  (fn [req] (try
              (handler req)
              (catch Exception e (mw.exceptions/api-exception-response e)))))

(def ^:private handler
  (json-mw (exception-mw routes)))

(defn- mock-post-request [route body]
  (->> body
       json/generate-string
       (ring.mock/request :post route)
       handler
       :body))

(deftest ^:parallel defendpoint-validation-test
  (testing "validation"
    (is (= {:a 1 :b 2} (mock-post-request "/post/any" {:a 1 :b 2})))
    (is (= {:id 1} (mock-post-request "/post/id-int" {:id 1})))
    ;; this is coercable now!
    (is (= {:id "1"} (mock-post-request "/post/id-int" {:id "1"})))))

(deftest defendpoint-validation-test-2
  (mt/with-log-level [metabase.api.common :warn]
    (is (= {:id      "myid"
            :tags    #{:abc}
            :address {:street "abc" :city "sdasd" :zip 2999 :lonlat [0.0 0.0]}}
           (mock-post-request "/post/test-address"
                              {:id      "myid"
                               :tags    ["abc"]
                               :address {:street "abc"
                                         :city   "sdasd"
                                         :zip    2999
                                         :lonlat [0.0 0.0]}})))
    (is (some (fn [{message :msg, :as entry}]
                (when (str/includes? (str message)
                                     (str "Unexpected parameters at [:post \"/post/test-address\"]: [:tags :address :id]\n"
                                          "Please add them to the schema or remove them from the API client"))
                  entry))
              (mb.logger/messages)))))

(deftest ^:parallel defendpoint-validation-test-3
  (is (= {:errors
          {:address
           "map (titled: ‘Address’) where {:id -> <string>, :tags -> <set of keyword>, :address -> <map where {:street -> <string>, :city -> <string>, :zip -> <integer>, :lonlat -> <vector with exactly 2 items of type: double, double>}>}"},
          :specific-errors
          {:address
           {:id ["missing required key, received: nil"],
            :tags ["missing required key, received: nil"],
            :address ["missing required key, received: nil"]}}}
         (mock-post-request "/post/test-address" {:x "1"}))))

(deftest ^:parallel defendpoint-validation-test-4
  (is (= {:errors
          {:address
           "map (titled: ‘Address’) where {:id -> <string>, :tags -> <set of keyword>, :address -> <map where {:street -> <string>, :city -> <string>, :zip -> <integer>, :lonlat -> <vector with exactly 2 items of type: double, double>}>}"},
          :specific-errors
          {:address
           {:id ["should be a string, received: 1288"],
            :tags ["invalid type, received: \"a,b,c\""],
            :address {:street ["missing required key, received: nil"]}}}}
         (mock-post-request "/post/test-address" {:id      1288
                                                  :tags    "a,b,c"
                                                  :address {:streeqt "abc"
                                                            :city    "sdasd"
                                                            :zip     "12342"
                                                            :lonlat  [0.0 0.0]}})))

  (is (= {:errors
          {:address
           "map (titled: ‘Address’) where {:id -> <string>, :tags -> <set of keyword>, :address -> <map where {:street -> <string>, :city -> <string>, :zip -> <integer>, :lonlat -> <vector with exactly 2 items of type: double, double>} with no other keys>} with no other keys"},
          :specific-errors
          {:address
           {:address ["missing required key, received: nil"],
            :a ["disallowed key, received: 1"],
            :b ["disallowed key, received: 2"]}}}
         (mock-post-request "/post/closed-test-address" {:id "1" :tags [] :a 1 :b 2}))))

(deftest ^:parallel defendpoint-validation-test-5
  (testing "malli schema message are localized"
    (mt/with-mock-i18n-bundles {"es" {:messages
                                      {"value must be a non-blank string."
                                       "el valor debe ser una cadena que no esté en blanco."}}}
      (mt/with-temporary-setting-values [site-locale "es"]
        (is (= {:errors {:address "el valor debe ser una cadena que no esté en blanco."},
                ;; TODO remove .'s from ms schemas
                ;; TODO translate received (?)
                :specific-errors
                {:address ["should be a string, received: {:address \"\"}"
                           "non-blank string, received: {:address \"\"}"]}}
               (mock-post-request "/test-localized-error" {:address ""})))))))

(deftest ^:parallel defendpoint-auto-coercion-test
  (testing "auto-coercion"
    (is (= 16 (mock-post-request "/auto-coerce-pos-square/4" {})))

    (testing "Does not match route, since we expected a regex matching an int:"
      (is (= nil (mock-post-request "/auto-coerce-pos-square/-4" {})))
      (is (= nil
             ;; Does not match route, since we expected a regex matching an int:
             (mock-post-request "/auto-coerce-pos-square/not-an-int" {}))))

    (is (= "chirp! chirp!"
           (mock-post-request "/auto-coerce-string-repeater" {:n 2 :str "chirp!" :join " "})))

    (is (= {:errors {:body "map where {:str -> <string>, :n -> <integer greater than 0>, :join -> <nullable string>}"}
            :specific-errors {:body {:n ["should be a positive int, received: -3"]}}}
           (mock-post-request "/auto-coerce-string-repeater"
                              {:n -3 :str "chirp!" :join " "})))

    (is (= {:errors {:body "map where {:str -> <string>, :n -> <integer greater than 0>, :join -> <nullable string>}"}
            :specific-errors {:body {:str ["should be a string, received: 123"]}}}
           (mock-post-request "/auto-coerce-string-repeater"
                              {:n 3 :str 123 :join " "})))

    (is (= {:errors {:body "map where {:str -> <string>, :n -> <integer greater than 0>, :join -> <nullable string>}"}
            :specific-errors {:body {:str ["missing required key, received: nil"],
                                     :n ["missing required key, received: nil"],
                                     :join ["missing required key, received: nil"]}}}
           (mock-post-request "/auto-coerce-string-repeater" {})))

    (is (= { ;; in the defendpoint body, it is coerced properly:
            :pr-strd "#{:c :d/e :b :a}",
            :api-returns #{:c :d/e :b :a}}
           (mock-post-request "/auto-coerce-destructure" {:set-of-kw ["a" "b" "c" "d/e"]})))

    (is (= {:errors {:set-of-kw "set of keyword"}
            :specific-errors {:set-of-kw ["invalid type, received: \"This wont work\""]}}
           (mock-post-request "/auto-coerce-destructure" {:set-of-kw "This wont work"})))

    (is (= {:errors {:set-of-kw "set of keyword"}
            :specific-errors {:set-of-kw ["invalid type, received: nil"]}}
           (mock-post-request "/auto-coerce-destructure" {})))

    (is (= {:errors
            {:body "map where {:user-state -> <string>, :po-box -> <string with length between 1 and 10 inclusive>, :archipelago -> <string>} with no other keys"},
            :specific-errors {:body {:ser-state ["should be spelled :user-state, received: \"my state\""],
                                     :o-box ["should be spelled :po-box, received: \"my po-box\""],
                                     :rchipelago ["should be spelled :archipelago, received: \"my archipelago\""]}}}
           (mock-post-request "/closed-map-spellcheck" {:ser-state "my state"
                                                        :o-box "my po-box"
                                                        :rchipelago "my archipelago"})))))

(deftest ^:parallel defendpoint-routes-test
  (testing "routes need to not be arbitrarily chosen"
    (is (= "hit route for a." (mock-post-request "/accept-thing/a123" {})))
    (is (= "hit route for b." (mock-post-request "/accept-thing/b123" {})))
    (is (= "hit route for c." (mock-post-request "/accept-thing/c123" {})))
    (is (= "hit route for d." (mock-post-request "/accept-thing/d123" {})))
    (is (= "hit route for e." (mock-post-request "/accept-thing/e123" {})))
    (is (= nil (mock-post-request "/accept-thing/f123" {})))))

(deftest ^:parallel route-fn-name-test
  (are [method route expected] (= expected
                                  (internal/route-fn-name method route))
    'GET "/"                    'GET_
    'GET "/:id/cards"           'GET_:id_cards
    ;; check that internal/route-fn-name can handle routes with regex conditions
    'GET ["/:id" :id #"[0-9]+"] 'GET_:id))

(deftest ^:parallel arg-type-test
  (are [param expected] (= expected
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
  `(binding [internal/*auto-parse-types* (m/map-vals #(update % :route-param-regex (partial str "#"))
                                                     internal/*auto-parse-types*)]
     ~@body))

(deftest ^:parallel route-param-regex-test
  (no-route-regexes
   (are [param expected] (= expected
                            (internal/route-param-regex param))
     :fish    nil
     :id      [:id "#[0-9]+"]
     :card-id [:card-id "#[0-9]+"])))

(deftest ^:parallel route-arg-keywords-test
  (no-route-regexes
   (are [route expected] (= expected
                            (internal/route-arg-keywords route))
     "/"             []
     "/:id"          [:id]
     "/:id/card"     [:id]
     "/:id/etc/:org" [:id :org]
     "/:card-id"     [:card-id])))

(deftest ^:parallel type-args-test
  (no-route-regexes
   (are [args expected] (= expected
                           (#'internal/typify-args args))
     []             []
     [:fish]        []
     [:fish :fry]   []
     [:id]          [:id "#[0-9]+"]
     [:id :fish]    [:id "#[0-9]+"]
     [:id :card-id] [:id "#[0-9]+" :card-id "#[0-9]+"])))

(deftest ^:parallel add-route-param-schema-test
  (are [route expected] (= expected
                           (let [result (internal/add-route-param-schema
                                         {'id ms/PositiveInt
                                          'card-id ms/PositiveInt
                                          'crazy-id ms/PositiveInt
                                          'uuid ms/UUIDString}
                                         route)]
                             (cond (string? result) result
                                   (coll? result) (mapv
                                                   (fn [x] (if (= (type x) java.util.regex.Pattern)
                                                             (str "#" x)
                                                             x))
                                                   result))))
    "/"                                    "/"
    "/:id"                                 ["/:id" :id "#[0-9]+"]
    "/:id/card"                            ["/:id/card" :id "#[0-9]+"]
    "/:card-id"                            ["/:card-id" :card-id "#[0-9]+"]
    "/:fish"                               "/:fish"
    "/:id/tables/:card-id"                 ["/:id/tables/:card-id" :id "#[0-9]+" :card-id "#[0-9]+"]
    ;; don't try to typify route that's already typified
    ["/:id/:crazy-id" :crazy-id "#[0-9]+"] ["/:id/:crazy-id" :crazy-id "#[0-9]+"]
    ;; Check :uuid args
    "/:uuid/toucans"                       ["/:uuid/toucans" :uuid (str \# u/uuid-regex)]
    "/:id/:card-id"                        ["/:id/:card-id" :id "#[0-9]+" :card-id "#[0-9]+"]
    "/:unlisted/:card-id"                  ["/:unlisted/:card-id" :card-id "#[0-9]+"]))

(deftest ^:parallel add-route-param-regexes-test
  (no-route-regexes
   (are [route expected] (= expected
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

(deftest ^:parallel let-form-for-arg-test
  (are [arg expected] (= expected
                         (internal/let-form-for-arg arg))
    'id           '[id (clojure.core/when id (metabase.api.common.internal/parse-int id))]
    'org_id       '[org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))]
    'fish         nil
    ;; make sure we don't try to generate let forms for any fancy destructuring
    :as           nil
    '{body :body} nil))

(deftest ^:parallel auto-parse-test
  (are [args expected] (= expected
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

(deftest ^:parallel enterprise-endpoint-name-test
  (when config/ee-available?
    (testing "Make sure the route name for enterprise API endpoints is somewhat correct"
      (classloader/require 'metabase-enterprise.advanced-permissions.api.application)
      (is (= "GET /api/ee/advanced-permissions/application/graph"
             (#'internal/endpoint-name (the-ns 'metabase-enterprise.advanced-permissions.api.application)
                                       'GET
                                       "/graph"))))))
