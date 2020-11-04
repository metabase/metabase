(ns metabase.models.session-test
  (:require [expectations :refer [expect]]
            [metabase.middleware.misc :as mw.misc]
            [metabase.models.session :as session :refer [Session]]
            [metabase.test.data.users :as test-users]
            [toucan
             [db :as db]
             [models :as t.models]]))

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

  ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
  ;; the way we'd expect :/
(defn- new-session []
  (try
    (db/insert! Session {:id (str test-uuid), :user_id (test-users/user->id :trashbird)})
    (-> (Session (str test-uuid)) t.models/post-insert (dissoc :created_at))
    (finally
      (db/delete! Session :id (str test-uuid)))))

;; when creating a new Session, it should come back with an added `:type` key
(expect
  {:id              "092797dd-a82a-4748-b393-697d7bb9ab65"
   :user_id         (test-users/user->id :trashbird)
   :anti_csrf_token nil
   :type            :normal}
  (new-session))

;; if request is an embedding request, we should get ourselves an embedded Session
(expect
  {:id              "092797dd-a82a-4748-b393-697d7bb9ab65"
   :user_id         (test-users/user->id :trashbird)
   :anti_csrf_token "315c1279c6f9f873bf1face7afeee420"
   :type            :full-app-embed}
  (binding [mw.misc/*request* {:headers {"x-metabase-embedded" "true"}}]
    (with-redefs [session/random-anti-csrf-token (constantly "315c1279c6f9f873bf1face7afeee420")]
      (new-session))))
