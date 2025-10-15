(ns metabase-enterprise.metabot-v3.profile-builder
  "Profile builder for Metabase Agent
   Generates organization and user profiles in Markdown format with metabase:// links"
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [toucan2.core :as t2]))

;;; ============================================
;;; SQL Query Loading
;;; ============================================

;; no dash
(def organization-profile-query
  "Organization-wide context query"
  (slurp (io/resource "organizationquery_1.sql")))

(def user-profile-query
  "User-specific context query"
  (slurp (io/resource "userquery_1.sql")))

;;; ============================================
;;; Linking Helpers
;;; ============================================

(defn metabase-link
  "Create a metabase:// link with descriptive name
   
   Args:
     type: dashboard, question, metric, model, table, or chart
     id: The resource ID
     name: Display name for the link
     
   Returns:
     Markdown link string"
  [type id name]
  (str "[" name "](metabase://" type "/" id ")"))

(defn safe-name
  "Get a safe display name, fallback to 'Untitled'"
  [name]
  (if (str/blank? name)
    "Untitled"
    name))

;;; ============================================
;;; Result Parsing
;;; ============================================

(defn parse-query-results
  "Parse SQL results into a map grouped by section"
  [results]
  (reduce (fn [acc row]
            (let [section (:section row)
                  data    (if (string? (:data row))
                            (json/parse-string (:data row) true)
                            (:data row))]
              (assoc acc (keyword section) data)))
          {}
          results))

;;; ============================================
;;; Organization Profile to Markdown
;;; ============================================

(defn format-company-settings
  "Format company settings section"
  [settings]
  (let [company-name (get settings "site-name" "Metabase")
        timezone     (get settings "report-timezone" "UTC")
        locale       (get settings "site-locale" "en")]
    (str "## ORGANIZATION: " company-name "\n"
         "- Timezone: " timezone "\n"
         "- Locale: " locale "\n")))

(defn format-databases
  "Format databases section with table links"
  [databases]
  (when (seq databases)
    (let [db-list (str/join "\n"
                            (map (fn [db]
                                   (str "  - " (:database_name db)
                                        " (" (:engine db) ")"
                                        (when-let [desc (:description db)]
                                          (str ": " desc))))
                                 databases))]
      (str "\n## DATA SOURCES (" (count databases) " total)\n" db-list "\n"))))

(defn format-metrics
  "Format business metrics section with metabase:// links"
  [metrics]
  (when (seq metrics)
    (let [metric-list (str/join "\n"
                                (map (fn [m]
                                       (str "  - "
                                            (metabase-link "metric"
                                                           (:metric_id m)
                                                           (safe-name (:metric_name m)))
                                            " [" (:database_name m) "." (:table_name m) "]"
                                            (when-let [desc (:description m)]
                                              (str ": " desc))))
                                     (take 15 metrics)))]
      (str "\n## BUSINESS METRICS (" (count metrics) " total)\n" metric-list "\n"))))

(defn format-glossary
  "Format business glossary section"
  [glossary]
  (when (seq glossary)
    (let [glossary-list (str/join "\n"
                                  (map (fn [g]
                                         (str "  - " (:term g) ": " (:definition g)))
                                       (take 15 glossary)))]
      (str "\n## BUSINESS GLOSSARY\n" glossary-list "\n"))))

(defn format-popular-dashboards
  "Format popular dashboards section with metabase:// links"
  [dashboards]
  (when (seq dashboards)
    (let [dash-list (str/join "\n"
                              (map (fn [d]
                                     (str "  - "
                                          (metabase-link "dashboard"
                                                         (:dashboard_id d)
                                                         (safe-name (:dashboard_name d)))
                                          " (" (:view_count d) " views)"
                                          (when-let [desc (:description d)]
                                            (str ": " desc))))
                                   (take 10 dashboards)))]
      (str "\n## POPULAR DASHBOARDS\n" dash-list "\n"))))

(defn format-popular-questions
  "Format popular questions section with metabase:// links"
  [questions]
  (when (seq questions)
    (let [question-list (str/join "\n"
                                  (map (fn [q]
                                         (str "  - "
                                              (metabase-link "question"
                                                             (:card_id q)
                                                             (safe-name (:card_name q)))
                                              " (" (:view_count q) " views)"
                                              (when-let [desc (:description q)]
                                                (str ": " desc))))
                                       (take 10 questions)))]
      (str "\n## POPULAR QUESTIONS\n" question-list "\n"))))

(defn format-query-snippets
  "Format SQL snippets section"
  [snippets]
  (when (seq snippets)
    (let [snippet-list (str/join "\n"
                                 (map (fn [s]
                                        (str "  - " (:snippet_name s) ": "
                                             (or (:description s) "No description")))
                                      (take 10 snippets)))]
      (str "\n## AVAILABLE SQL SNIPPETS\n" snippet-list "\n"))))

(defn format-common-fields
  "Format common fields section with metabase:// table links"
  [fields]
  (when (seq fields)
    (let [field-list (str/join "\n"
                               (map (fn [f]
                                      (str "  - "
                                           (or (:display_name f) (:field_name f))
                                           " in "
                                           (metabase-link "table"
                                                          (:table_id f)
                                                          (:table_name f))
                                           " [" (:database_name f) "]"
                                           " (used " (:usage_count f) "x)"))
                                    (take 20 fields)))]
      (str "\n## MOST USED FIELDS\n" field-list "\n"))))

(defn organization-profile->markdown
  "Convert organization profile data to Markdown"
  [profile-data]
  (str/join "\n"
            (remove str/blank?
                    [(format-company-settings (:COMPANY_SETTINGS profile-data))
                     (format-databases (:DATABASES profile-data))
                     (format-metrics (:METRICS profile-data))
                     (format-glossary (:GLOSSARY profile-data))
                     (format-popular-dashboards (:POPULAR_DASHBOARDS profile-data))
                     (format-popular-questions (:POPULAR_QUESTIONS profile-data))
                     (format-query-snippets (:QUERY_SNIPPETS profile-data))
                     (format-common-fields (:COMMON_FIELDS profile-data))])))

;;; ============================================
;;; User Profile to Markdown
;;; ============================================

(defn format-user-info
  "Format user basic information"
  [user-info]
  (when user-info
    (let [full-name  (:full_name user-info "Unknown User")
          email      (:email user-info "N/A")
          role       (if (:is_superuser user-info) "Administrator" "User")
          joined     (some-> (:date_joined user-info) (subs 0 10))
          last-login (some-> (:last_login user-info) (subs 0 10))]
      (str "## USER: " full-name "\n"
           "- Email: " email "\n"
           "- Role: " role "\n"
           "- Member since: " (or joined "N/A") "\n"
           "- Last active: " (or last-login "N/A") "\n"))))

(defn format-user-groups
  "Format user permission groups"
  [groups]
  (when (seq groups)
    (let [group-names (str/join ", " (map :group_name groups))]
      (str "\n## PERMISSION GROUPS\n" group-names "\n"))))

(defn format-recent-activity
  "Format recent activity with metabase:// links"
  [recent-views]
  (when (seq recent-views)
    (let [;; Group by type
          by-type (group-by :model_type recent-views)

          ;; Format each type
          format-type (fn [[model-type items]]
                        (let [type-label (case model-type
                                           "dashboard" "Dashboards"
                                           "card" "Questions"
                                           "table" "Tables"
                                           "model" "Models"
                                           (str model-type "s"))
                              item-links (str/join "\n"
                                                   (map (fn [item]
                                                          (str "    - "
                                                               (metabase-link model-type
                                                                              (:model_id item)
                                                                              (safe-name (:item_name item)))))
                                                        (take 5 items)))]
                          (when (seq items)
                            (str "  - " type-label " (" (count items) "):\n" item-links))))

          activity-sections (str/join "\n"
                                      (remove str/blank?
                                              (map format-type by-type)))]
      (str "\n## RECENT ACTIVITY (last 30 days)\n" activity-sections "\n"))))

(defn format-query-stats
  "Format query statistics"
  [stats]
  (when stats
    (str "\n## QUERY ACTIVITY (last 7 days)\n"
         "- Total queries: " (or (:total_queries_7d stats) 0) "\n"
         "- Unique queries: " (or (:unique_queries stats) 0) "\n"
         "- Avg execution time: " (or (:avg_execution_time_ms stats) 0) "ms\n"
         "- Databases used: " (or (:databases_used stats) 0) "\n")))

(defn format-frequently-used-tables
  "Format frequently used tables with metabase:// links"
  [tables]
  (when (seq tables)
    (let [table-list (str/join "\n"
                               (map (fn [t]
                                      (str "  - "
                                           (metabase-link "table"
                                                          (:table_id t)
                                                          (or (:display_name t) (:table_name t)))
                                           " [" (:database_name t) "]"
                                           " (used " (:usage_count t) "x)"))
                                    (take 10 tables)))]
      (str "\n## FREQUENTLY USED TABLES\n" table-list "\n"))))

(defn format-frequently-used-fields
  "Format frequently used fields with metabase:// table links"
  [fields]
  (when (seq fields)
    (let [field-list (str/join "\n"
                               (map (fn [f]
                                      (str "  - "
                                           (or (:display_name f) (:field_name f))
                                           " in "
                                           (metabase-link "table"
                                                          (:table_id f)
                                                          (:table_name f))
                                           " [" (:database_name f) "]"
                                           " (used " (:usage_count f) "x)"))
                                    (take 10 fields)))]
      (str "\n## FREQUENTLY USED FIELDS\n" field-list "\n"))))

(defn format-favorite-dashboards
  "Format favorite dashboards with metabase:// links"
  [dashboards]
  (when (seq dashboards)
    (let [dash-list (str/join "\n"
                              (map (fn [d]
                                     (str "  - "
                                          (metabase-link "dashboard"
                                                         (:dashboard_id d)
                                                         (safe-name (:dashboard_name d)))
                                          (when-let [coll (:collection_name d)]
                                            (str " [" coll "]"))))
                                   (take 8 dashboards)))]
      (str "\n## FAVORITE DASHBOARDS\n" dash-list "\n"))))

(defn format-favorite-cards
  "Format favorite questions/cards with metabase:// links"
  [cards]
  (when (seq cards)
    (let [card-list (str/join "\n"
                              (map (fn [c]
                                     (str "  - "
                                          (metabase-link "question"
                                                         (:card_id c)
                                                         (safe-name (:card_name c)))
                                          (when-let [coll (:collection_name c)]
                                            (str " [" coll "]"))))
                                   (take 8 cards)))]
      (str "\n## FAVORITE QUESTIONS\n" card-list "\n"))))

(defn format-created-content
  "Format content created by user with metabase:// links"
  [content]
  (when content
    (str "\n## CONTENT CREATED\n"
         "- Dashboards: " (or (:dashboards_created content) 0) "\n"
         "- Questions: " (or (:cards_created content) 0) "\n"
         "- Collections: " (or (:collections_created content) 0) "\n")))

(defn user-profile->markdown
  "Convert user profile data to Markdown"
  [profile-data]
  (str/join "\n"
            (remove str/blank?
                    [(format-user-info (:USER_INFO profile-data))
                     (format-user-groups (:USER_GROUPS profile-data))
                     (format-recent-activity (:RECENT_VIEWS profile-data))
                     (format-query-stats (:QUERY_STATS profile-data))
                     (format-frequently-used-tables (:FREQUENTLY_USED_TABLES profile-data))
                     (format-frequently-used-fields (:FREQUENTLY_USED_FIELDS profile-data))
                     (format-favorite-dashboards (:FAVORITE_DASHBOARDS profile-data))
                     (format-favorite-cards (:FAVORITE_CARDS profile-data))
                     (format-created-content (:CREATED_CONTENT profile-data))])))

;;; ============================================
;;; Main Profile Building Functions
;;; ============================================

(defn build-organization-profile
  "Build organization profile and convert to Markdown
   
   Args:
     db-spec: Database connection spec
     
   Returns:
     Markdown string with organization context and metabase:// links"
  [db-spec]
  ;; db-spec
  (toucan2.core/with-connection [conn]
    (let [results      (jdbc/query {:connection conn} [organization-profile-query])
          profile-data (parse-query-results results)]
      (organization-profile->markdown profile-data))))

(defn build-user-profile
  "Build user profile and convert to Markdown
   
   Args:
     db-spec: Database connection spec
     user-id: User ID to build profile for
     
   Returns:
     Markdown string with user context and metabase:// links"
  [db-spec user-id]
  (t2/with-connection [conn]
    (let [;; Repeat user-id for all parameter placeholders (17 times)
          params       (repeat 17 user-id)
          results      (jdbc/query {:connection conn} @(def xix (into [user-profile-query] params)))
          profile-data (parse-query-results results)]
      (user-profile->markdown profile-data))))

(defn build-combined-context
  "Build complete context combining organization and user profiles
   
   Args:
     db-spec: Database connection spec
     user-id: User ID to build profile for
     org-profile-cache: Optional cached organization profile
     
   Returns:
     Combined Markdown string ready for LLM with metabase:// links"
  [db-spec user-id & {:keys [org-profile-cache]}]
  (let [org-profile  (or org-profile-cache
                         (build-organization-profile db-spec))
        user-profile (build-user-profile db-spec user-id)]
    (str org-profile "\n\n" user-profile)))

;;; ============================================
;;; Caching Helpers
;;; ============================================

(def org-profile-cache (atom nil))
(def org-profile-timestamp (atom nil))

(defn get-cached-org-profile
  "Get cached organization profile if still valid"
  [cache-ttl-ms]
  (when (and @org-profile-cache
             @org-profile-timestamp
             (< (- (System/currentTimeMillis) @org-profile-timestamp)
                cache-ttl-ms))
    @org-profile-cache))

(defn cache-org-profile!
  "Cache organization profile"
  [profile]
  (reset! org-profile-cache profile)
  (reset! org-profile-timestamp (System/currentTimeMillis))
  profile)

(defn build-organization-profile-cached
  "Build organization profile with caching (24 hour TTL by default)"
  [db-spec & {:keys [cache-ttl-ms force-refresh?]
              :or   {cache-ttl-ms 86400000}}] ; 24 hours
  (if false #_(and (not force-refresh?)
                   (get-cached-org-profile cache-ttl-ms))
      @org-profile-cache
      (-> (build-organization-profile db-spec)
          (cache-org-profile!))))

;;; ============================================
;;; Example Usage
;;; ============================================

;; TODO: use app db spec -- nope
;; re-use appdb connection
(def dummy-hardcoded-spec
  {:subprotocol "postgresql"
   :subname     "//localhost:5432/metabase"
   :user        "metabase"
   #_#_:password    "password"
   :password    "metabase"})

(comment
  ;; Database connection spec
  (def db-spec
    {:subprotocol "postgresql"
     :subname     "//localhost:5432/metabase"
     :user        "metabase"
     #_#_:password    "password"
     :password    "metabase"})

  (try
  ;; Build organization profile (cache this!)
    (toucan2.core/with-connection [conn]
      (def org-profile (build-organization-profile-cached conn))
      (println org-profile))
    (catch Exception e
      (def eee e)
      (throw e)))

  (def opop (build-organization-profile-cached nil))
  (println opop)

  ;; Build user profile
  (try
    ;; Build organization profile (cache this!)
    (toucan2.core/with-connection [conn]
      (def org-profile (build-user-profile conn 1))
      (println org-profile))
    (catch Exception e
      (def eee e)
      (throw e)))

  ;; old
  (def user-profile (build-user-profile nil 1))
  (println user-profile)

  ;; Build combined context
  (def combined-context
    (build-combined-context db-spec 1
                            :org-profile-cache org-profile))
  (println combined-context)

  ;; Force refresh organization profile
  (def refreshed-org-profile
    (build-organization-profile-cached db-spec :force-refresh? true))

  ;; Example output with metabase:// links:
  ;; ## POPULAR DASHBOARDS
  ;;   - [Sales Overview Dashboard](metabase://dashboard/42) (150 views): Monthly sales metrics
  ;;   - [User Analytics](metabase://dashboard/43) (89 views)
  ;; 
  ;; ## FAVORITE QUESTIONS
  ;;   - [Revenue by Region](metabase://question/101) [Sales Collection]
  ;;   - [Active Users Count](metabase://question/102) [Analytics Collection]
  ;;
  ;; ## FREQUENTLY USED TABLES
  ;;   - [orders](metabase://table/10) [production_db] (used 45x)
  ;;   - [customers](metabase://table/11) [production_db] (used 32x)
  )