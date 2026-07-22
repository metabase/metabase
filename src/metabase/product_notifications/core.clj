(ns metabase.product-notifications.core
  "Pure filtering logic for the in-app product notifications feed.

  Given the raw feed fetched from static.metabase.com and a per-request context (the current user's superuser
  status, the instance's edition/version/hosting, and the user's dismissals) decides which notifications are
  relevant and undismissed. Kept dependency-free so it can be unit-tested without a running app."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def supported-schema-versions
  "Notification `schemaVersion`s this server knows how to render. Notifications authored with a newer schema
  are ignored so old servers degrade gracefully."
  #{1})

(defn- absent?
  "A condition value imposes no constraint (i.e. always passes) when it is missing (nil) or a blank string."
  [v]
  (or (nil? v) (and (string? v) (str/blank? v))))

(defn- parse-version
  "Parse a Metabase version string into a vector of integers for comparison, dropping the leading edition digit
  (0 = OSS, 1 = EE) when present so that e.g. `v0.52.3` and `v1.52.3` compare equal. Returns nil when the string
  has no numeric segments."
  [s]
  (when (string? s)
    (let [nums (into [] (keep parse-long) (re-seq #"\d+" s))]
      (when (seq nums)
        (if (and (>= (count nums) 2) (#{0 1} (first nums)))
          (subvec nums 1)
          nums)))))

(defn- compare-versions
  "Compare two version strings ignoring the edition digit. Returns -1/0/1, or nil when either is unparseable."
  [a b]
  (let [a (parse-version a)
        b (parse-version b)]
    (when (and a b)
      (let [n   (max (count a) (count b))
            pad #(into % (repeat (- n (count %)) 0))]
        (compare (pad a) (pad b))))))

(defn- within-date-window?
  "True when `today` (a `LocalDate`) is within the inclusive [start end] window. Missing bounds are open. A
  malformed date string hides the notification rather than throwing."
  [today start end]
  (letfn [(day [s] (when-not (absent? s) (t/local-date s)))]
    (try
      (and (or (nil? (day start)) (not (t/before? today (day start))))
           (or (nil? (day end))   (not (t/after?  today (day end)))))
      (catch Exception e
        (log/warn e "Invalid date in product notification condition; hiding notification")
        false))))

(defn- passes-conditions?
  "True when every targeting condition on `conditions` passes for `ctx`. A condition that is missing or a blank
  string imposes no constraint; `admin` is the exception, defaulting to admins-only when missing/blank — only an
  explicit `admin false` opens a notification to all authenticated users."
  [conditions {:keys [superuser? hosted? edition version today]}]
  (let [{:keys [admin cloud start_date end_date min_version max_version]} conditions
        cond-edition (:edition conditions)]
    (and
     (if (false? admin) true (boolean superuser?))
     (or (absent? cloud) (= (boolean cloud) (boolean hosted?)))
     (or (absent? cond-edition) (= (str/lower-case (name cond-edition)) edition))
     (within-date-window? today start_date end_date)
     ;; inclusive version window; an unparseable running version hides version-targeted notifications
     (or (absent? min_version) (when-let [c (compare-versions version min_version)] (>= c 0)))
     (or (absent? max_version) (when-let [c (compare-versions version max_version)] (<= c 0))))))

(defn visible-notifications
  "Given the raw `feed` map (`{:notifications [...]}`) and a per-user `ctx`, return the client-facing vector of
  relevant, undismissed notifications, each trimmed to `{:id :title :content :icon}`.

  `ctx` keys: `:superuser?`, `:hosted?`, `:edition` (\"oss\"/\"ee\"), `:version` (running version tag),
  `:today` (a `LocalDate`), and `:dismissed-ids` (a collection of already-dismissed notification ids)."
  [feed {:keys [dismissed-ids] :as ctx}]
  (let [dismissed (set dismissed-ids)]
    (into []
          (comp (filter #(contains? supported-schema-versions (:schemaVersion %)))
                (remove #(contains? dismissed (:id %)))
                (filter #(passes-conditions? (:conditions %) ctx))
                (map #(select-keys % [:id :title :content :icon])))
          (:notifications feed))))
