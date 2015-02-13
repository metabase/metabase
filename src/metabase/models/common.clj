(ns metabase.models.common)


(def perms-none 0)
(def perms-read 1)
(def perms-readwrite 2)

(def permissions
  [{:id perms-none :name "None"},
   {:id perms-read :name "Read Only"},
   {:id perms-readwrite :name "Read & Write"}])


(def timezones
  ['GMT',
   'UTC',
   'US/Alaska',
   'US/Arizona',
   'US/Central',
   'US/Eastern',
   'US/Hawaii',
   'US/Mountain',
   'US/Pacific',
   'America/Costa_Rica'
   ])