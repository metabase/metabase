(ns metabase.product-notifications.core
  "Validation, normalization, and eligibility rules for product notifications."
  (:require
   [clojure.string :as str]
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
   [:notifications [:vector :any]]])

(defn- parsed-version
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
           parsed-version))

(defn- validate-version-range!
  [{min-version :min_version, max-version :max_version, :as notification}]
  (let [^Semver minimum (parsed-version min-version)
        ^Semver maximum (parsed-version max-version)]
    (when (and min-version (nil? minimum))
      (throw (ex-info "Invalid minimum product notification version"
                      {:id (:notification_id notification), :version min-version})))
    (when (and max-version (nil? maximum))
      (throw (ex-info "Invalid maximum product notification version"
                      {:id (:notification_id notification), :version max-version})))
    (when (and minimum maximum (not (.isLowerThan minimum maximum)))
      (throw (ex-info "Product notification minimum version must be lower than its maximum version"
                      {:id (:notification_id notification)
                       :min-version min-version
                       :max-version max-version}))))
  notification)

(defn- normalized-notification
  [position notification]
  (mu/validate-throw NotificationV1 notification)
  (let [conditions  (:conditions notification)
        audience    (:audience conditions)
        deployment  (:deployment conditions)
        edition     (:edition conditions)
        starts-at   (:starts_at conditions)
        ends-at     (:ends_at conditions)
        min-version (:min_version conditions)
        max-version (:max_version conditions)
        normalized
        {:notification_id (:id notification)
         :schema_version  (:schema_version notification)
         :title           (:title notification)
         :content         (:content notification)
         :icon            (:icon notification)
         :audience        (keyword audience)
         :deployment      (keyword deployment)
         :edition         (keyword edition)
         :min_version     min-version
         :max_version     max-version
         :starts_at       (t/offset-date-time starts-at)
         :ends_at         (t/offset-date-time ends-at)
         :position        position}]
    (when-not (t/before? (:starts_at normalized) (:ends_at normalized))
      (throw (ex-info "Product notification start must be before its end"
                      {:id (:notification_id normalized)})))
    (validate-version-range! normalized)))

(defn- valid-notification-id
  [notification]
  (let [notification-id (when (map? notification) (:id notification))]
    (when (and (string? notification-id)
               (not (str/blank? notification-id)))
      notification-id)))

(defn- notification-error
  [notification phase exception]
  {:notification-id (valid-notification-id notification)
   :phase           phase
   :exception       exception})

(defn- normalized-notification-result
  [duplicate-ids position notification]
  (try
    (mu/validate-throw GenericNotification notification)
    (cond
      (contains? duplicate-ids (:id notification))
      {:error (notification-error
               notification
               :duplicate-id
               (ex-info "Duplicate product notification ID"
                        {:notification-id (:id notification)}))}

      (not= supported-schema-version (:schema_version notification))
      {:error (notification-error
               notification
               :unsupported-schema
               (ex-info "Unsupported product notification schema"
                        {:notification-id (:id notification)
                         :schema-version  (:schema_version notification)}))}

      :else
      {:notification (normalized-notification position notification)})
    (catch Exception e
      {:error (notification-error notification :validation e)})))

(mu/defn normalized-feed :- [:map
                             [:notifications [:vector :map]]
                             [:errors [:vector :map]]]
  "Validate a remote feed and normalize each valid notification for persistence.

  Invalid, duplicate, and unsupported notifications are returned in `:errors`
  without blocking valid notifications. New targeting conditions require a new
  schema version."
  [feed :- :map]
  (mu/validate-throw Feed feed)
  (let [notifications (:notifications feed)
        duplicate-ids (->> notifications
                           (keep valid-notification-id)
                           frequencies
                           (keep (fn [[notification-id n]]
                                   (when (> n 1) notification-id)))
                           set)]
    (reduce-kv
     (fn [result position notification]
       (let [{normalized :notification, :keys [error]}
             (normalized-notification-result duplicate-ids position notification)]
         (if error
           (update result :errors conj error)
           (update result :notifications conj normalized))))
     {:notifications []
      :errors        []}
     notifications)))

(defn- time-matches?
  [{starts-at :starts_at, ends-at :ends_at} now]
  (and (not (t/before? now starts-at))
       (t/before? now ends-at)))

(defn- version-matches?
  [{min-version :min_version, max-version :max_version} version]
  (if-not (or min-version max-version)
    true
    (when-let [^Semver current (marketing-version version)]
      (let [^Semver minimum (parsed-version min-version)
            ^Semver maximum (parsed-version max-version)]
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
