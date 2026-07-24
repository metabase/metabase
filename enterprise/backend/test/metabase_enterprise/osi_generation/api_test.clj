(ns metabase-enterprise.osi-generation.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.core :as core]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase.task.core :as task]
   [metabase.test :as mt]))

(deftest requires-superuser-test
  (mt/with-premium-features #{:library-retrieval}
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :post 403 "ee/osi-generation/generate")))))

(deftest happy-path-queues-the-registered-job-test
  (mt/with-premium-features #{:library-retrieval}
    (let [triggered (atom nil)]
      (mt/with-dynamic-fn-redefs [settings/osi-generation-enabled (constantly true)
                                  core/available? (constantly true)
                                  settings/configured? (constantly true)
                                  task/job-exists? (constantly true)
                                  task/trigger-now! (fn [job-key]
                                                      (reset! triggered job-key)
                                                      true)]
        (is (nil? (mt/user-http-request :crowberto :post 204 "ee/osi-generation/generate")))
        (is (= core/generation-job-key @triggered))))))

(deftest disabled-generation-returns-a-loud-400-test
  (mt/with-premium-features #{:library-retrieval}
    (mt/with-dynamic-fn-redefs [settings/osi-generation-enabled (constantly false)]
      (is (= "OSI metadata generation is disabled."
             (mt/user-http-request :crowberto :post 400 "ee/osi-generation/generate"))))))

(deftest scheduler-rejection-returns-500-test
  (mt/with-premium-features #{:library-retrieval}
    (mt/with-dynamic-fn-redefs [settings/osi-generation-enabled (constantly true)
                                core/available? (constantly true)
                                settings/configured? (constantly true)
                                task/job-exists? (constantly true)
                                task/trigger-now! (constantly false)]
      (mt/user-http-request :crowberto :post 500 "ee/osi-generation/generate"))))
