(ns metabase.analyze.classifiers.event-schema
  "Classifier that recognizes event tables by their columns, against the schemas of well-known event trackers and
  warehouse exports, and detects which column plays each product analytics role."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:private event-schemas
  "Known event table schemas, most specific first. A schema matches when the table has a column named for every role
  in `:required`, and every column in `:signature`. Signature columns tell apart schemas that share role columns.
  Roles are named like the frontend's analysis settings, without their `columns.` prefix.

  A role is detected only when its column can play it: GA4's `event_timestamp` is microseconds in an integer, so
  GA4 matches with no timestamp, for the user to fill in. Roles that aren't columns at all, like PostHog's session in
  `properties`, aren't listed.

  The third-party schemas were written from memory of each vendor's docs and haven't been checked against real
  exports; see \"Event schemas\" in `dev/product-analytics/context/post-prototype.md`."
  [{:schema    "metabase-track"
    :roles     {:timestamp "created_at", :person "person_id", :session "session_id", :event_name "event_name"
                :url_path  "url_path"}
    :required  #{:timestamp :person :session :event_name :url_path}}
   {:schema    "snowplow"
    :roles     {:timestamp "derived_tstamp", :person "domain_userid", :session "domain_sessionid"
                :event_name "event_name", :url_path "page_urlpath"}
    :required  #{:timestamp :person :event_name}
    :signature ["collector_tstamp"]}
   {:schema    "ga4"
    :roles     {:timestamp "event_timestamp", :person "user_pseudo_id", :event_name "event_name"}
    :required  #{:timestamp :person :event_name}
    :signature ["event_params"]}
   {:schema    "amplitude"
    :roles     {:timestamp "event_time", :person "user_id", :session "session_id", :event_name "event_type"}
    :required  #{:timestamp :person :event_name}
    :signature ["amplitude_id"]}
   {:schema    "segment"
    :roles     {:timestamp "timestamp", :person "user_id", :event_name "event", :url_path "context_page_path"}
    :required  #{:timestamp :person :event_name}
    :signature ["anonymous_id"]}
   {:schema    "posthog"
    :roles     {:timestamp "timestamp", :person "distinct_id", :event_name "event"}
    :required  #{:timestamp :person :event_name}
    :signature ["properties"]}
   {:schema    "mixpanel"
    :roles     {:timestamp "time", :person "distinct_id", :event_name "event"}
    :required  #{:timestamp :person :event_name}}])

(defn- temporal? [field]
  (isa? (or (:effective_type field) (:base_type field)) :type/Temporal))

(def ^:private role-accepts
  "What a column needs, beyond its name, to play a role."
  {:timestamp temporal?})

(defn- match-schema
  "The settings `schema` detects for a table with `fields-by-name`, keyed by lower-case name, or nil."
  [fields-by-name {:keys [roles required signature] :as schema}]
  (let [named-field (fn [role] (fields-by-name (get roles role)))]
    (when (and (every? named-field required)
               (every? fields-by-name signature))
      {"schema"   (:schema schema)
       "settings" (into {}
                        (keep (fn [role]
                                (when-let [field (named-field role)]
                                  (when ((role-accepts role any?) field)
                                    [(str "columns." (name role)) (:name field)]))))
                        (keys roles))})))

(mu/defn detect-event-schema :- [:maybe [:map
                                         ["schema" :string]
                                         ["settings" [:map-of :string :string]]]]
  "The first known event schema `fields` match: its name, and the column it detects for each role it can, keyed like
  the frontend's analysis settings (`\"columns.person\"`). Nil when no known schema matches."
  [fields :- [:sequential [:map [:name :string]]]]
  (let [fields-by-name (u/index-by (comp u/lower-case-en :name) fields)]
    (some #(match-schema fields-by-name %) event-schemas)))
