(ns metabase.product-notifications.core
  "Validation, normalization, and eligibility rules for product notifications."
  (:require
   [java-time.api :as t]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.semver4j Semver)))

(set! *warn-on-reflection* true)

(def ^:private supported-schema-version 1)

(def ^:private GenericNotification
  [:map
   [:id ms/NonBlankString]
   [:schema_version pos-int?]])

(def ^:private MarketingVersion
  [:re #"^\d+(?:\.\d+)*$"])

(def ^:private UtcTemporalString
  [:and ms/TemporalString [:re #".*Z$"]])

(def ^:private ConditionsV1
  [:map {:closed true}
   [:audience [:enum "admins" "all_users"]]
   [:deployment [:enum "cloud" "self_hosted" "any"]]
   [:edition [:enum "oss" "ee" "any"]]
   [:starts_at UtcTemporalString]
   [:ends_at UtcTemporalString]
   [:min_version {:optional true} [:maybe MarketingVersion]]
   [:max_version {:optional true} [:maybe MarketingVersion]]])

(def ^:private NotificationV1
  [:map {:closed true}
   [:id ms/NonBlankString]
   [:schema_version [:= supported-schema-version]]
   [:title ms/NonBlankString]
   [:content ms/NonBlankString]
   [:icon {:optional true} [:maybe ms/NonBlankString]]
   [:conditions ConditionsV1]])

(def ^:private Feed
  [:map {:closed true}
   [:notifications [:vector GenericNotification]]])

(defn- parse-version
  [version]
  (when version
    (try
      (Semver/coerce version)
      (catch Exception _
        nil))))

(defn- marketing-version
  [version]
  (some->> version
           (re-matches #"(?i)^v?[01]\.(.+)$")
           second
           parse-version))

(defn- validate-version-range!
  [{:keys [min_version max_version] :as notification}]
  (let [^Semver minimum (parse-version min_version)
        ^Semver maximum (parse-version max_version)]
    (when (and min_version (nil? minimum))
      (throw (ex-info "Invalid minimum product notification version"
                      {:id (:notification_id notification), :version min_version})))
    (when (and max_version (nil? maximum))
      (throw (ex-info "Invalid maximum product notification version"
                      {:id (:notification_id notification), :version max_version})))
    (when (and minimum maximum (not (.isLowerThan minimum maximum)))
      (throw (ex-info "Product notification minimum version must be lower than its maximum version"
                      {:id (:notification_id notification)
                       :min-version min_version
                       :max-version max_version}))))
  notification)

(defn- normalize-notification
  [position notification]
  (mu/validate-throw NotificationV1 notification)
  (let [{:keys [audience deployment edition starts_at ends_at min_version max_version]}
        (:conditions notification)
        normalized
        {:notification_id (:id notification)
         :schema_version  (:schema_version notification)
         :title           (:title notification)
         :content         (:content notification)
         :icon            (:icon notification)
         :audience        (keyword audience)
         :deployment      (keyword deployment)
         :edition         (keyword edition)
         :min_version     min_version
         :max_version     max_version
         :starts_at       (t/offset-date-time starts_at)
         :ends_at         (t/offset-date-time ends_at)
         :position        position}]
    (when-not (t/before? (:starts_at normalized) (:ends_at normalized))
      (throw (ex-info "Product notification start must be before its end"
                      {:id (:notification_id normalized)})))
    (validate-version-range! normalized)))

(mu/defn normalize-feed :- [:map
                            [:notifications [:vector :map]]
                            [:present-ids [:set :string]]]
  "Validate a complete remote feed and normalize supported notifications for persistence.

  Notifications using a newer schema are retained in `:present-ids`, but omitted
  from `:notifications` so this server cannot accidentally broaden their targeting."
  [feed :- :map]
  (mu/validate-throw Feed feed)
  (let [ids (:notifications feed)
        duplicates (->> ids
                        (map :id)
                        frequencies
                        (keep (fn [[id n]] (when (> n 1) id)))
                        seq)]
    (when duplicates
      (throw (ex-info "Duplicate product notification IDs"
                      {:ids (vec duplicates)})))
    {:present-ids (into #{} (map :id) ids)
     :notifications
     (into []
           (keep-indexed
            (fn [position notification]
              (when (= supported-schema-version (:schema_version notification))
                (normalize-notification position notification))))
           ids)}))

(defn- time-matches?
  [{:keys [starts_at ends_at]} now]
  (and (not (t/before? now starts_at))
       (t/before? now ends_at)))

(defn- version-matches?
  [{:keys [min_version max_version]} version]
  (if-not (or min_version max_version)
    true
    (when-let [^Semver current (marketing-version version)]
      (let [^Semver minimum (parse-version min_version)
            ^Semver maximum (parse-version max_version)]
        (and (or (nil? minimum) (.isGreaterThanOrEqualTo current minimum))
             (or (nil? maximum) (.isLowerThan current maximum)))))))

(mu/defn eligible? :- :boolean
  "Whether a persisted product notification applies to the supplied instance and person."
  [{:keys [active audience deployment edition] :as notification} :- :map
   {:keys [now superuser? hosted? enterprise? version]} :- :map]
  (boolean
   (and active
        (time-matches? notification now)
        (or (= audience :all_users)
            (and (= audience :admins) superuser?))
        (or (= deployment :any)
            (= deployment (if hosted? :cloud :self_hosted)))
        (or (= edition :any)
            (= edition (if enterprise? :ee :oss)))
        (version-matches? notification version))))
