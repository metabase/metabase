(ns metabase-enterprise.audit-app.pages.common.pulses
  "Shared code for [[metabase-enterprise.audit-app.pages.dashboard-subscriptions]]
  and [[metabase-enterprise.audit-app.pages.alerts]]."
  (:require
   [cheshire.core :as json]
   [metabase.models.collection :as collection]
   [metabase.util.cron :as u.cron]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]))

(def table-metadata
  "Common Metadata for the columns returned by both the [[metabase-enterprise.audit-app.pages.dashboard-subscriptions]]
  and [[metabase-enterprise.audit-app.pages.alerts]] audit queries. (These respective queries also return their own
  additional columns.)"
  [[:pulse_id          {:display_name "Pulse ID",      :base_type :type/Integer}]
   [:recipients        {:display_name "Recipients",    :base_type :type/Integer}]
   [:subscription_type {:display_name "Type",          :base_type :type/Text}]
   [:collection_id     {:display_name "Collection ID", :base_type :type/Integer,        :remapped_to :collection_name}]
   [:collection_name   {:display_name "Collection",    :base_type :type/Text,           :remapped_from :collection_id}]
   [:frequency         {:display_name "Frequency",     :base_type :type/Text}]
   [:creator_id        {:display_name "Created By ID", :base_type :type/Integer,        :remapped_to :creator_name}]
   [:creator_name      {:display_name "Created By",    :base_type :type/Text,           :remapped_from :creator_id}]
   [:created_at        {:display_name "Created At",    :base_type :type/DateTimeWithTZ}]
   [:num_filters       {:display_name "Filters",       :base_type :type/Integer}]])

(def table-query-columns
  "Keyword names of columns returned by the queries by both
  the [[metabase-enterprise.audit-app.pages.dashboard-subscriptions]] and [[metabase-enterprise.audit-app.pages.alerts]] audit
  queries."
  [:pulse_id
   :num_user_recipients
   :channel_id
   :channel_details
   :subscription_type
   :collection_id
   :collection_name
   :schedule_type
   :schedule_hour
   :schedule_day
   :schedule_frame
   :creator_id
   :creator_name
   :created_at
   :pulse_parameters])

(def table-query
  "Common HoneySQL base query for both the [[metabase-enterprise.audit-app.pages.dashboard-subscriptions]]
  and [[metabase-enterprise.audit-app.pages.alerts]] audit queries. (The respective implementations tweak this query and
  add additional columns, filters, and order-by clauses.)"
  {:with      [[:user_recipients {:select   [[:recipient.pulse_channel_id :channel_id]
                                             [:%count.* :count]]
                                  :from     [[:pulse_channel_recipient :recipient]]
                                  :group-by [:channel_id]}]]
   :select    [[:pulse.id :pulse_id]
               [:user_recipients.count :num_user_recipients]
               [:channel.id :channel_id]
               [:channel.details :channel_details]
               [:channel.channel_type :subscription_type]
               [:collection.id :collection_id]
               [:collection.name :collection_name]
               :channel.schedule_type
               :channel.schedule_hour
               :channel.schedule_day
               :channel.schedule_frame
               [:creator.id :creator_id]
               [(h2x/concat :creator.first_name (h2x/literal " ") :creator.last_name) :creator_name]
               [:channel.created_at :created_at]
               [:pulse.parameters :pulse_parameters]]
   :from      [[:pulse_channel :channel]]
   :left-join [:pulse                         [:= :channel.pulse_id :pulse.id]
               :collection                    [:= :pulse.collection_id :collection.id]
               [:core_user :creator]          [:= :pulse.creator_id :creator.id]
               :user_recipients               [:= :channel.id :user_recipients.channel_id]]
   :where     [:and
               [:not= :pulse.archived true]
               [:= :channel.enabled true]]})

(defn- describe-frequency [row]
  (-> (select-keys row [:schedule_type :schedule_hour :schedule_day :schedule_frame])
      u.cron/schedule-map->cron-string
      u.cron/describe-cron-string))

(defn- describe-recipients
  "Return the number of recipients for email `PulseChannel`s. Includes both User recipients (represented by
  `PulseChannelRecipient` rows) and plain email recipients (stored directly in the `PulseChannel` `:details`). Returns
  `nil` for Slack channels."
  [{subscription-type :subscription_type
    channel-details   :channel_details
    num-recipients    :num_user_recipients}]
  (let [details (json/parse-string channel-details true)]
    (when (= (keyword subscription-type) :email)
      ((fnil + 0 0) num-recipients (count (:emails details))))))

(defn- pulse-parameter-count [{pulse-parameters :pulse_parameters}]
  (if-let [params (try
                    (some-> pulse-parameters (json/parse-string true))
                    (catch Throwable e
                      (log/error e (trs "Error parsing Pulse parameters: {0}" (ex-message e)))
                      nil))]
    (count params)
    0))

(defn- root-collection-name []
  (:name (collection/root-collection-with-ui-details nil)))

(defn post-process-row-map
  "Post-process a `row` **map** for the subscription and alert audit page tables. Get this map by doing something like
  this:

    (zipmap table-query-columns row-vector)

  This map should contain at least the keys in [[table-query-columns]] (provided by the common [[table-query]]). After
  calling this function, you'll need to convert the row map back to a vector; something like

    (apply juxt (map first table-metadata))

  should do the trick."
  [row]
  {:pre [(map? row)]}
  (-> row
      (assoc :frequency  (describe-frequency row)
             :recipients (describe-recipients row)
             :num_filters (pulse-parameter-count row))
      (update :subscription_type (fn [subscription-type]
                                   (case (keyword subscription-type)
                                     :email (tru "Email")
                                     :slack (tru "Slack")
                                     subscription-type)))
      (update :collection_name #(or % (root-collection-name)))))
