(ns metabase.driver.google-test
  (:require [clojure.test :refer :all]
            [metabase.driver.google :as google]))

(deftest create-application-name-test
  (testing "Typical scenario, all config information included"
    (is (= "Metabase/v0.30.0-snapshot (GPN:Metabase; NWNjNWY0Mw== master)"
           (#'google/create-application-name  {:tag "v0.30.0-snapshot", :hash "5cc5f43", :branch "master", :date "2018-08-21"}))))

  (testing (str "It's possible to have two hashes come back from our script. Sending a string with a newline in it "
                "for the application name will cause Google connections to fail")
    (is (= "Metabase/v0.30.0-snapshot (GPN:Metabase; NWNjNWY0MwphYmNkZWYx master)"
           (#'google/create-application-name {:tag "v0.30.0-snapshot", :hash "5cc5f43\nabcdef1", :branch "master", :date "2018-08-21"}))))

  (testing (str "It's possible to have all ? values if there was some failure in reading version information, or if "
                "non was available")
    (is (= "Metabase/? (GPN:Metabase; Pw== ?)"
           (#'google/create-application-name {:tag "?", :hash "?", :branch "?", :date "?"}))))

  (testing (str "This shouldn't be possible now that config/mb-version-info always returns a value, but testing an "
                "empty map just in case")
    (is (= "Metabase/? (GPN:Metabase; ? ?)"
           (#'google/create-application-name {})))))
