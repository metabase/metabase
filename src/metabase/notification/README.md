# Introduction to Notification

A Notification in Metabase consists of 3 core components:

1. **Payload**: The actual data/content to be sent
2. **Handlers**: One or more configurations that determine how the payload is rendered and where it's delivered
3. **Subscriptions**: One or more triggers that determine when the notification should be sent

Here is a diagram of the basic flow:
```

     +-------------------+
     |   Subscription    |
     +-------------------+
               |
               | Notification info
               |
+==============|================+
| NOTIFICATION |                |
|              v                |
|      +------------------+     |
|      |     Execute      |     |
|      +------------------+     |
|                               |
+===============================+
               |
               | Notification payload
               |
+==============|=================+
| CHANNEL      |                 |
|              |                 |
|              v                 |
|      +------------------+      |
|      |    Template      |      |
|      |     Engine       |      |
|      +------------------+      |
|              |                 |
|              | Message         |
|              v                 |
|      +------------------+      |
|      |   Destination    |      |
|      +------------------+      |
|                                |
+================================+
```

You can play with notifications with this simple code

```clojure
(require '[metabase.notification.test-util :as notification.tu])
(require '[metabase.notification.core :as notification])

(notification.tu/with-card-notification
  [notification {:card          {:dataset_query (mt/mbql-query users)}
                 :subscriptions [{:type          :notification-subscription/cron
                                  :cron_schedule "0 0 0 * * ?"}]
                 :handlers      [{:channel_type :channel/slack
                                  :recipients   [{:type     :notification-recipient/raw-value
                                                  :details  {:value "#general"}}]}
                                 {:channel_type :channel/email
                                  :recipients   [{:type    :notification-recipient/user
                                                  :user_id (mt/user->id :crowberto)}]}]}]
  (notification/send-notification! notification :notification/sync? true))
```

This creates a card notification with 1 cron subscription and 2 handlers and sends it synchronously.

## Subscription

A subscription is a trigger that determines when the notification should be sent.
Currently we have 2 types of subscriptions:
- `:notification-subscription/cron`: a cron schedule that determines when the notification should be sent
    - Cron subscriptions are managed by quartz scheduler. See `metabase.task.notification` for more details
- `:notification-subscription/system-event`: a system event that determines when the notification should be sent

## Payload

Once a notification is triggered, we need to construct a payload containing the data needed to render the notification.

This is done by `metabase.notification.payload.core/payload` multimethod that dispatch by payload type. 

Each payload type has its own implementation. For example, a card notification payload is executed by querying the card and include the results in the payload.

Once the payload is executed, it's decorated with some metadata such as settings, creator, etc. and then passed to the handlers.

As of now we have 3 payload types:

- `:notification/card`
- `:notification/dashboard` 
- `:notification/system-event`

All implementations are in `metabase.notification.payload.impl.*` namespaces.


## Handler
Once the payload is executed, a `notification-payload` is passed to each handler.

A handle consists of:
- A channel: the channel to send the notification to
- Optionally one template: the template to use to render the notification
- One or more recipients: the list of recipients to send the notification to

To send a notification, a handler will:
- Render the payload by calling `metabase.channel.core/render-notification` multimethod. This methods returns a sequence of messages to be sent to the channel.
- Send the messages to the channel by calling `metabase.channel.core/send!` multimethod.

Channel is extensible - new channels can be added by implementing all the methods in `metabase.channel.core` namespace.
