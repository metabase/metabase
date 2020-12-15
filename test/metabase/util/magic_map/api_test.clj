(ns metabase.util.magic-map.api-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [compojure.core :as compojure :refer [GET POST]]
            [metabase
             [models :refer [User]]
             [test :as mt]]
            [metabase.api
             [common :as api]
             [routes :as api-routes]]
            metabase.util.magic-map.test-hacks
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(comment metabase.util.magic-map.test-hacks/keep-me)

(deftest json-serialization-test
  (testing "Should convert to snake_case when serializing to JSON"
    (is (= {:table_id 100}
           (-> #magic {:table-id 100}
               json/generate-string
               (json/parse-string true))))))

(api/defendpoint GET "/test/:first-name"
  [first-name last-name]
  {first-name su/NonBlankString
   last-name  su/NonBlankString}
  (repeat 2 (db/select-one User :first-name first-name, :last-name last-name)))

(api/defendpoint POST "/test"
  [:as {{:keys [first-name last-name] :as body} :body}]
  {first-name su/NonBlankString
   last-name  su/NonBlankString}
  (repeat 2 (db/select-one User :first-name first-name, :last-name last-name)))

(api/define-routes)

(deftest api-test
  (let [orig-routes api-routes/routes]
    (with-redefs [api-routes/routes (compojure/routes
                                     (compojure/context "/hacks" [] routes)
                                     orig-routes)]
      (let [Toucan {:first_name  (s/eq "Rasta")
                    :last_name   (s/eq "Toucan")
                    :common_name (s/eq "Rasta Toucan")
                    s/Keyword    s/Any}]
        (is (schema= Toucan
                     (mt/user-http-request :rasta :get "user/current")))
        (testing "Should accept lisp-case query params"
          (is (schema= [Toucan]
                       (mt/user-http-request :rasta :get "hacks/test/Rasta?last-name=Toucan"))))
        (testing "Should accept snake_case query params"
          (is (schema= [Toucan]
                       (mt/user-http-request :rasta :get "hacks/test/Rasta?last_name=Toucan"))))))))
