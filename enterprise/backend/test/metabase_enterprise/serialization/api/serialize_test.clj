(ns metabase-enterprise.serialization.api.serialize-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card Collection Dashboard DashboardCard]]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util.files :as u.files]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-serialize-data-model [f]
  (premium-features-test/with-premium-features #{:serialization}
    (mt/with-temp* [Collection    [{collection-id   :id
                                    collection-eid  :entity_id
                                    collection-slug :slug}]
                    Dashboard     [{dashboard-id :id} {:collection_id collection-id}]
                    Card          [{card-id :id}      {:collection_id collection-id}]
                    DashboardCard [_                  {:card_id card-id, :dashboard_id dashboard-id}]]
      (testing "Sanity Check"
        (is (integer? collection-id))
        (is (= collection-id
               (t2/select-one-fn :collection_id Card :id card-id))))
      (mt/with-temp-dir [dir "serdes-dir"]
        (f {:collection-id collection-id
            :collection-filename (if collection-slug
                                   (str collection-eid "_" collection-slug)
                                   collection-eid)
            :dir dir})))))

(deftest serialize-data-model-happy-path-test
  (do-serialize-data-model
   (fn [{:keys [collection-id collection-filename dir]}]
     (is (= {:status "ok"}
            (mt/user-http-request :crowberto :post 200 "ee/serialization/serialize/data-model"
                                  {:collection_ids [collection-id]
                                   :path           dir})))
     (testing "Created files"
       (letfn [(path-files [path]
                 (sort (map str (u.files/files-seq path))))
               (files [& path-components]
                 (path-files (apply u.files/get-path dir path-components)))]
         (is (= (map
                 #(.toString (u.files/get-path (System/getProperty "java.io.tmpdir") "serdes-dir" %))
                 ["collections" "databases" "settings.yaml"])
                (files)))
         (testing "subdirs"
           (testing "cards"
             (is (= 1
                    (count (files "collections" collection-filename "cards")))))
           (testing "collections"
             (is (= [::check] (remove #{"cards" "dashboards" "timelines"} (files "collections")))))
           (testing "dashboards"
             (is (= 1
                    (count (files "collections" collection-filename "dashboards")))))))))))

(deftest serialize-data-model-validation-test
  (do-serialize-data-model
   (fn [{:keys [collection-id dir]}]
     (let [good-request {:collection_ids [collection-id]
                         :path           dir}
           serialize!   (fn [& {:keys [expected-status-code
                                       request
                                       user]
                                :or   {expected-status-code 400
                                       request              good-request
                                       user                 :crowberto}}]
                          (mt/user-http-request user :post expected-status-code "ee/serialization/serialize/data-model"
                                                request))]
       (testing "Require a EE token with the `:serialization` feature"
         (premium-features-test/with-premium-features #{}
           (is (= "This API endpoint is only enabled if you have a premium token with the :serialization feature."
                  (serialize! :expected-status-code 402)))))
       (testing "Require current user to be a superuser"
         (is (= "You don't have permissions to do that."
                (serialize! :user :rasta, :expected-status-code 403))))
       (testing "Require valid collection_ids"
         (testing "Non-empty"
           (is (= {:errors {:collection_ids "Non-empty, distinct array of Collection IDs"}}
                  (serialize! :request (dissoc good-request :collection_ids))
                  (serialize! :request (assoc good-request :collection_ids nil))
                  (serialize! :request (assoc good-request :collection_ids [])))))
         (testing "No duplicates"
           (is (= {:errors {:collection_ids "Non-empty, distinct array of Collection IDs"}}
                  (serialize! :request (assoc good-request :collection_ids [collection-id collection-id])))))
         (testing "All Collections must exist"
           (is (= (format "Invalid Collection ID(s). These Collections do not exist: #{%d}" Integer/MAX_VALUE)
                  (serialize! :request (assoc good-request :collection_ids [collection-id Integer/MAX_VALUE])
                              :expected-status-code 404))))
         (testing "Invalid value"
           (is (= {:errors {:collection_ids "Non-empty, distinct array of Collection IDs"}}
                  (serialize! :request (assoc good-request :collection_ids collection-id))
                  (serialize! :request (assoc good-request :collection_ids "My Collection"))))))
       (testing "Validate 'path' parameter"
         (is (= {:errors {:path "Valid directory to serialize results to"}}
                (serialize! :request (dissoc good-request :path))
                (serialize! :request (assoc good-request :path ""))
                (serialize! :request (assoc good-request :path 1000)))))))))
