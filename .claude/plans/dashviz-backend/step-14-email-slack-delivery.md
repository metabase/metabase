# Email and Slack Delivery Analysis

## File Index
```
src/
└── metabase/
    ├── pulse/
    │   └── send.clj                    # Core pulse/alert sending logic
    ├── channel/
    │   ├── core.clj                    # Channel abstraction interfaces
    │   ├── impl/
    │   │   ├── email.clj               # Email channel implementation
    │   │   └── slack.clj               # Slack channel implementation
    │   └── render/
    │       ├── core.clj                # Rendering utilities
    │       ├── card.clj                # Card-specific rendering
    │       ├── body.clj                # Email/Slack message body rendering
    │       ├── table.clj               # Table-specific rendering
    │       ├── png.clj                 # PNG generation for visualizations
    │       ├── style.clj               # Styling utilities
    │       ├── js/
    │       │   ├── engine.clj          # JavaScript engine for rendering
    │       │   ├── svg.clj             # SVG icon generation
    │       │   └── color.clj           # Color utilities
    │       └── image_bundle.clj        # Image bundling utilities
    └── email/
        ├── dashboard_subscription.hbs  # Handlebars template for dashboard subscriptions
        ├── notification_card.hbs       # Handlebars template for card notifications (alerts)
        └── _*.hbs                      # Shared template components
```

## Summary
The Email and Slack delivery system in Metabase is responsible for sending pulses (dashboard subscriptions) and alerts to users through email and Slack channels. The system follows a modular architecture with separation of concerns:

1. **Notification Generation**: `pulse/send.clj` creates notifications to send based on pulse/alert configurations
2. **Channel Abstraction**: Generic channel interfaces in `channel/core.clj`
3. **Channel Implementations**: Specific implementations for email and Slack in the `channel/impl/` directory
4. **Rendering**: Visualization rendering in `channel/render/` with specialized rendering for different visualization types
5. **Templates**: Handlebars templates for email formatting

The system supports two primary notification types:
- **Dashboard Subscriptions**: Regular scheduled delivery of dashboards
- **Alerts**: Condition-based notifications when metrics exceed thresholds

## Dependencies

### Upstream Dependencies
- **Card/Dashboard Data**: The query processor that executes queries and provides result data
- **Pulse/Alert Models**: Data models for subscription and alert configurations
- **User/Recipient Information**: User data for determining recipients
- **Visualization Rendering**: Visualization components that render charts and tables

### Downstream Dependencies
- **Email Service**: System email configuration for sending emails
- **Slack API**: Slack API integration for posting messages to channels

## Key Data Structures

1. **Notification Payload**:
   ```clojure
   {:id <notification-id>
    :payload_type <:notification/dashboard or :notification/card>
    :creator_id <user-id>
    :payload <type-specific-payload>
    :handlers <delivery-channels>}
   ```

2. **Email Message**:
   ```clojure
   {:subject <email-subject>
    :recipients <list-of-emails>
    :message-type <:attachments, :html, or :text>
    :message <message-content>
    :recipient-type <optional :cc or :bcc>}
   ```

3. **Slack Message**:
   ```clojure
   {:channel-id <slack-channel-id>
    :attachments <list-of-attachments>
    :message <optional-text-message>}
   ```

4. **Render Info**:
   Generated information about how to render a visualization, containing:
   - HTML content
   - Attachments (images, data files)
   - Formatting information

## Core Functions

### Pulse/Send.clj
- `send-pulse!`: Main entry point for sending pulses/alerts
- `notification-info`: Constructs notification payload from pulse data
- `send-pulse!*`: Internal function that iterates through channels to send

### Channel/Impl/Email.clj
- `channel/send!`: Method implementation for email channel
- `channel/render-notification`: Specialized rendering for different notification types
- `render-message-body`: Renders email body using templates
- `construct-emails`: Creates email messages for users and non-users

### Channel/Impl/Slack.clj
- `channel/send!`: Method implementation for Slack channel
- `channel/render-notification`: Specialized rendering for different notification types
- `create-and-upload-slack-attachment!`: Creates and uploads images to Slack
- `part->attachment-data`: Converts card/text parts to Slack attachments

### Channel/Render
- `render-pulse-card`: Renders a single card for inclusion in pulse
- `render-pulse-section`: Renders a section (card + title)
- `png-from-render-info`: Converts rendered HTML to PNG
- `icon`: Generates SVG icons for emails/Slack

## Configuration Points

1. **Email Configuration**:
   - SMTP server settings
   - BCC settings
   - Email sender address
   - Unsubscribe URL configuration

2. **Slack Configuration**:
   - Slack API token
   - File upload limits
   - Markdown rendering options
   - Text length limits (header: 150 chars, block: 3000 chars)

3. **Rendering Options**:
   - PNG width for Slack (1200px)
   - Timezone settings for date-based visualizations
   - Color scheme for visualization elements
   - Result size limits for attachments

## Enterprise Extensions
The code doesn't explicitly show enterprise-specific extensions, but there are hooks that could be extended for enterprise features:

1. Potential extension points in the notification system for advanced alerting features
2. Custom templates and rendering for enterprise-specific notification types
3. Support for embedding or linking to dashboards with enterprise embedding features
4. Potentially extended channel types beyond email and Slack in enterprise versions

## Testing Approach
The testing strategy employs:

1. **Unit Tests**:
   - Tests for individual rendering components
   - Tests for email/Slack message construction
   - Tests for template rendering

2. **Integration Tests**:
   - End-to-end tests for pulse sending
   - Tests for alert conditions (above/below goals)
   - Tests with various visualization types
   - Tests with different result sizes and formats

3. **Utilities and Fixtures**:
   - Test utilities for capturing emails/Slack messages
   - Fixture data for consistent test scenarios
   - Temporary test settings for configurable elements

4. **Mock Services**:
   - Mocked JavaScript rendering for visualization
   - Mocked email and Slack services for testing delivery

## Error Handling

1. **Channel-Specific Error Handling**:
   - Each channel implementation catches and logs exceptions
   - Failures in one channel don't prevent delivery to other channels

2. **Visualization Rendering Errors**:
   - Fallbacks for visualization rendering errors
   - Default text representations when visual rendering fails

3. **Data Size Handling**:
   - Truncation of large text content for Slack
   - Attachment of CSV/Excel for large data sets
   - Row limits for query results

4. **Missing Data Handling**:
   - Conditional rendering based on available data
   - Skip delivery for alerts when conditions aren't met

## Visualization Formatting Specifics

### Email Format
1. **HTML Email Structure**:
   - Responsive layout with table-based design
   - Embedded images for visualizations
   - Attachments for large datasets (CSV, XLS)
   - Styled with inline CSS for email client compatibility

2. **Card/Dashboard Representation**:
   - Cards rendered as PNG images embedded in email
   - Text rendered as HTML with markdown processing
   - Dashboards presented as a sequence of cards
   - Filters displayed in a formatted table

### Slack Format
1. **Message Structure**:
   - Uses modern Slack blocks API
   - Header blocks for titles
   - Section blocks for content
   - Image blocks for visualizations

2. **Card/Dashboard Representation**:
   - Cards uploaded as image files to Slack
   - Links to original questions/dashboards
   - Text formatted with Slack's mrkdwn syntax
   - Filters displayed as formatted text fields

### Channel-Specific Considerations

#### Email-Specific
1. **HTML/CSS Limitations**:
   - Inline CSS for compatibility
   - Limited layout options for email clients
   - Image size optimization for email

2. **User Experience**:
   - Different handling for authenticated users vs. email-only recipients
   - Unsubscribe links for non-users
   - Management links for authenticated users

3. **Attachments**:
   - CSV/XLS attachments for data export
   - Inline images with content IDs
   - Optimization for email gateway size limits

#### Slack-Specific
1. **API Limitations**:
   - Character limits for blocks (3000 chars)
   - Image upload requirements
   - Block quantity limits (50 blocks per message)

2. **Formatting**:
   - Special character escaping for Slack markdown
   - Text truncation to meet Slack limits
   - Image size optimization for Slack display

3. **Delivery Pipeline**:
   - Uploading images before message sending
   - Breaking large dashboards into multiple messages
   - Handling Slack-specific errors

## Delivery Pipeline Flow

1. **Pulse/Alert Trigger**:
   - Task scheduler or manual trigger initiates `send-pulse!`
   - Pulse data loaded with recipient and channel information

2. **Notification Construction**:
   - Pulse/alert data converted to notification payload
   - Channels and recipients extracted

3. **Data Processing**:
   - Card queries executed to get fresh data
   - Results processed and prepared for rendering

4. **Rendering**:
   - Visualization HTML generated
   - PNG images created for visual elements
   - Templates populated with data and rendered content

5. **Channel-Specific Formatting**:
   - Email: HTML assembled, images embedded, attachments added
   - Slack: Blocks created, images uploaded to Slack

6. **Delivery**:
   - Email: Messages sent via SMTP
   - Slack: Messages posted via Slack API

7. **Error Handling & Logging**:
   - Exceptions caught and logged
   - Partial delivery attempted when possible