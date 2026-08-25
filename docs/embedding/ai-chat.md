---
title: Embed an AI chat
summary: "Embed an AI chat in your app with a web component or the React SDK, so people can ask questions of their data in natural language."
redirect_from:
  - /docs/latest/embedding/sdk/ai-chat
---

# Embed an AI chat

![Embedded AI chat](./images/ai-chat.png)

{% include plans-blockquote.html feature="AI chat component" convert_pro_link_to_embedding=true%}

You can embed an AI chat in your app, so people can ask questions of their data in natural language. Embedded chat is a more focused version of [Metabot](../ai/metabot.md), built to work well in an embedded context: it can only display ad-hoc questions and metrics, and it doesn't know about dashboards.

AI chat requires an authenticated (SSO) embed. [Guest embeds](./guest-embedding.md) can't use it.

## Try the AI chat demo

For what AI chat looks like in action, check out the [AI chat component](https://embedded-analytics-sdk-demo.metabase.com/admin/analytics/new/ask-metabot) running on the Shoppy demo site. The demo's chat uses the [dedicated chart component](#ai-chat-with-dedicated-chart-panel).

## Set up AI chat in Metabase

First, an admin needs to [connect an AI provider](../ai/settings.md#enable-ai-features). If you're self-hosting, that means [bringing your own API key](../ai/settings.md#bring-your-own-api-key).

Then turn on embedded Metabot and tell Metabase which collection it should search:

1. Click the **grid** icon in the upper right.
2. Select **Admin**.
3. Click the **AI** tab.
4. In the left sidebar, click **AI Settings**.
5. In the **Metabot settings** card, click the **Embedded** tab.
6. Turn on **Enable Embedded Metabot**. With that toggle off, your chat component won't work.
7. Under **Collection Embedded Metabot can use**, click **Pick a different collection** and choose the collection that holds the models and metrics embedded Metabot should query.

The collection you pick here just narrows the chat's search scope. The AI can still query anything the person using the chat has [permissions to query](../permissions/embedding.md).

The **Embedded** tab configures embedded Metabot separately from the Metabot in your own Metabase, which lives on the **Internal** tab. For the rest of the settings for embedded Metabot, see [Metabot settings](../ai/settings.md#configure-metabot).

With embedded Metabot set up, there are two ways to add the chat to your app:

- **[Web component](#web-component-ai-chat)**: the whole chat interface, chart and all, from a single tag.
- **[React SDK](#react-sdk-ai-chat)**: the same interface from the `MetabotQuestion` component, or the [`useMetabot`](#build-a-custom-ai-chat-ui-with-usemetabot) hook if you'd rather build the interface yourself.

Either way, you [set where the chart appears](#set-where-the-chart-appears) and [let people save questions](#let-people-save-questions-metabot-creates) the same way.

## Web component AI chat

To render the AI chat interface:

```html
<metabase-metabot></metabase-metabot>
```

### Web component `metabase-metabot` attributes

{% include_file "{{ dirname }}/eajs/snippets/MetabaseMetabotAttributes.md" snippet="properties" %}

Depending on the framework you're using, you may need to stringify attributes before passing them to the component. And if you surround an attribute's value with double quotes, use single quotes inside it.

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md). Metabot's own text isn't translated; see [The AI chat component isn't translated](./translations.md#the-ai-chat-component-isnt-translated).

## React SDK AI chat

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To embed an AI chat with the [SDK](./sdk/introduction.md), use the `MetabotQuestion` component. Wrap the component in the `MetabaseProvider` component with your auth config.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/ai-question.tsx" %}
```

### React SDK `MetabotQuestion` props

- [Component](./sdk/api/MetabotQuestion.html)
- [Props](./sdk/api/MetabotQuestionProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/MetabotQuestionProps.md" snippet="properties" %}

## Set where the chart appears

Use the `layout` attribute (web component) or the `layout` prop (SDK) to position the chart relative to the chat interface:

- `auto` (default): Metabot uses the `stacked` layout on mobile screens, and a `sidebar` layout on larger screens.
- `stacked`: the chart stacks on top of the chat interface.
- `sidebar`: the chart appears to the left of the chat interface, which sits in a sidebar on the right.

## Let people save questions Metabot creates

Metabot answers with ad-hoc questions, so nothing lands in your Metabase unless you say so. Turning on the save button lets people keep a question Metabot built.

With a web component, saving is off by default. Turn it on with `is-save-enabled="true"`. `target-collection` is optional, but it's worth setting: it picks the collection that new questions land in, so people's work doesn't scatter across your Metabase. Setting a target collection also hides the collection picker in the save modal, so nobody has to decide where their question goes.

```html
<metabase-metabot
  is-save-enabled="true"
  target-collection="123"
></metabase-metabot>
```

With the SDK, the equivalent props on `MetabotQuestion` are `isSaveEnabled` and `targetCollection`.

## Build a custom AI chat UI with `useMetabot`

If `MetabotQuestion`'s built-in layouts don't fit your app, use the `useMetabot` hook to read Metabot's conversation state directly and render your own UI. The hook gives you the messages, the chart the agent most recently produced, processing and error state, and actions to submit, cancel, retry, or reset the conversation.

### AI chat with inline charts

![AI chat inline charts](./images/ai-chat-inline-chart.png)

When an agent responds, the message can contain a `Chart` component. You can walk the agent's messages and render charts inline alongside the chat transcript:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/use-metabot-inline-charts.tsx" %}
```

### AI chat with dedicated chart panel

![AI chat dedicated chart](./images/ai-chat-dedicated-chart.png)

The `CurrentChart` component is bound to the latest chart the agent produced. Render `CurrentChart` once, and it will swap in new charts as the agent creates them. You'll want to filter chart messages out of the transcript so they don't render twice:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/use-metabot-dedicated-chart.tsx" %}
```

### React SDK `useMetabot` return values

- [Hook](./sdk/api/useMetabot.html)
- [Return values](./sdk/api/UseMetabotResult.html)

{% include_file "{{ dirname }}/sdk/api/snippets/UseMetabotResult.md" snippet="properties" %}

### Guard against null while the SDK bundle loads

`useMetabot` returns `null` until the SDK bundle has loaded and `<MetabaseProvider>` has mounted, so always guard before you use it. The SDK ships its Metabot internals in a code-split chunk that isn't available synchronously, which means an unguarded first render throws `Cannot read properties of null` as soon as you reach for `metabot.messages`, `metabot.submitMessage`, or anything else on the hook.

### Bring your own markdown renderer

`MetabotQuestion` renders agent text messages for you, markdown formatting and all, along with transcript scrolling and input styling. The `useMetabot` hook hands you the raw conversation state instead, so the rendering is yours to do.

The part that's easy to miss: agent text messages (the ones where `message.type === 'text'`) contain markdown — links, bold, lists, inline code. The snippets above render `message.message` as plain text to keep them short, but in production you'll want to pass that text through a markdown renderer, like `react-markdown` or `markdown-to-jsx`, so links and formatting come out right.

### Strip links back to Metabase

Agent text can include links pointing back to the Metabase it's running against, like a link to a chart the agent just created. Opening one requires an authenticated Metabase session, so people viewing your app will hit a login screen. Strip those links out when you render the message, or swap them for a route in your own app.

## Further reading

- [Modular embedding components](./components.md)
- [Metabot](../ai/metabot.md)
- [Metabot settings](../ai/settings.md)
- [Embed a chart](./chart.md)
- [Embed a dashboard](./dashboard.md)
- [Appearance](./appearance.md)
- [Authentication](./authentication.md)
- [Modular embedding SDK](./sdk/introduction.md)
