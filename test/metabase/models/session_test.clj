(ns metabase.models.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.session :as session :refer [Session]]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

  ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
  ;; the way we'd expect :/
(defn- new-session []
  (try
    (first (t2/insert-returning-instances! Session {:id (str test-uuid), :user_id (mt/user->id :trashbird)}))
    (finally
      (t2/delete! Session :id (str test-uuid)))))

(deftest new-session-include-test-test
  (testing "when creating a new Session, it should come back with an added `:type` key"
    (is (=? {:id              "092797dd-a82a-4748-b393-697d7bb9ab65"
             :user_id         (mt/user->id :trashbird)
             :anti_csrf_token nil
             :type            :normal}
            (new-session)))))

(deftest embedding-test
  (testing "if request is an embedding request, we should get ourselves an embedded Session"
    (binding [mw.misc/*request* {:headers {"x-metabase-embedded" "true"}}]
      (with-redefs [session/random-anti-csrf-token (constantly "315c1279c6f9f873bf1face7afeee420")]
        (is (=? {:id              "092797dd-a82a-4748-b393-697d7bb9ab65"
                 :user_id         (mt/user->id :trashbird)
                 :anti_csrf_token "315c1279c6f9f873bf1face7afeee420"
                 :type            :full-app-embed}
                (new-session)))))))
