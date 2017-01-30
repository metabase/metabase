(ns metabase.api.public-test
  "Tests for `api/public/` endpoints."
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.db :as db]
            [metabase.http-client :as http]
            (metabase.models [card :refer [Card]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]])
            metabase.public-settings ; for `enable-public-sharing
            [metabase.query-processor-test :as qp-test]
            [metabase.test.data :as data]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [metabase.util :as u])
  (:import java.util.UUID))


;;; ------------------------------------------------------------ Helper Fns ------------------------------------------------------------

(defn- count-of-venues-card []
  {:dataset_query {:database (data/id)
                   :type     :query
                   :query    {:source_table (data/id :venues)
                              :aggregation  [:count]}}})

(defn- shared-obj []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (test-users/user->id :crowberto)})

(defmacro ^:private with-temp-public-card {:style/indent 1} [[binding & [card]] & body]
  `(tu/with-temp Card [~binding (merge (count-of-venues-card) (shared-obj) ~card)]
     ~@body))

(defmacro ^:private with-temp-public-dashboard {:style/indent 1} [[binding & [dashboard]] & body]
  `(tu/with-temp Dashboard [~binding (merge (shared-obj) ~dashboard)]
     ~@body))

(defn- add-card-to-dashboard! [card dashboard]
  (db/insert! DashboardCard :dashboard_id (u/get-id dashboard), :card_id (u/get-id card)))

(defmacro with-temp-public-dashboard-and-card {:style/indent 1} [[dashboard-binding card-binding] & body]
  `(with-temp-public-dashboard [dash#]
     (with-temp-public-card [card#]
       (add-card-to-dashboard! card# dash#)
       (let [~dashboard-binding dash#
             ~card-binding      card#]
         ~@body))))



;;; ------------------------------------------------------------ POST /api/public/card/:uuid ------------------------------------------------------------

;; Check that we *cannot* execute a PublicCard if the setting is disabled
(expect
  "Public sharing is not enabled."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :post 400 (str "public/card/" uuid)))))

;; Check that we get a 404 if the PublicCard doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (http/client :post 404 (str "public/card/" (UUID/randomUUID)))))

;; Check that we *cannot* execute a PublicCard if the Card has been archived
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid} {:archived true}]
      (http/client :post 404 (str "public/card/" uuid)))))

;; Check that we can exec a PublicCard
(expect
  [[100]]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (qp-test/rows (http/client :post 200 (str "public/card/" uuid))))))

;; Check that we can exec a PublicCard with `?format=json`
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :post 200 (str "public/card/" uuid), :format :json))))

;; Check that we can exec a PublicCard with `?format=csv`
(expect
  "count\n100\n"
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (http/client :post 200 (str "public/card/" uuid), :format :csv))))

;; Check that we can exec a PublicCard with `?parameters`
(expect
  [{:type "category", :value 2}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-card [{uuid :public_uuid}]
      (get-in (http/client :post 200 (str "public/card/" uuid), :parameters (json/encode [{:type "category", :value 2}]))
              [:json_query :parameters]))))


;;; ------------------------------------------------------------ GET /api/public/dashboard/:uuid ------------------------------------------------------------

;; Check that we *cannot* fetch PublicDashboard if setting is disabled
(expect
  "Public sharing is not enabled."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-dashboard [{uuid :public_uuid}]
      (http/client :get 400 (str "public/dashboard/" uuid)))))

;; Check that we get a 404 if the PublicDashboard doesn't exis
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (http/client :get 404 (str "public/dashboard/" (UUID/randomUUID)))))

(defn- fetch-public-dashboard [{uuid :public_uuid}]
  (-> (http/client :get 200 (str "public/dashboard/" uuid))
      (select-keys [:name :ordered_cards])
      (update :name boolean)
      (update :ordered_cards count)))

;; Check that we can fetch a PublicDashboard
(expect
  {:name true, :ordered_cards 1}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (fetch-public-dashboard dash))))

;; Check that we don't see Cards that have been archived
(expect
  {:name true, :ordered_cards 0}
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (db/update! Card (u/get-id card), :archived true)
      (fetch-public-dashboard dash))))


;;; ------------------------------------------------------------ GET /api/public/dashboard/:uuid/card/:card-id ------------------------------------------------------------

;; Check that we *cannot* exec PublicCard via PublicDashboard if setting is disabled
(expect
  "Public sharing is not enabled."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (with-temp-public-dashboard-and-card [dash card]
      (http/client :get 400 (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card))))))

;; Check that we get a 404 if PublicDashboard doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [_ card]
      (http/client :get 404 (str "public/dashboard/" (UUID/randomUUID) "/card/" (u/get-id card))))))


;; Check that we get a 404 if PublicCard doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash _]
      (http/client :get 404 (str "public/dashboard/" (:public_uuid dash) "/card/" Integer/MAX_VALUE)))))

;; Check that we get a 404 if the Card does exist but it's not part of this Dashboard
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash _]
      (tu/with-temp Card [card]
        (http/client :get 404 (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)))))))

;; Check that we *cannot* execute a PublicCard via a PublicDashboard if the Card has been archived
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (db/update! Card (u/get-id card), :archived true)
      (http/client :get 404 (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card))))))

;; Check that we can exec a PublicCard via a PublicDashboard
(expect
  [[100]]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (qp-test/rows (http/client :get 200 (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)))))))

;; Check that we can exec a PublicCard via a PublicDashboard with `?parameters`
(expect
  [{:type "category", :value 2}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (with-temp-public-dashboard-and-card [dash card]
      (get-in (http/client :get 200 (str "public/dashboard/" (:public_uuid dash) "/card/" (u/get-id card)), :parameters (json/encode [{:type "category", :value 2}]))
              [:json_query :parameters]))))
