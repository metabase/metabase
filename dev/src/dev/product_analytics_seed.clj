(ns dev.product-analytics-seed
  "Seeds realistic sample data into the Product Analytics app-db tables.

   Simulates ~3 months of traffic on a SaaS marketing site (TestSaaS) with:
   - Landing pages, features, pricing, and a 3-tier checkout funnel
   - Realistic traffic sources: Google (organic + paid), ProductHunt, LinkedIn, GitHub
   - Geographic, device, and browser distributions
   - Growing daily traffic: ~12 sessions/day → ~75 sessions/day over 90 days
   - Custom events: plan_selected, checkout_started, payment_submitted, signup_click

   Usage from the REPL:
     (dev.product-analytics-seed/seed!)   ; populate sample data (~3 500 sessions)
     (dev.product-analytics-seed/clear!)  ; remove all seeded data"
  (:require
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   [java.time DayOfWeek OffsetDateTime ZoneOffset]
   [java.util Random UUID]))

(set! *warn-on-reflection* true)

;;; ===================================================== RNG =====================================================

(def ^:private ^Random rng (Random. 12345))

(defn- rnd    ^double [] (.nextDouble rng))
(defn- rnd-int        [n] (.nextInt rng (int n)))
(defn- rnd-bool       [p] (< (rnd) p))

(defn- weighted-pick
  "Pick one item from `items`, a seq of [weight & rest].
   Uses the first element as the weight; returns the whole item."
  [items]
  (let [total  (reduce + (map first items))
        cutoff (* (rnd) total)]
    (loop [rem cutoff [[w :as item] & more] items]
      (if (or (nil? more) (< rem w)) item (recur (- rem w) more)))))

;;; ===================================================== Time helpers =====================================================

(defn- utc-now ^OffsetDateTime [] (OffsetDateTime/now ZoneOffset/UTC))

(defn- day-start
  "Returns midnight UTC of the day that is `days-ago` days before today."
  ^OffsetDateTime [days-ago]
  (-> (utc-now)
      (.minusDays days-ago)
      (.withHour 0) (.withMinute 0) (.withSecond 0) (.withNano 0)))

(defn- rand-time-on-day
  "Returns a random UTC timestamp on `day`, skewed toward business hours."
  ^OffsetDateTime [^OffsetDateTime day]
  (let [[_ hour] (weighted-pick [[1 0]  [1 1]  [1 2]  [1 3]  [2 4]  [3 5]
                                 [5 6]  [8 7]  [14 8] [20 9] [24 10] [26 11]
                                 [24 12] [22 13] [22 14] [18 15] [14 16] [10 17]
                                 [8 18]  [6 19] [5 20] [4 21] [3 22] [2 23]])]
    (-> day
        (.withHour (int hour))
        (.withMinute (rnd-int 60))
        (.withSecond (rnd-int 60)))))

(defn- add-seconds ^OffsetDateTime [^OffsetDateTime dt n] (.plusSeconds dt n))

;;; ===================================================== Site =====================================================

(def ^:private seed-site-name "TestSaaS")

(defn- find-or-create-site!
  "Returns the site ID, creating the site record if it doesn't exist."
  []
  (if-let [existing (t2/select-one :model/ProductAnalyticsSite :name seed-site-name)]
    (:id existing)
    (do
      (t2/insert! :model/ProductAnalyticsSite
                  {:uuid            (str (UUID/randomUUID))
                   :name            seed-site-name
                   :allowed_domains "localhost,testsaas.com"
                   :archived        false})
      (t2/select-one-pk :model/ProductAnalyticsSite :name seed-site-name))))

;;; ===================================================== Reference data =====================================================

(def ^:private base-path "/test-saas")

(def ^:private page-title
  "Maps path suffix → HTML page title."
  {"" "TestSaaS – Grow Your Business"
   "/about" "About | TestSaaS"
   "/contact" "Contact | TestSaaS"
   "/features" "Features | TestSaaS"
   "/pricing" "Pricing | TestSaaS"
   "/login" "Log In | TestSaaS"
   "/checkout/individual/plan" "Choose Plan | TestSaaS"
   "/checkout/individual/account" "Create Account | TestSaaS"
   "/checkout/individual/payment" "Payment | TestSaaS"
   "/checkout/small-business/plan" "Choose Plan | TestSaaS"
   "/checkout/small-business/account" "Create Account | TestSaaS"
   "/checkout/small-business/payment" "Payment | TestSaaS"
   "/checkout/enterprise/plan" "Choose Plan | TestSaaS"
   "/checkout/enterprise/account" "Create Account | TestSaaS"
   "/checkout/enterprise/payment" "Payment | TestSaaS"
   "/checkout/success" "You're All Set! | TestSaaS"})

;;; Journey templates — [weight path-suffixes custom-event-specs]
;;; custom-event-spec: {:path :name :props}
(def ^:private journey-templates
  [[28 [""] []]
   [8  ["/features"] [{:path "/features" :name "feature_demo_click"
                       :props {"section" "integrations"}}]]
   [12 ["/pricing"]  [{:path "/pricing" :name "signup_click" :props {}}]]
   [2  ["/about"]    []]
   [2  ["/login"]    []]
   [20 ["" "/features" "/pricing"]
    [{:path "/pricing" :name "signup_click" :props {}}]]
   [5  ["" "/about"] []]
   [4  ["" "/features" "/pricing" "/about"] []]
   [3  ["/features" "/pricing"] []]
   ;; Individual checkout — full conversion
   [7  ["/pricing"
        "/checkout/individual/plan"
        "/checkout/individual/account"
        "/checkout/individual/payment"
        "/checkout/success"]
    [{:path "/checkout/individual/plan"    :name "plan_selected"
      :props {"plan" "individual" "billing" "monthly" "price" "29"}}
     {:path "/checkout/individual/account" :name "checkout_started"
      :props {"plan" "individual"}}
     {:path "/checkout/individual/payment" :name "payment_submitted"
      :props {"plan" "individual" "amount" "29" "currency" "USD"}}]]
   ;; Individual checkout — abandons after account creation
   [4  ["/pricing"
        "/checkout/individual/plan"
        "/checkout/individual/account"]
    [{:path "/checkout/individual/plan" :name "plan_selected"
      :props {"plan" "individual" "billing" "monthly" "price" "29"}}]]
   ;; Small business — full conversion
   [4  ["/pricing"
        "/checkout/small-business/plan"
        "/checkout/small-business/account"
        "/checkout/small-business/payment"
        "/checkout/success"]
    [{:path "/checkout/small-business/plan"    :name "plan_selected"
      :props {"plan" "small_business" "billing" "annual" "price" "99"}}
     {:path "/checkout/small-business/account" :name "checkout_started"
      :props {"plan" "small_business"}}
     {:path "/checkout/small-business/payment" :name "payment_submitted"
      :props {"plan" "small_business" "amount" "99" "currency" "USD"}}]]
   ;; Small business — abandons on plan selection
   [2  ["/pricing" "/checkout/small-business/plan"] []]
   ;; Enterprise — full conversion
   [2  ["/features"
        "/pricing"
        "/checkout/enterprise/plan"
        "/checkout/enterprise/account"
        "/checkout/enterprise/payment"
        "/checkout/success"]
    [{:path "/checkout/enterprise/plan"    :name "plan_selected"
      :props {"plan" "enterprise" "billing" "annual" "price" "299"}}
     {:path "/checkout/enterprise/account" :name "checkout_started"
      :props {"plan" "enterprise"}}
     {:path "/checkout/enterprise/payment" :name "payment_submitted"
      :props {"plan" "enterprise" "amount" "299" "currency" "USD"}}]]
   ;; Enterprise — abandons on plan page
   [1  ["/features" "/pricing" "/checkout/enterprise/plan"] []]])

;;; Traffic sources — [weight utm-and-referrer-attrs]
(def ^:private traffic-sources
  [[38 {}]
   [25 {:referrer_domain "google.com"}]
   [7  {:utm_source "google"     :utm_medium "cpc"    :utm_campaign "spring-launch-2025"}]
   [3  {:utm_source "google"     :utm_medium "cpc"    :utm_campaign "developer-tools-promo"}]
   [2  {:utm_source "google"     :utm_medium "cpc"    :utm_campaign "competitor-comparison"}]
   [8  {:referrer_domain "producthunt.com"}]
   [6  {:referrer_domain "twitter.com"}]
   [3  {:utm_source "linkedin"   :utm_medium "social" :utm_campaign "saas-audience-2025"}]
   [2  {:utm_source "linkedin"   :utm_medium "social" :utm_campaign "devtools-launch"}]
   [5  {:referrer_domain "github.com"}]
   [3  {:referrer_domain "news.ycombinator.com"}]
   [1  {:utm_source "newsletter" :utm_medium "email"  :utm_campaign "monthly-digest-jan"}]
   [2  {:utm_source "newsletter" :utm_medium "email"  :utm_campaign "monthly-digest-feb"}]
   [2  {:referrer_domain "reddit.com"}]])

;;; Geographic configs — [weight country subdivision1 city language]
(def ^:private geos
  [[50 "US" "CA"  "San Francisco" "en-US"]
   [30 "US" "NY"  "New York"      "en-US"]
   [20 "US" "TX"  "Austin"        "en-US"]
   [15 "US" "WA"  "Seattle"       "en-US"]
   [10 "US" "MA"  "Boston"        "en-US"]
   [8  "US" "FL"  "Miami"         "en-US"]
   [30 "GB" "ENG" "London"        "en-GB"]
   [8  "GB" "ENG" "Manchester"    "en-GB"]
   [18 "DE" "BE"  "Berlin"        "de-DE"]
   [7  "DE" "BY"  "Munich"        "de-DE"]
   [14 "CA" "ON"  "Toronto"       "en-CA"]
   [6  "CA" "BC"  "Vancouver"     "en-CA"]
   [14 "FR" "IDF" "Paris"         "fr-FR"]
   [8  "AU" "NSW" "Sydney"        "en-AU"]
   [5  "AU" "VIC" "Melbourne"     "en-AU"]
   [7  "IN" "KA"  "Bangalore"     "en-IN"]
   [5  "IN" "MH"  "Mumbai"        "en-IN"]
   [5  "NL" "NH"  "Amsterdam"     "nl-NL"]
   [5  "SE" "AB"  "Stockholm"     "sv-SE"]
   [5  "JP" "13"  "Tokyo"         "ja-JP"]
   [3  "BR" "SP"  "São Paulo"     "pt-BR"]
   [3  "SG" "01"  "Singapore"     "en-SG"]])

;;; Device configs — [weight device os browser screen]
(def ^:private device-configs
  [[22 "Desktop" "Windows" "Chrome"  "1920x1080"]
   [8  "Desktop" "Windows" "Chrome"  "1440x900"]
   [8  "Desktop" "Windows" "Firefox" "1920x1080"]
   [5  "Desktop" "Windows" "Edge"    "1920x1080"]
   [2  "Desktop" "Windows" "Edge"    "2560x1440"]
   [8  "Desktop" "macOS"   "Chrome"  "2560x1440"]
   [5  "Desktop" "macOS"   "Safari"  "2560x1440"]
   [3  "Desktop" "macOS"   "Safari"  "1440x900"]
   [3  "Desktop" "macOS"   "Firefox" "2560x1440"]
   [4  "Desktop" "Linux"   "Chrome"  "1920x1080"]
   [3  "Desktop" "Linux"   "Firefox" "1920x1080"]
   [10 "Mobile"  "iOS"     "Safari"  "390x844"]
   [3  "Mobile"  "iOS"     "Safari"  "375x812"]
   [2  "Mobile"  "iOS"     "Chrome"  "390x844"]
   [7  "Mobile"  "Android" "Chrome"  "360x800"]
   [2  "Mobile"  "Android" "Chrome"  "412x915"]
   [1  "Mobile"  "Android" "Firefox" "360x800"]
   [4  "Tablet"  "iOS"     "Safari"  "768x1024"]
   [1  "Tablet"  "iOS"     "Safari"  "1024x1366"]
   [1  "Tablet"  "Android" "Chrome"  "800x1280"]])

;;; ===================================================== Session-count schedule =====================================================

(defn- sessions-for-day
  "Number of sessions to generate for `day`. `day-index` runs 0 (90 days ago) → 89 (yesterday).
   Traffic grows from ~12/day to ~75/day; weekends are lighter."
  [day-index ^OffsetDateTime day]
  (let [base   (+ 12.0 (* 63.0 (Math/pow (/ day-index 89.0) 1.3)))
        dow    (.getDayOfWeek day)
        factor (if (#{DayOfWeek/SATURDAY DayOfWeek/SUNDAY} dow) 0.6 1.15)
        jitter (+ 0.8 (* 0.4 (rnd)))]
    (max 1 (int (* base factor jitter)))))

;;; ===================================================== Insertion helpers =====================================================

(defn- insert-session!
  "Inserts a session row and returns its auto-increment id."
  [site-id ^OffsetDateTime start-ts geo-attrs device-attrs]
  (let [[_ country subdiv city lang] geo-attrs
        [_ device os browser screen]  device-attrs
        session-uuid (str (UUID/randomUUID))]
    (t2/insert! :model/ProductAnalyticsSession
                (merge
                 {:session_uuid session-uuid
                  :site_id      site-id
                  :browser      browser
                  :os           os
                  :device       device
                  :screen       screen
                  :language     lang
                  :country      country
                  :subdivision1 subdiv
                  :city         city
                  :created_at   start-ts
                  :updated_at   start-ts}
                 ;; ~8% of sessions have a known distinct_id (returning users / logged-in)
                 (when (rnd-bool 0.08)
                   {:distinct_id (str "user_" (+ 1000 (rnd-int 9000)))})))
    (t2/select-one-pk :model/ProductAnalyticsSession :session_uuid session-uuid)))

(defn- insert-pageview!
  "Inserts a single pageview event."
  [site-id session-id visit-id path ^OffsetDateTime ts traffic-attrs]
  (t2/insert! :model/ProductAnalyticsEvent
              (merge
               {:site_id    site-id
                :session_id session-id
                :visit_id   visit-id
                :event_type 1
                :url_path   (str base-path path)
                :page_title (page-title path)
                :created_at ts}
               traffic-attrs)))

(defn- insert-custom-event!
  "Inserts a custom event and its string event_data props."
  [site-id session-id visit-id path ^OffsetDateTime ts event-name props]
  (let [event-id (t2/insert-returning-pk!
                  :model/ProductAnalyticsEvent
                  {:site_id    site-id
                   :session_id session-id
                   :visit_id   visit-id
                   :event_type 2
                   :event_name event-name
                   :url_path   (str base-path path)
                   :created_at ts})]
    (doseq [[k v] props]
      (t2/insert! :model/ProductAnalyticsEventData
                  {:event_id     event-id
                   :data_key     k
                   :string_value v
                   :data_type    1}))))

(defn- generate-session!
  "Generates one full session — pageviews followed by any attached custom events."
  [site-id ^OffsetDateTime session-start traffic-attrs]
  (let [geo-attrs    (weighted-pick geos)
        device-attrs (weighted-pick device-configs)
        session-id   (insert-session! site-id session-start geo-attrs device-attrs)
        visit-id     (str (UUID/randomUUID))
        [_ paths custom-specs] (weighted-pick journey-templates)]
    ;; Build a map of path → [custom-event-spec ...] for quick lookup
    (let [customs-by-path (group-by :path custom-specs)]
      (loop [i 0, ts session-start, remaining paths]
        (when (seq remaining)
          (let [path (first remaining)
                ts   (if (zero? i) ts (add-seconds ts (+ 30 (rnd-int (min 270 (* (inc i) 60))))))]
            ;; Pageview
            (insert-pageview! site-id session-id visit-id path ts traffic-attrs)
            ;; Custom events attached to this path (fired a few seconds after pageview)
            (doseq [{:keys [name props]} (customs-by-path path)]
              (insert-custom-event! site-id session-id visit-id path
                                    (add-seconds ts (rnd-int 5))
                                    name props))
            (recur (inc i) ts (rest remaining))))))))

;;; ===================================================== Public API =====================================================

(defn seed!
  "Populates the Product Analytics tables with ~90 days of realistic sample data.

   Generates approximately:
   - 3 200–3 800 sessions over 90 days (growing from ~12 to ~75 per day)
   - ~16 000–20 000 pageview events
   - ~700–1 000 custom events with event_data properties"
  []
  (log/info "Seeding Product Analytics sample data...")
  (let [site-id    (find-or-create-site!)
        total-days 90
        n-sessions (atom 0)]
    (doseq [days-ago (range total-days 0 -1)]                ; oldest → newest
      (let [day     (day-start days-ago)
            day-idx (- total-days days-ago)                  ; 0 = oldest, 89 = newest
            n-sess  (sessions-for-day day-idx day)]
        (doseq [_ (range n-sess)]
          (let [[_ traffic-attrs] (weighted-pick traffic-sources)]
            (generate-session! site-id
                               (rand-time-on-day day)
                               traffic-attrs))
          (swap! n-sessions inc))
        (when (zero? (mod days-ago 15))
          (log/infof "  ...%d days remaining, %d sessions so far" days-ago @n-sessions))))
    (let [event-count (t2/count :model/ProductAnalyticsEvent :site_id site-id)]
      (log/infof "Done! Seeded %d sessions and %d events for site %d (%s)."
                 @n-sessions event-count site-id seed-site-name))))

(defn clear!
  "Removes all data seeded by seed! — event_data, events, sessions, and the site record."
  []
  (if-let [site (t2/select-one :model/ProductAnalyticsSite :name seed-site-name)]
    (let [site-id (:id site)]
      (log/infof "Clearing Product Analytics data for site %d (%s)..." site-id seed-site-name)
      (let [event-ids (t2/select-pks-vec :model/ProductAnalyticsEvent :site_id site-id)]
        (when (seq event-ids)
          (t2/delete! :model/ProductAnalyticsEventData :event_id [:in event-ids])))
      (let [session-ids (t2/select-pks-vec :model/ProductAnalyticsSession :site_id site-id)]
        (when (seq session-ids)
          (t2/delete! :model/ProductAnalyticsSessionData :session_id [:in session-ids])))
      (t2/delete! :model/ProductAnalyticsEvent :site_id site-id)
      (t2/delete! :model/ProductAnalyticsSession :site_id site-id)
      (t2/delete! :model/ProductAnalyticsSite :id site-id)
      (log/info "Done clearing Product Analytics sample data."))
    (log/info "No TestSaaS site found — nothing to clear.")))

(comment
  ;; Populate sample data (~3 500 sessions, takes ~30–60 s on H2)
  (seed!)

  ;; Remove all seeded data
  (clear!)

  ;; Quick sanity checks
  (t2/count :model/ProductAnalyticsSession)
  (t2/count :model/ProductAnalyticsEvent)

  ;; Event breakdown by type
  (t2/query {:select   [:event_type [[:count :*] :cnt]]
             :from     [:product_analytics_event]
             :group-by [:event_type]})

  ;; Traffic source breakdown
  (t2/query {:select   [:utm_source [[:count :*] :cnt]]
             :from     [:product_analytics_event]
             :group-by [:utm_source]
             :order-by [[:cnt :desc]]})

  ;; Sessions by country
  (t2/query {:select   [:country [[:count :*] :cnt]]
             :from     [:product_analytics_session]
             :group-by [:country]
             :order-by [[:cnt :desc]]}))
