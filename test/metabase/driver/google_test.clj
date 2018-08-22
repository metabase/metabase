(ns metabase.driver.google-test
  (:require [expectations :refer :all]
            [metabase.config :as config]
            [metabase.driver.google :as google]))

;; Typical scenario, all config information included
(expect
  "Metabase/v0.30.0-snapshot (GPN:Metabse; NWNjNWY0Mw== master)"
  (#'google/create-application-name  {:tag "v0.30.0-snapshot", :hash "5cc5f43", :branch "master", :date "2018-08-21"}))

;; It's possible to have two hashes come back from our script. Sending a string with a newline in it for the
;; application name will cause Google connections to fail
(expect
  "Metabase/v0.30.0-snapshot (GPN:Metabse; NWNjNWY0MwphYmNkZWYx master)"
  (#'google/create-application-name {:tag "v0.30.0-snapshot", :hash "5cc5f43\nabcdef1", :branch "master", :date "2018-08-21"}))

;; It's possible to have all ? values if there was some failure in reading version information, or if non was available
(expect
  "Metabase/? (GPN:Metabse; Pw== ?)"
  (#'google/create-application-name {:tag "?", :hash "?", :branch "?", :date "?"}))

;; This shouldn't be possible now that config/mb-version-info always returns a value, but testing an empty map just in
;; case
(expect
  "Metabase/? (GPN:Metabse; ? ?)"
  (#'google/create-application-name {}))
