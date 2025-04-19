# Phase 4.3: Real-time Updates and Subscriptions

This document analyzes the real-time updates and subscription mechanisms in Metabase's visualization system, focusing on dashboard auto-refresh functionality and subscription delivery systems.

## 1. Overview

Metabase provides two primary mechanisms for keeping users updated with the latest data:

1. **Auto-refresh for dashboards**: Real-time updating of dashboards at configurable intervals while users are viewing them
2. **Subscriptions (Pulses)**: Scheduled delivery of dashboard content or alert notifications via email, Slack, or webhooks

These systems allow users to:
- Monitor dashboards in real-time with periodic auto-refreshing
- Receive scheduled reports of dashboard data automatically
- Set up alerts that trigger based on specific conditions
- Integrate with external systems through webhooks

## 2. Dashboard Auto-Refresh

### 2.1 Auto-Refresh Components

The auto-refresh functionality is implemented through a set of hooks and components:

1. **useDashboardRefreshPeriod**: Core hook that manages refresh timing
   ```typescript
   export const useDashboardRefreshPeriod = ({
     onRefresh,
   }: {
     onRefresh: () => void;
   }): DashboardRefreshPeriodControls => {
     const [period, setPeriod] = useState<number | null>(null);
     const elapsedHook = useRef<((elapsed: number | null) => void) | null>(null);
     const elapsed = useRef<number | null>(0);
     
     // Implementation...
     
     return {
       refreshPeriod: period,
       onRefreshPeriodChange,
       setRefreshElapsedHook,
     };
   };
   ```

2. **useInterval**: Utility hook for interval timing
   ```typescript
   export function useInterval(fn: () => void, interval: number) {
     const [active, setActive] = useState(false);
     const intervalRef = useRef<number>();
     const fnRef = useRef<(() => void)>();
     
     // Implementation...
     
     return { start, stop, toggle, active };
   }
   ```

3. **RefreshWidget**: UI component for selecting refresh intervals
   ```typescript
   export const RefreshWidget = ({
     setRefreshElapsedHook,
     period,
     onChangePeriod,
   }: {
     setRefreshElapsedHook?: (hook: (elapsed: number | null) => void) => void;
     period: number | null;
     onChangePeriod: (period: number | null) => void;
   }) => {
     // Implementation...
   }
   ```

### 2.2 Refresh Logic Flow

The auto-refresh functionality follows this flow:

1. **Interval Selection**: User selects a refresh interval from the RefreshWidget dropdown (1, 5, 10, 15, 30, or 60 minutes)
2. **Timer Initialization**: The `useDashboardRefreshPeriod` hook initializes a timer based on the selected interval
3. **Countdown**: The timer counts down, updating the UI to show time until next refresh
4. **Refresh Trigger**: When the countdown reaches zero, the onRefresh callback is triggered
5. **Data Fetching**: The onRefresh callback fetches fresh data for all dashboard cards
6. **Reset**: The timer resets and the cycle continues

### 2.3 Refresh Configuration

The RefreshWidget provides standard refresh interval options:

```typescript
const OPTIONS = [
  { name: t`Off`, period: null },
  { name: t`1 minute`, period: toSeconds(1) },
  { name: t`5 minutes`, period: toSeconds(5) },
  { name: t`10 minutes`, period: toSeconds(10) },
  { name: t`15 minutes`, period: toSeconds(15) },
  { name: t`30 minutes`, period: toSeconds(30) },
  { name: t`60 minutes`, period: toSeconds(60) },
];
```

These options are presented to the user through a dropdown menu with the selected refresh rate displayed as a countdown timer.

### 2.4 Implementation Details

The implementation uses several key techniques:

1. **Tick-based Approach**: Uses a 1-second tick interval to update the elapsed time
   ```typescript
   const TICK_PERIOD = 1; // seconds
   ```

2. **Cleanup on Unmount**: Ensures interval is cleared when component unmounts
   ```typescript
   useUnmount(() => {
     stop();
   });
   ```

3. **Visual Feedback**: Provides visual countdown to help users anticipate the next refresh
   ```typescript
   <RefreshWidgetTarget elapsed={elapsed} period={period} />
   ```

4. **State Management**: Manages refresh state using React's useState and useRef hooks
   ```typescript
   const [period, setPeriod] = useState<number | null>(null);
   const elapsedHook = useRef<((elapsed: number | null) => void) | null>(null);
   const elapsed = useRef<number | null>(0);
   ```

## 3. Subscriptions System (Pulses)

### 3.1 Subscription Types and Channels

Metabase supports several types of subscriptions:

1. **Dashboard Subscriptions**: Scheduled delivery of dashboard content
2. **Question Alerts**: Notifications triggered based on result conditions
3. **Delivery Channels**:
   - Email
   - Slack
   - Webhooks (HTTP endpoints)

Each channel type has specific configuration requirements:

```typescript
export function channelIsValid(channel: Channel, channelSpec: ChannelSpec) {
  switch (channel.channel_type) {
    case "email":
      return (
        channel.recipients &&
        channel.recipients.length > 0 &&
        channel.recipients.every(recipientIsValid) &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    case "slack":
      return (
        channel.details?.channel &&
        fieldsAreValid(channel, channelSpec) &&
        scheduleIsValid(channel)
      );
    case "http":
      return channel.channel_id && scheduleIsValid(channel);
    default:
      return false;
  }
}
```

### 3.2 Scheduling Options

Subscriptions support various schedule types:

1. **Hourly**: Send on a fixed-minute mark every hour
2. **Daily**: Send at a specific time each day 
3. **Weekly**: Send on specific days of the week at a specific time
4. **Monthly**: Send on specific days (e.g., first Monday) at a specific time
5. **Custom (cron)**: Advanced scheduling using cron expressions

Schedule validation ensures that all required fields are provided:

```typescript
export function scheduleIsValid(channel: Channel) {
  switch (channel.schedule_type) {
    case "monthly":
      if (channel.schedule_frame != null && channel.schedule_hour != null) {
        return true;
      }
    // these cases intentionally fall though
    /* eslint-disable no-fallthrough */
    case "weekly":
      if (channel.schedule_day == null) {
        return false;
      }
    case "daily":
      if (channel.schedule_hour == null) {
        return false;
      }
    case "hourly":
      break;
    default:
      return false;
    /* eslint-enable no-fallthrough */
  }

  return true;
}
```

### 3.3 Recipients and Permissions

Subscription recipients are validated based on several factors:

1. **User Recipients**: Existing Metabase users
2. **Email Recipients**: Email addresses that match allowed domains (if configured)
3. **Slack Channels**: Valid Slack channels

```typescript
export function recipientIsValid(recipient: RecipientPickerValue) {
  if ("id" in recipient && recipient.id) {
    // user entity, added to the platform, no need to validate email
    return true;
  }

  const recipientDomain = getEmailDomain(recipient.email);
  const allowedDomains = MetabaseSettings.subscriptionAllowedDomains();
  return (
    _.isEmpty(allowedDomains) ||
    !!(recipientDomain && allowedDomains.includes(recipientDomain))
  );
}
```

### 3.4 API and State Management

Subscriptions are managed through a set of API endpoints and Redux actions:

1. **API Endpoints**: 
   ```typescript
   export const subscriptionApi = Api.injectEndpoints({
     endpoints: (builder) => ({
       listSubscriptions: builder.query<
         DashboardSubscription[],
         ListSubscriptionsRequest
       >({
         query: (params) => ({
           method: "GET",
           url: "/api/pulse",
           params,
         }),
         // Additional methods...
       }),
       // Other endpoints...
     }),
   });
   ```

2. **Redux Integration**:
   ```typescript
   const Pulses = createEntity({
     name: "pulses",
     nameOne: "pulse",
     path: "/api/pulse",
     // Actions and selectors...
   });
   ```

### 3.5 Notification UI

The UI for configuring notifications includes multiple components:

1. **NotificationChannelsPicker**: Allows selection of delivery channels
   ```typescript
   export const NotificationChannelsPicker = ({
     notificationHandlers,
     channels: nullableChannels,
     onChange,
     getInvalidRecipientText,
   }: NotificationChannelsPickerProps) => {
     // Implementation...
   };
   ```

2. **NotificationSchedule**: Configures when notifications are sent
   ```typescript
   export const NotificationSchedule = ({
     subscription,
     scheduleOptions,
     onScheduleChange,
     ...boxProps
   }: NotificationScheduleProps & BoxProps & HTMLAttributes<HTMLDivElement>) => {
     // Implementation...
   };
   ```

3. **WebhookForm**: Configuration for webhook destinations
   ```typescript
   export const WebhookForm = ({
     onSubmit,
     onCancel,
     onDelete,
     initialValues,
     submitLabel = t`Create destination`,
   }: {
     // Props...
   }) => {
     // Implementation...
   };
   ```

## 4. Webhook Integration

### 4.1 Webhook Configuration

Webhooks provide integration with external systems through HTTP requests:

1. **Basic Configuration**:
   - URL endpoint 
   - Name and description
   - Authentication method

2. **Authentication Options**:
   - None: No authentication
   - Basic: Username/password
   - Bearer: Token-based
   - API Key: Key/value pair in header or query parameter

```typescript
const renderAuthSection = (type: string) => {
  switch (type) {
    case "basic":
      return (
        <>
          <FormTextInput
            name="auth-username"
            label={t`Username`}
            placeholder="user@email.com"
            {...styles}
            mb="1.5rem"
          />
          <FormTextInput
            name="auth-password"
            label={t`Password`}
            placeholder="********"
            {...styles}
          />
        </>
      );
    // Other auth types...
  }
};
```

### 4.2 Testing and Validation

Webhooks include built-in testing functionality:

```typescript
const handleTest = async (
  values: WebhookFormProps,
  setFieldError: WebhookFormikHelpers["setFieldError"],
) => {
  await testChannel({
    details: {
      url: values.url,
      "auth-method": values["auth-method"],
      "auth-info": buildAuthInfo(values),
    },
  })
    .unwrap()
    .then(
      () => {
        setFieldError("url", undefined);
        setTestButtonLabel(t`Success`);
      },
      (e) => {
        setTestButtonLabel(t`Test failed`);
        const message =
          typeof e === "string" ? e : getResponseErrorMessage(e);

        setFieldError("url", message);
      },
    );
};
```

This allows users to verify their webhook configuration before saving it.

## 5. Alert Notifications

### 5.1 Alert Types

Alerts can be configured based on various conditions:

1. **Row Count**: Alert when result has rows
2. **Goal**: Alert when a value passes a threshold
3. **Comparative**: Alert when a value changes by a percentage

### 5.2 Alert Schedules

Alert schedules determine how frequently Metabase checks for alert conditions:

```typescript
export const NotificationSchedule = ({
  subscription,
  scheduleOptions,
  onScheduleChange,
  ...boxProps
}: NotificationScheduleProps & BoxProps & HTMLAttributes<HTMLDivElement>) => {
  // Implementation...
  
  return (
    <Box {...boxProps}>
      <Flex className={styles.scheduleContainer} direction="column" gap="md">
        <Schedule
          verb={c("A verb in the imperative mood").t`Check`}
          cronString={cronString}
          scheduleOptions={scheduleOptions}
          minutesOnHourPicker
          isCustomSchedule={subscription?.ui_display_type === "cron/raw"}
          renderScheduleDescription={renderScheduleDescription}
          onScheduleChange={handleScheduleChange}
          aria-label={t`Describe how often the alert notification should be sent`}
          labelAlignment="left"
          className={styles.schedule}
        />
      </Flex>
      {showWarning(scheduleSettings, cronString) && (
        <NotificationScheduleWarning />
      )}
    </Box>
  );
};
```

The system includes safeguards against overly frequent checks:

```typescript
const UNSAFE_SCHEDULE_TYPES = ["every_n_minutes", "cron"];
const WARNING_THRESHOLD_MINS = 10;
function showWarning(schedule: ScheduleSettings, cronString?: string) {
  if (
    !schedule.schedule_type ||
    !UNSAFE_SCHEDULE_TYPES.includes(schedule.schedule_type) ||
    !schedule.schedule_minute
  ) {
    return false;
  }
  if (schedule.schedule_type === "every_n_minutes") {
    return schedule.schedule_minute < WARNING_THRESHOLD_MINS;
  }
  if (schedule.schedule_type === "cron") {
    const [, minute] = cronString?.split(" ") || [];
    return (
      isRepeatingEvery(minute) &&
      cronUnitToNumber(minute) < WARNING_THRESHOLD_MINS
    );
  }
  return false;
}
```

## 6. Data Flow and Architecture

### 6.1 Auto-Refresh Data Flow

The auto-refresh feature follows a simple data flow:

1. User selects refresh interval → RefreshWidget
2. Timer logic managed by → useDashboardRefreshPeriod
3. Timer triggers callback → useRefreshDashboard
4. Data is fetched → fetchDashboard and fetchDashboardCardData
5. Dashboard updates with new data → Visualization components

### 6.2 Subscription Data Flow

The subscription flow is more complex:

1. **Configuration**:
   - User configures subscription/alert → UI components
   - Configuration saved to database → API endpoints

2. **Backend Processing** (not visible in frontend code):
   - Scheduler triggers based on configured schedule
   - Query is executed to get data
   - Results are formatted according to channel requirements

3. **Delivery**:
   - Data sent to configured channels (email, Slack, webhook)
   - Delivery status tracked

### 6.3 Architecture Patterns

The code demonstrates several architectural patterns:

1. **Hooks-based Logic**: Business logic encapsulated in custom hooks
2. **Redux RTK Query**: Modern API state management
3. **Validation Pipeline**: Multi-stage validation for configurations
4. **Component Composition**: UI broken down into focused components
5. **Internationalization**: Comprehensive text translation support

## 7. Performance Considerations

### 7.1 Auto-Refresh Optimizations

The auto-refresh system includes several performance considerations:

1. **Minimal Renders**: Uses refs to minimize unnecessary renders
   ```typescript
   const fnRef = useRef<() => void>();
   
   useEffect(() => {
     fnRef.current = fn;
   }, [fn]);
   ```

2. **Cleanup**: Ensures intervals are properly cleaned up
   ```typescript
   useUnmount(() => {
     stop();
   });
   ```

3. **Selective Refreshing**: When refreshing is triggered by parameter changes, only affected cards are updated

### 7.2 Subscription Processing Safeguards

The subscription system includes safeguards to prevent performance issues:

1. **Validation**: Extensive validation of subscription configuration 
2. **Rate Limits**: Warnings for frequent alert checks (< 10 minutes)
3. **Domain Restrictions**: Optional restriction of email recipients to specific domains

## 8. Conclusion

Metabase's real-time updates and subscription systems provide a comprehensive solution for data monitoring and distribution. The auto-refresh capability enables real-time dashboard monitoring with user-configurable refresh rates, while the subscription system allows for scheduled delivery of reports and alerts through multiple channels.

Key strengths of these systems include:
- Flexible scheduling options for both real-time updates and subscriptions
- Multiple delivery channels (email, Slack, webhooks)
- User-friendly configuration interfaces
- Performance optimizations and safeguards
- Extensive validation to ensure reliable operation

These features collectively enable users to stay updated with the latest data insights, either through active monitoring or passive notification delivery, enhancing the overall utility of Metabase's visualization capabilities.