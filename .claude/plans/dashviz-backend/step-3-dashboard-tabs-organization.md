# Dashboard Tabs and Organization Analysis

## File Index
```
src/metabase/models/
├── dashboard_tab.clj           # Core definition of dashboard tab model
├── dashboard.clj               # Main dashboard model with tab integration
└── dashboard_card.clj          # DashboardCard model that connects to tabs

test/metabase/models/
└── dashboard_tab_test.clj      # Tests for dashboard tab functionality

src/metabase/api/
└── dashboard.clj               # API endpoints for tab operations
```

## Summary

Dashboard tabs provide an organizational structure for Metabase dashboards, allowing dashboard content to be split across multiple tabs. This creates a more organized user experience, especially for complex dashboards with many cards. Tabs function as containers for dashboard cards, providing logical separation of content while maintaining the cohesive structure of a dashboard.

Each dashboard tab contains a collection of dashboard cards and has key properties like name, position, and dashboard association. Tabs support the same permission model as their parent dashboard, ensuring consistent access control.

## Dependencies

### Upstream Dependencies
- Toucan2 ORM (t2) - Used for database operations
- Methodical - Used for multimethods and extension points
- Metabase models/interface - Permission policy integration
- Serialization - For export/import of dashboard structures

### Downstream Dependencies
- Dashboard Cards - Cards are organized within tabs
- Dashboard API - Exposes tab functionality to frontend
- Serialization framework - Tabs are included in dashboard serialization

## Key Data Structures

### DashboardTab Model
```clj
;; Core model definition
(methodical/defmethod t2/table-name :model/DashboardTab [_model] :dashboard_tab)

(doto :model/DashboardTab
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))
```

### Tab Data Structure
A tab contains:
- id: Unique identifier
- name: User-visible name of the tab
- position: Order position in the dashboard (0-based)
- dashboard_id: Foreign key to parent dashboard
- cards: (hydrated) Collection of dashcards belonging to this tab

### Dashboard-Tab Relationship
Dashboards contain tabs, and tabs contain cards. The relationship is exposed through hydration methods:
```clj
(methodical/defmethod t2/batched-hydrate [:default :tabs]
  [_model k dashboards]
  (mi/instances-with-hydrated-data
   dashboards k
   #(group-by :dashboard_id (t2/select :model/DashboardTab
                                     :dashboard_id [:in (map :id dashboards)]
                                     {:order-by [[:dashboard_id :asc] [:position :asc] [:id :asc]]}))
   :id
   {:default []}))
```

## Core Functions

### Tab Creation and Management
```clj
(mu/defn create-tabs! :- [:map-of neg-int? pos-int?]
  "Create the new tabs and returned a mapping from temporary tab ID to the new tab ID."
  [dashboard-id :- ms/PositiveInt
   new-tabs     :- [:sequential [:map [:id neg-int?]]]]
  (let [new-tab-ids (t2/insert-returning-pks! :model/DashboardTab (->> new-tabs
                                                                     (map #(dissoc % :id))
                                                                     (map #(assoc % :dashboard_id dashboard-id))))]
    (zipmap (map :id new-tabs) new-tab-ids)))
```

### Tab Updates
```clj
(mu/defn update-tabs! :- nil?
  "Updates tabs of a dashboard if changed."
  [current-tabs :- [:sequential [:map [:id ms/PositiveInt]]]
   new-tabs     :- [:sequential [:map [:id ms/PositiveInt]]]]
  (let [update-ks       [:name :position]
        id->current-tab (m/index-by :id current-tabs)
        to-update-tabs  (filter
                          ;; filter out tabs that haven't changed
                         (fn [new-tab]
                           (let [current-tab (get id->current-tab (:id new-tab))]
                             (not= (select-keys current-tab update-ks)
                                   (select-keys new-tab update-ks))))

                         new-tabs)]
    (doseq [tab to-update-tabs]
      (t2/update! :model/DashboardTab (:id tab) (select-keys tab update-ks)))
    nil))
```

### Tab Deletion
```clj
(mu/defn delete-tabs! :- nil?
  "Delete tabs of a Dashboard"
  [tab-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (when (seq tab-ids)
    (t2/delete! :model/DashboardTab :id [:in tab-ids]))
  nil)
```

### Tab Hydration with Cards
```clj
(methodical/defmethod t2.hydrate/batched-hydrate [:default :tab-cards]
  "Given a list of tabs, return a seq of ordered tabs, in which each tabs contain a seq of ordered cards."
  [_model _k tabs]
  (assert (= 1 (count (set (map :dashboard_id tabs)))), "All tabs must belong to the same dashboard")
  (let [dashboard-id      (:dashboard_id (first tabs))
        tab-ids           (map :id tabs)
        dashcards         (t2/select :model/DashboardCard :dashboard_id dashboard-id :dashboard_tab_id [:in tab-ids])
        tab-id->dashcards (-> (group-by :dashboard_tab_id dashcards)
                              (update-vals #(sort dashboard-card/dashcard-comparator %)))
        tabs              (sort-by :position tabs)]
    (for [{:keys [id] :as tab} tabs]
      (assoc tab :cards (get tab-id->dashcards id [])))))
```

### Tab CRUD Operations
The `do-update-tabs!` function provides a comprehensive way to manage tabs, handling creation, updates, and deletions in a single operation:

```clj
(defn do-update-tabs!
  "Given current tabs and new tabs, do the necessary create/update/delete to apply new tab changes.
  Returns:
  - `old->new-tab-id`: a map from tab IDs in `new-tabs` to newly created tab IDs
  - `created-tab-ids`
  - `updated-tab-ids`
  - `deleted-tab-ids`
  - `total-num-tabs`: the total number of active tabs after the operation."
  [dashboard-id current-tabs new-tabs]
  (let [{:keys [to-create
                to-update
                to-delete]} (u/row-diff current-tabs new-tabs)
        to-delete-ids       (map :id to-delete)
        _                   (when-let [to-delete-ids (seq to-delete-ids)]
                              (delete-tabs! to-delete-ids))
        old->new-tab-id     (when (seq to-create)
                              (let [new-tab-ids (t2/insert-returning-pks! :model/DashboardTab
                                                                          (->> to-create
                                                                               (map #(dissoc % :id))
                                                                               (map #(assoc % :dashboard_id dashboard-id))))]
                                (zipmap (map :id to-create) new-tab-ids)))]
    (when (seq to-update)
      (update-tabs! current-tabs to-update))
    {:old->new-tab-id old->new-tab-id
     :created-tab-ids (vals old->new-tab-id)
     :deleted-tab-ids to-delete-ids
     :total-num-tabs  (reduce + (map count [to-create to-update]))}))
```

## Configuration Points

### Tab Schema
- **Name** - Human-readable tab name 
- **Position** - Controls tab ordering (0-based)
- **Dashboard Association** - Each tab belongs to a specific dashboard

### Card Positioning
Dashboard cards associate with tabs through the `dashboard_tab_id` property. When dashcards are updated, the tab ID mappings must be maintained:

```clj
(defn update-cards-for-copy
  "Update dashcards in a dashboard for copying.
  If the dashboard has tabs, fix up the tab ids in dashcards to point to the new tabs.
  Then if shallow copy, return the cards. If deep copy, replace ids with id from the newly-copied cards.
  If there is no new id, it means user lacked curate permissions for the cards
  collections and it is omitted."
  [dashcards id->new-card id->referenced-card id->new-tab-id]
  (let [dashcards (if (seq id->new-tab-id)
                    (map #(assoc % :dashboard_tab_id (id->new-tab-id (:dashboard_tab_id %)))
                         dashcards)
                    dashcards)]
    ;; ... rest of implementation
  ))
```

## Enterprise Extensions
There are no explicit enterprise-specific extensions for dashboard tabs in the codebase. The serialization functionality appears to be available in both OSS and Enterprise editions.

## Testing Approach
Testing for dashboard tabs covers several key areas:

1. **Permission Testing** - Ensures tabs inherit permissions from their parent dashboard:
```clj
(deftest perms-test
  (with-dashtab-in-personal-collection {:keys [collection dashboard dashtab] :as _dashtab}
    (testing "dashtab's permission is the permission of dashboard they're on"
      (is (= (mi/perms-objects-set dashtab :read)
             (mi/perms-objects-set dashboard :read)))
      (is (= (mi/perms-objects-set dashtab :write)
             (mi/perms-objects-set dashboard :write))))))
```

2. **Dependency Testing** - Ensures proper cascading deletion of dashboard tabs and cards:
```clj
(deftest dependency-test
  (testing "Deleting a dashtab should delete the associated dashboardcards"
    (with-dashtab-in-personal-collection {:keys [dashtab dashcard]}
      (t2/delete! dashtab)
      (is (= nil (t2/select-one :model/DashboardCard :id (:id dashcard))))))

  (testing "Deleting a dashboard will delete all its dashcards"
    (with-dashtab-in-personal-collection {:keys [dashboard dashtab dashcard]}
      (t2/delete! dashboard)
      (is (= nil (t2/select-one :model/DashboardTab :id (:id dashtab))))
      (is (= nil (t2/select-one :model/DashboardCard :id (:id dashcard)))))))
```

3. **Hydration Testing** - Tests proper data loading for tabs:
```clj
(deftest hydration-test
  (testing "hydrate a dashboard will return all of its tabs"
    (mt/with-temp
      [:model/Card            card      {}
       :model/Dashboard       dashboard {}
       :model/DashboardTab dashtab-1 {:dashboard_id (:id dashboard) :position 0}
       :model/DashboardTab dashtab-2 {:dashboard_id (:id dashboard) :position 1}
       :model/DashboardCard   _         {:dashboard_id (:id dashboard) :card_id (:id card) :dashboard_tab_id (:id dashtab-1)}
       :model/DashboardCard   _         {:dashboard_id (:id dashboard) :card_id (:id card) :dashboard_tab_id (:id dashtab-2)}]
      (is (=? {:tabs [{:id (:id dashtab-1), :position 0, :dashboard_id (:id dashboard)}
                      {:id (:id dashtab-2), :position 1, :dashboard_id (:id dashboard)}]}
              (t2/hydrate dashboard :tabs))))))
```

4. **Card Loading Testing** - Tests proper loading of cards within tabs:
```clj
(deftest hydrate-tabs-card-test
  (mt/with-temp
    [:model/Dashboard    {dashboard-id :id}    {}
     :model/DashboardTab {tab-2-id :id}        {:name         "Tab 2"
                                                :dashboard_id dashboard-id
                                                :position     1}
     ;; ... test setup for multiple tabs and cards
    ]
    (is (=? [{:id    tab-1-id
              :cards [{:id dash-1-tab1-id}
                      {:id dash-2-tab1-id}]}
             ;; ... expected test results
            ]
            (t2/hydrate (t2/select :model/DashboardTab :dashboard_id dashboard-id) :tab-cards)))))
```

## Error Handling

1. **Tab Validation** - When creating or updating tabs on a dashboard with existing tabs, the system checks that every card has a tab association:
```clj
(when (and (seq current-tabs)
          (not (every? #(some? (:dashboard_tab_id %)) dashcards)))
  (throw (ex-info (tru "This dashboard has tab, makes sure every card has a tab")
                 {:status-code 400})))
```

2. **Tab Hydration Consistency** - The tab-cards hydration method verifies that all tabs being hydrated belong to the same dashboard:
```clj
(assert (= 1 (count (set (map :dashboard_id tabs)))), "All tabs must belong to the same dashboard")
```

3. **Serialization Integrity** - The framework handles dashboard tabs during serialization to ensure data integrity.