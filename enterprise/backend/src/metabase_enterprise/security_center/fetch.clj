(ns metabase-enterprise.security-center.fetch
  "Fetch security advisories from HM and store in appdb.
   See GDGT-2140 for full implementation.")

(defn sync-advisories!
  "Fetch new/updated advisories from HM and upsert into the appdb.
   TODO (Ngoc - 2026-04-01) - implement as part of GDGT-2140."
  []
  nil)
