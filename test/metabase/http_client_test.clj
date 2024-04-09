(ns ^:mb/once metabase.http-client-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.http-client :as client]))

(deftest build-url-test
  (binding [client/*url-prefix* "/api"]
    (testing "correctly encode all data types"
      (is (= (format "http://localhost:%s/api/database/1?int=1&float=1.23&string=a&keyword=b&seq=1&seq=2&seq=3" (config/config-str :mb-jetty-port))
             (client/build-url "database/1" {:int     1
                                             :float   1.23
                                             :string  "a"
                                             :keyword :b
                                             :seq     [1 2 3]}))))))

(deftest parse-http-client-args-test
  (testing "parse correctly"
    (is (= {:credentials "829a5f19-5a83-44af-af69-6c6ae4444167"
            :expected-status 200
            :method :get
            :query-parameters {:include_ids [1 2], :query "metabase"}
            :url "/card"
            :request-options nil
            :http-body nil}
           (#'client/parse-http-client-args ["829a5f19-5a83-44af-af69-6c6ae4444167" :get 200 "/card"
                                             :query       "metabase"
                                             :include_ids 1
                                             :include_ids 2])))))
