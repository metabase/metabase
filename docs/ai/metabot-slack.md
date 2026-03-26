---
title: Metabot in Slack
summary: Chat with Metabot directly in Slack to ask questions about your data, get charts, upload CSVs, and manage subscriptions.
---

# Metabot in Slack

![Metabot in Slack](./metabot-slack.png)

[Metabot](/docs/ai/metabot.md) works directly in Slack, so people can ask questions about their data without switching to Metabase. Direct message Metabot for private analysis, or mention @Metabot in a channel to collaborate with your team.

## What Metabot can do

- **Find existing content**: Search your Metabase for questions, dashboards, models, and more. Metabot links you directly to the content in your Metabase.
- **Answer questions**: Create ad-hoc queries from natural language to answer your questions on the spot.
- **Show charts and tables**: Render static visualizations or tabular results in Slack. Metabot picks the format, though advanced visualization settings aren't available in Slack. You can copy table results or download them as TSV.
- **Work with CSVs**: [Upload a CSV](../databases/uploads.md) to Metabase, then ask follow-up questions about the data.
- **Manage notifications**: Create [subscriptions](../dashboards/subscriptions.md) and [alerts](../questions/alerts.md) from within a channel. Metabot can find an answer and subscribe you to it in one go, though it won't create new saved questions to subscribe to.

## Set up Metabot in Slack

### 1. Set up Metabot

Make sure [Metabot is set up](./settings.md) on your Metabase.

### 2. Connect Slack to Metabase

This is the basic Slack integration that lets Metabase send alerts and subscriptions to Slack channels. Follow the setup guide in [Set up Slack](../configuring-metabase/slack.md#create-your-slack-app).

### 3. Enable natural language questions

This setting lets people chat with Metabot in Slack.

Follow the steps in [Set up Metabot in Slack](../configuring-metabase/slack.md#set-up-metabot-in-slack) to add your Slack app credentials.

If you already have a Slack integration from before this feature existed, your Slack app will need additional permissions for natural language questions. The UI walks you through upgrading your app's permissions. Your existing alerts and subscriptions will keep working without upgrading; the new permissions are only needed for Metabot.

### 4. Connect your Slack account to Metabase

To chat with Metabot, people will need to link their Slack account to their Metabase account. The first time you message Metabot, it kicks off an OAuth flow that connects the two accounts.

## Use Metabot in Slack

- **DM Metabot** for private conversations with your data. No @mention needed.
- **@Metabot in a channel** so your team can see the question and answer. Metabot only responds to messages that @mention it in channels.
- **Add Metabot as an AI app** in Slack's sidebar for quick access.

## Clearing context

Metabot remembers the full context of a thread. To clear context and start a fresh conversation, either begin a new DM or @mention Metabot in a new thread in a channel.

## Notes on privacy

### Answers are visible to everyone in your Slack channel

If you ask Metabot a question in a public channel, _everyone_ in that channel can see the response. So even though Metabot respects your Metabase [permissions](../permissions/introduction.md) (Metabot can only see what you see), be thoughtful about questions that could surface sensitive data to others that may lack your permissions.

### Feedback forms contain your conversation history

When you submit feedback, the form you send may contain sensitive data from your conversation.

## Further reading

- [Metabot](./metabot.md)
- [Metabot AI settings](./settings.md)
- [Set up Slack](../configuring-metabase/slack.md)
