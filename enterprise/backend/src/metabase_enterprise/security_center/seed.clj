(ns metabase-enterprise.security-center.seed
  ;; TODO (Ngoc 2026-03-31) -- DELETE THIS NAMESPACE before shipping to production.
  ;; This is dev-only mock data for the Security Center feature.
  "Seed mock security advisories for local dev testing.
   Runs automatically on startup when in dev mode via [[def-startup-logic!]]."
  (:require
   [metabase-enterprise.security-center.models.security-advisory]
   [metabase.config.core :as config]
   [metabase.models.interface :as mi]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private mock-advisories
  [{:advisory_id       "SC-2026-001"
    :severity          :critical
    :title             "RCE via H2 JDBC INIT Injection in EE Serialization Import"
    :description       "Enterprise serialization import is vulnerable to remote code execution via crafted H2 JDBC connection strings."
    :advisory_url      nil
    :remediation       "Upgrade to the patched version for your release."
    :affected_versions [{"min" "1.54.0" "fixed" "1.54.22"}
                        {"min" "1.55.0" "fixed" "1.55.22"}
                        {"min" "1.58.0" "fixed" "1.58.10"}
                        {"min" "1.59.0" "fixed" "1.59.4"}]
    :matching_query    {"default" {"select" [1]
                                   "from"   ["setting"]
                                   "where"  ["and" ["=" "key" "serialization-enabled"]
                                             ["=" "value" "true"]]
                                   "limit"  1}}
    :match_status      :active
    :published_at      #t "2026-03-24T23:20:00Z"}
   {:advisory_id       "SC-2026-002"
    :severity          :high
    :title             "SQL Injection in Redshift/Postgres match and replace"
    :description       "Instances with Redshift or Postgres databases are vulnerable to SQL injection through regex match and replace operations."
    :advisory_url      "https://github.com/metabase/metabase/security/advisories/GHSA-example"
    :remediation       "Upgrade to the patched version."
    :affected_versions [{"min" "1.54.0" "fixed" "1.58.8"}]
    :matching_query    {"default" {"select" [1]
                                   "from"   ["metabase_database"]
                                   "where"  ["in" "engine" ["redshift" "postgres"]]
                                   "limit"  1}}
    :match_status      :resolved
    :published_at      #t "2026-03-20T00:00:00Z"}
   {:advisory_id       "SC-2026-003"
    :severity          :high
    :title             "GeoJSON SSRF"
    :description       "Custom GeoJSON endpoints can be used for server-side request forgery."
    :advisory_url      "https://github.com/metabase/metabase/security/advisories/GHSA-example-2"
    :remediation       "Upgrade to the patched version."
    :affected_versions [{"min" "1.50.0" "fixed" "1.58.7"}]
    :matching_query    nil
    :match_status      :not_affected
    :published_at      #t "2026-03-15T00:00:00Z"}])

(defn seed-mock-advisories!
  "Insert mock advisories into the security_advisory table. Upserts by advisory_id."
  []
  (doseq [advisory mock-advisories]
    (let [now (mi/now)
          row (assoc advisory
                     :last_evaluated_at now
                     :fetched_at        now)]
      (if (t2/exists? :model/SecurityAdvisory :advisory_id (:advisory_id advisory))
        (t2/update! :model/SecurityAdvisory {:advisory_id (:advisory_id advisory)}
                    (dissoc row :advisory_id :fetched_at))
        (t2/insert! :model/SecurityAdvisory row))))
  (log/infof "Seeded %d mock advisories." (count mock-advisories)))

(when config/is-dev?
  (defmethod startup/def-startup-logic! ::seed-security-advisories [_]
    (seed-mock-advisories!)))
