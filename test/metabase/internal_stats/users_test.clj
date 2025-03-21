(ns metabase.internal-stats.users-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.internal-stats.users :as sut]
   [metabase.test :as mt]))

(deftest email-domain-count-test
  (testing "counts different email domains"
    (mt/with-temp [:model/User _ {:email "ed@gmail.com"}
                   :model/User _ {:email "ted@gmail.com"}
                   :model/User _ {:email "fred@gmail.com"}
                   :model/User _ {:email "jed@gmail.com"}
                   :model/User _ {:email "ed@metabase.com"}
                   :model/User _ {:email "ed@meta.com"}
                   :model/User _ {:email "ed@megabase.com" :is_active false}
                   :model/User _ {:email "ed@ubertbase.com" :type :internal}
                   :model/User _ {:email "ed@metalbase.com"}
                   :model/User _ {:email "ted@metalbase.com"}]
      (is (= 4 (sut/email-domain-count))))))

(deftest external-users-count-test
  (testing "counts users with sso source jwt domains"
    (mt/with-temp [:model/User _ {:sso_source :jwt}
                   :model/User _ {:sso_source :jwt}
                   :model/User _ {:sso_source :jwt :is_active false}
                   :model/User _ {}
                   :model/User _ {}
                   :model/User _ {:sso_source :google_sso}
                   :model/User _ {:sso_source :saml}
                   :model/User _ {:sso_source :jwt :type :internal}
                   :model/User _ {:sso_source :jwt}]
      (is (= 3 (sut/external-users-count))))))
