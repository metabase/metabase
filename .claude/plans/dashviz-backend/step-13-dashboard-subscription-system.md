# Dashboard Subscription System Analysis

## File Index
```
src/metabase/
├── pulse/
│   ├── dashboard_subscription.clj      # Core functionality for dashboard subscriptions
│   ├── send.clj                        # Code responsible for sending pulses
│   ├── models/
│   │   ├── pulse.clj                   # Data model for pulses/subscriptions
│   │   └── pulse_channel.clj           # Channel configuration for pulses
│   └── task/
│       └── send_pulses.clj             # Scheduled task execution for sending pulses
└── notification/
    ├── payload/
    │   ├── execute.clj                 # Query execution for dashboard cards
    │   └── impl/
    │       └── dashboard.clj           # Dashboard-specific payload generation
└── test/
    └── metabase/
        └── dashboard_subscription_test.clj  # Tests for dashboard subscriptions
```

## Summary

Dashboard subscriptions in Metabase allow users to automatically send dashboard results on a schedule via email or Slack. This system uses the more general "Pulse" model, which was originally designed for sending collections of cards but evolved to support both dashboard subscriptions and alerts.

The key components of the system include:

1. **Pulse Model**: The database entity that stores subscription configuration, including creator, schedule, and content.
2. **Pulse Channels**: The delivery mechanisms (email, Slack, HTTP webhooks) and their specific configurations.
3. **Scheduling System**: Uses Quartz for scheduling recurring jobs that execute at specified intervals.
4. **Dashboard Execution**: Executes dashboard queries with provided parameters and formats the results for delivery.
5. **Delivery System**: Sends the formatted results through the configured channels.

Dashboard subscriptions can be configured with:
- Different schedules (hourly, daily, weekly, monthly)
- Filter parameters to customize output
- Various output formats (including CSV/Excel attachments)
- Support for different card types (visualizations, text, links)
- Options like "skip if empty" to avoid sending subscriptions when there's no data

## Dependencies

### Upstream Dependencies
- Dashboard model (`:model/Dashboard`)
- Card model (`:model/Card`) 
- User model for creator and recipients
- Quartz scheduler for timing execution
- Query processor for executing dashboard cards

### Downstream Dependencies
- Channel system for email/Slack delivery
- Notification system to generate and send payloads
- Task scheduler for managing scheduled execution

## Key Data Structures

1. **Pulse**:
   ```clojure
   {:id <id>
    :name <n>
    :creator_id <user-id>
    :dashboard_id <dashboard-id>
    :parameters []  ; dashboard filter parameters
    :skip_if_empty <boolean>
    :collection_id <collection-id>
    :archived <boolean>}
   ```

2. **PulseChannel**:
   ```clojure
   {:id <id>
    :pulse_id <pulse-id>
    :channel_type <:email/:slack/:http>
    :details {}  ; Channel-specific details (emails, Slack channel)
    :schedule_type <:hourly/:daily/:weekly/:monthly>
    :schedule_hour <hour> ; 0-23, not used for hourly
    :schedule_day <day>   ; day of week for weekly, day of month for monthly
    :schedule_frame <:first/:mid/:last> ; for monthly
    :enabled <boolean>}
   ```

3. **PulseChannelRecipient**:
   ```clojure
   {:id <id>
    :pulse_channel_id <pulse-channel-id>
    :user_id <user-id>}
   ```

4. **PulseCard**:
   ```clojure
   {:id <id>
    :pulse_id <pulse-id>
    :card_id <card-id>
    :dashboard_card_id <dashcard-id>
    :position <position>
    :include_csv <boolean>
    :include_xls <boolean>}
   ```

## Core Functions

1. **Subscription Creation and Management**:
   - `update-dashboard-subscription-pulses!` - Updates pulse properties and associated cards for dashboard changes
   - `create-pulse!` - Creates a new pulse/subscription
   - `update-pulse!` - Updates an existing pulse/subscription
   - `update-notification-cards!` - Updates the cards associated with a notification
   - `update-notification-channels!` - Updates the channels for a notification

2. **Subscription Execution**:
   - `send-pulse!` - Main function to execute and send a pulse
   - `execute-dashboard` - Executes all dashboard cards with parameters
   - `execute-dashboard-subscription-card` - Executes a specific card for a subscription

3. **Scheduling**:
   - `init-dashboard-subscription-triggers!` - Initializes scheduler triggers for all dashboard subscriptions 
   - `update-send-pulse-trigger-if-needed!` - Updates scheduler trigger when pulse schedule changes
   - `SendPulse` - Quartz job that triggers the actual pulse delivery

4. **Delivery**:
   - `notification-info` - Creates notification info for sending through the notification system
   - `get-notification-handler` - Gets the channel handler for delivery
   - Channel-specific handlers in the notification system handle actual delivery

## Configuration Points

1. **Channel Configuration**:
   - Channel types (`:email`, `:slack`, `:http`)
   - Channel-specific settings (email addresses, Slack channels)

2. **Schedule Configuration**:
   - Schedule types (`:hourly`, `:daily`, `:weekly`, `:monthly`)
   - Time of day (hour)
   - Day selection (for weekly/monthly)
   - Frame selection (for monthly: first, mid, last)

3. **Content Configuration**:
   - `skip_if_empty` - Skip sending if no results
   - Inclusion of attachments (CSV, Excel)
   - Card formatting options

4. **System Configuration**:
   - Site URL for dashboard links
   - Row threshold for disk storage vs. memory (`rows-to-disk-threadhold`)

## Enterprise Extensions

The dashboard subscription system has enterprise extensions, particularly for filtering:

1. `the-parameters` in `notification.payload.impl.dashboard` has an enterprise implementation for advanced parameter handling.
2. `validate-email-domains` in `pulse-channel.clj` can be extended with enterprise features.
3. Email domain validation for subscriptions in enterprise environments.

## Testing Approach

The testing approach focuses on:

1. **Unit Tests**:
   - Testing individual components like card execution, channel formatting
   - Parameter handling and substitution

2. **Integration Tests**:
   - Testing full subscription flow, including query execution
   - Testing different delivery mechanisms (email, Slack)
   - Testing dashboard cards with different visualization types

3. **Behavior Tests**:
   - Testing "skip if empty" behavior
   - Testing filter parameter application
   - Testing handling of different card types (text, link, action, etc.)

4. **Test Fixtures**:
   - `do-with-dashboard-sub-for-card` - Creates test database objects
   - `with-dashboard-sub-for-card` - Wraps testing with fixtures
   - `do-test!` - Runs tests with standard boilerplate

## Error Handling

The dashboard subscription system handles errors in several ways:

1. **Query Execution Errors**:
   - Uses try/catch in `execute-dashboard-subscription-card` to handle individual card failures
   - Logs errors but continues with other cards in the dashboard

2. **Delivery Errors**:
   - `send-pulse!*` catches and logs errors for each channel
   - Tries to send through all channels even if some fail

3. **Scheduling Errors**:
   - Uses the Quartz misfire handling instruction to handle missed schedules
   - Re-executes missed schedules when possible

4. **Task History**:
   - Uses `task-history/with-task-history` to record task execution and results
   - Logs errors for troubleshooting

5. **Temporary File Management**:
   - Ensures cleanup of temporary files used for large result sets in the `do-after-notification-sent` method