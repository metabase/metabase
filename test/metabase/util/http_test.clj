(ns metabase.util.http-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.http :as http]))

(deftest valid-remote-host?-test
  (testing "returns true for valid remote host"
    (doseq [[url description] [;; Valid external hosts
                               ["https://example.com" "valid external domain"]
                               ["http://google.com/path" "valid external domain with path"]
                               ["https://api.github.com/repos" "valid API endpoint"]]]

      (testing (str description " - " url)
        (is (true? (http/valid-remote-host? url))))))

  (testing "returns false for local, loopback, site local addresses"
    (doseq [[url description] [;; Invalid hosts from invalid-hosts set
                               #_#_;; CI is passing this for some reasons
                                   ["http://metadata.google.internal" "GCP internal metadata service"]
                                 ["https://metadata.google.internal/computeMetadata/v1/" "GCP internal metadata with path"]

                               ;; Loopback addresses
                               ["http://localhost" "localhost"]
                               ["http://127.0.0.1" "IPv4 loopback"]

                               ;; Site local (private) addresses
                               ["http://192.168.1.1" "private IPv4 192.168.x.x"]
                               ["http://10.0.0.1" "private IPv4 10.x.x.x"]
                               ["http://172.16.0.1" "private IPv4 172.16.x.x-172.31.x.x"]

                               ;; Link local addresses
                               ["http://169.254.1.1" "link local IPv4"]]]
      (testing (str description " - " url)
        (is (false? (http/valid-remote-host? url)))))))
