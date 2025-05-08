# Enterprise Extensions Analysis

## File Index
```
enterprise/backend/src/metabase_enterprise/
├── dashboard_subscription_filters/
│   └── parameter.clj                # Dashboard subscription filter extensions
├── llm/tasks/
│   └── describe_dashboard.clj       # AI dashboard description generation
├── content_verification/            # Dashboard moderation/verification features
├── cache/                           # Enhanced dashboard and card caching
└── sandbox/                         # Data sandboxing for dashboard security

enterprise/frontend/src/
├── metabase-enterprise/
│   ├── embedding/                   # Enterprise embedding components
│   ├── sharing/                     # Advanced dashboard sharing features
│   ├── moderation/                  # Dashboard moderation UI components
│   └── caching/                     # Dashboard caching UI components
└── embedding-sdk/                   # SDK for interactive embedding
```

## Summary

Enterprise dashboard and visualization features in Metabase extend the core functionality with advanced capabilities focused on embedding, sharing, performance optimization, and content moderation. Key enterprise features include:

1. **Interactive Embedding**: Allows embedding dashboards with drill-down capabilities, customizable UI elements, and integration with SSO systems. This enables multi-tenant, self-service analytics where users can explore and query data with appropriate permissions.

2. **Dashboard Subscription Filters**: Enables setting specific filter values for dashboard subscriptions, allowing different parameter values to be used when dashboards are sent via email or Slack.

3. **LLM Dashboard Descriptions**: Uses AI to automatically generate human-friendly summaries, keywords, and question suggestions for dashboards to improve user understanding.

4. **Dashboard Caching**: Enterprise-specific caching strategies to improve performance for frequently accessed dashboards.

5. **Dashboard Moderation**: Provides workflows for content verification, with review statuses and icons to indicate verified/unverified content.

6. **Whitelabel Visualizations**: Allows customizing visualization colors and appearance for brand consistency.

7. **Data Sandboxing**: Row-level security for dashboards ensuring users only see data appropriate to their access level.

## Dependencies

### Upstream Dependencies
- Core Metabase dashboard functionality
- Core query processor and visualization system
- Authentication and permissions system

### Downstream Dependencies
- Embedding SDK
- Interactive UI components
- Embedding applications
- Notification system (for filtered subscriptions)

## Key Data Structures

1. **Dashboard Subscription Parameters**:
   ```clojure
   ; Dashboard subscription parameters structure
   [{:id "parameter_id" :v "parameter_value"}]
   ```

2. **Dashboard Prompt Data** (for LLM):
   ```clojure
   {:dashboard-name String
    :charts [{:chart-name String
              :chart-description String
              :chart-type String
              :data-column-names [String]
              :chart-parameters [String]
              :chart-settings Map}]
    :global-parameters [{:parameter-name String :filter-type String}]}
   ```

3. **Moderation Review**:
   ```typescript
   interface ModerationReview {
     id: number;
     status: "verified" | "unverified" | "needs_changes";
     moderator_id: number;
     created_at: string;
     text: string;
   }
   ```

## Core Functions

1. **Dashboard Subscription Filters**:
   ```clojure
   (defenterprise the-parameters
     "Enterprise way of getting dashboard filter parameters. Blends parameters from dashboard subscription and the dashboard itself."
     :feature :dashboard-subscription-filters
     [dashboard-subscription-params dashboard-params]
     ;...implementation...)
   ```

2. **Dashboard Description Generation**:
   ```clojure
   (defn describe-dashboard
     "Create a human-friendly summary of a dashboard."
     [dashboard-id]
     ;...implementation...)
   ```

3. **Interactive Embedding Components**:
   ```typescript
   export const InteractiveDashboard = renderOnlyInSdkProvider(
     InteractiveDashboardInner
   );
   ```

## Configuration Points

1. **Embedding Settings**:
   - Authorized origins for embedding
   - SameSite cookie settings
   - Session timeout configuration

2. **Dashboard Caching**:
   - Caching strategies
   - TTL (Time to Live) settings
   - Invalidation configuration

3. **LLM Integration**:
   - LLM service configuration
   - Prompt templates

4. **Sandboxing**:
   - User attribute mapping
   - Group-based access policies
   - Row-level filtering rules

## Enterprise Extensions

1. **Interactive Embedding SDK**:
   - React components for embedding dashboards
   - Authentication via JWT
   - Customizable UI elements

2. **Dashboard Subscription Filters**:
   - Override default dashboard parameters for subscriptions

3. **Moderation and Content Verification**:
   - Dashboard verification workflows
   - Visual indicators of verification status

4. **Whitelabel Features**:
   - Custom colors for visualizations
   - Branded UI elements

5. **Advanced Caching**:
   - Hierarchical caching configuration
   - Database/Dashboard/Card-level settings
   - Cache warming for scheduled dashboard views

## Testing Approach

Testing follows Metabase's standard approach with different test types:

1. **Unit Tests**:
   - Backend feature tests using Clojure test framework
   - Frontend component tests using Jest and React Testing Library

2. **Integration Tests**:
   - Tests for embedding authentication workflows
   - Tests for sandboxing with various permission scenarios
   - Tests for subscription filters with different parameters

3. **End-to-End Tests**:
   - Testing complete embedding workflows
   - Verifying sandboxed data access across dashboards

## Error Handling

1. **Embedding Error Handling**:
   - SdkUsageProblem component for reporting SDK usage issues
   - Error components for dashboard not found
   - Appropriate fallbacks for authentication failures

2. **LLM Error Handling**:
   - Fallbacks for failed AI-generated descriptions

3. **Sandboxing Errors**:
   - Clear error messages for permission issues
   - Graceful handling of attribute mapping failures

## Integration with Core Components

Enterprise dashboard features integrate with core Metabase components through:

1. **Plugin Architecture**:
   - Uses Metabase's plugin system to extend dashboard functionality
   - Overrides core visualization components with enterprise versions

2. **Feature Flags**:
   - Premium features are enabled via feature flags and license tokens
   - The `hasPremiumFeature` function checks if enterprise features are available

3. **Extension Points**:
   - Dashboard parameters system extended for subscription filters
   - Visualization settings extended for custom styling
   - Rendering pipeline extended for white labeling
   - Query processor extended for sandboxing

4. **Hook System**:
   - Core functions include hooks (defenterprise) for enterprise extensions
   - Middleware pattern allows enterprise features to be inserted into processing pipelines
   - Default implementations fall back to OSS behavior when enterprise features aren't enabled