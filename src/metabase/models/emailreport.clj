(ns metabase.models.emailreport
  (:use korma.core))


(def mode-active 0)
(def mode-disabled 1)

(def modes
  [{:id mode-active :name "Active"},
   {:id mode-disabled :name "Disabled"}])

(def days-of-week
  [{:id "sun" :name "Sun"},
   {:id "mon" :name "Mon"},
   {:id "tue" :name "Tue"},
   {:id "wed" :name "Wed"},
   {:id "thu" :name "Thu"},
   {:id "fri" :name "Fri"},
   {:id "sat" :name "Sat"}])

(def times-of-day
  [{:id "morning" :name "Morning" :realhour 8},
   {:id "midday" :name "Midday" :realhour 12},
   {:id "afternoon" :name "Afternoon" :realhour 16},
   {:id "evening" :name "Evening" :realhour 20},
   {:id "midnight" :name "Midnight" :realhour 0}])


(defentity EmailReport
  (table :report_emailreport))
