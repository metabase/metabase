(ns metabase.prototype.semantic-layer
  "Business definitions for the prototype dataset: segments, a measure, glossary terms, AI context and column
  descriptions. Some definitions are different from what an LLM guesses by default (for example, a recent customer
  signed up in the last 45 days, not 30), so that the AI prototypes can show if they use the definitions.

  The definitions need an admin as their creator, so Metabase adds them at startup when an admin exists, and after
  the setup. When you change a definition, increment [[version]]."
  (:require
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.settings :as prototype.settings]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [methodical.core :as methodical]))

(def version
  "Version of the definitions. Increment it to make existing instances update them on their next start."
  1)

(def ^:private glossary
  [["Key account"
    "A customer on the Enterprise or Business plan with a lifetime value of $1,000 or more."]
   ["Detractor"
    "A customer whose latest NPS score is 6 or lower."]
   ["Churn risk"
    "An active customer with a satisfaction score below 40 who was not seen in the last 30 days."]
   ["EMEA"
    "Europe, the Middle East and Africa. In our data, these are the continents Europe and Africa."]
   ["Big market"
    "A country with a population of 50 million or more."]])

(def ^:private field-descriptions
  {"customers" {"status"             "Account status. \"suspended\" means that the last payment failed."
                "plan"               "The current subscription plan."
                "source"             "The marketing channel of the first visit of the customer."
                "lifetime_value"     "All the revenue from the customer so far, in USD."
                "satisfaction_score" "The score of the latest satisfaction survey, from 0 to 100."
                "nps_score"          "The answer to the latest Net Promoter Score survey, from 0 to 10."
                "signed_up_at"       "When the customer made their account."
                "last_seen_at"       "The last time the customer used the app."}
   "stores"    {"rating" "The average Google rating of the store, from 1 to 5."}})

(defn- segments
  "Segment definitions: `[table-name segment-name description (fn [field] filters)]`. `field` gives the metadata
  of a column of the table by name."
  []
  [["customers" "Recent customers"
    "Customers who signed up in the last 45 days. This is the official definition of a recent or new customer."
    (fn [field] [(lib/time-interval (field "signed_up_at") -45 :day)])]
   ["customers" "Active paying customers"
    "Customers with an active account on a paid plan."
    (fn [field] [(lib/= (field "status") "active")
                 (lib/!= (field "plan") "Free")])]
   ["products" "Top rated products"
    "Products with a rating of 4.5 or more from at least 50 reviews."
    (fn [field] [(lib/>= (field "rating") 4.5)
                 (lib/>= (field "review_count") 50)])]
   ["stores" "Flagship stores"
    "Open stores of the Flagship type."
    (fn [field] [(lib/= (field "store_type") "Flagship")
                 (lib/= (field "is_open") true)])]])

(def ^:private segment-ai-contexts
  {"Recent customers" {:instructions "Use this segment for every request about recent or new customers, unless the user gives an explicit time range."
                       :synonyms     ["new customers" "newcomers" "recent signups" "new signups"]
                       :examples     []}})

(def ^:private table-ai-contexts
  {"customers" {:instructions "All money columns are in USD. A churned customer has the status \"churned\"; Churned At is when they churned."
                :synonyms     ["users" "accounts" "clients"]
                :examples     []}})

(defn- table-query [mp table-id]
  (lib/query mp (lib.metadata/table mp table-id)))

(defn- field-fn [mp table-id]
  (let [ids (prototype.db/field-ids-by-name table-id)]
    (fn [field-name]
      (lib.metadata/field mp (or (get ids field-name)
                                 (throw (ex-info "Unknown prototype field" {:field field-name})))))))

(defn- seed! [database-id admin-id]
  (let [mp        (lib-be/application-database-metadata-provider database-id)
        table-ids (prototype.db/table-ids-by-name database-id dataset/schema-name)]
    (doseq [[table-name segment-name description filters-fn] (segments)
            :let [table-id   (get table-ids table-name)
                  field      (field-fn mp table-id)
                  definition (reduce lib/filter (table-query mp table-id) (filters-fn field))
                  segment-id (prototype.db/upsert-segment! table-id segment-name {:description description
                                                                                  :definition  definition
                                                                                  :creator-id  admin-id})]]
      (when-let [ai-context (get segment-ai-contexts segment-name)]
        (prototype.db/upsert-ai-context! "segment" segment-id ai-context)))
    (let [table-id (get table-ids "orders")
          field    (field-fn mp table-id)]
      (prototype.db/upsert-measure! table-id "Revenue"
                                    {:description "The total value of the orders, with tax, in USD."
                                     :definition  (lib/aggregate (table-query mp table-id) (lib/sum (field "total")))
                                     :creator-id  admin-id}))
    (doseq [[term definition] glossary]
      (prototype.db/upsert-glossary-entry! term definition admin-id))
    (doseq [[table-name ai-context] table-ai-contexts]
      (prototype.db/upsert-ai-context! "table" (get table-ids table-name) ai-context))
    (doseq [[table-name descriptions] field-descriptions
            :let [ids (prototype.db/field-ids-by-name (get table-ids table-name))]
            [field-name description] descriptions]
      (prototype.db/set-field-description! (get ids field-name) description))))

(defn ensure-semantic-layer!
  "Add or update the definitions when they are out of date. Does nothing when there is no prototype Database or no
  admin yet."
  []
  (let [database-id (prototype.db/prototype-database-id)
        admin-id    (prototype.db/first-admin-id)]
    (when (and database-id admin-id
               (< (or (prototype.settings/prototype-semantic-layer-version) 0) version))
      (log/info "Prototype data: adding the semantic layer")
      (seed! database-id admin-id)
      (prototype.settings/prototype-semantic-layer-version! version)
      (log/info "Prototype data: semantic layer ready"))))

(events/derive! ::user-joined :metabase/event)
(events/derive! :event/user-joined ::user-joined)

(methodical/defmethod events/publish-event! ::user-joined
  "The definitions need an admin, so add them after the setup makes the first one."
  [_topic _event]
  (quick-task/submit-task!
   (fn []
     (try
       (ensure-semantic-layer!)
       (catch Throwable e
         (log/error e "Prototype data: the semantic layer failed"))))))
