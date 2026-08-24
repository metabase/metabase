---
title: Embed an AI chat
summary: "Embed an AI chat component in your app so people can ask questions of their data in natural language."
redirect_from:
  - /docs/latest/embedding/sdk/ai-chat
---

# Embed an AI chat

![Embedded AI chat](./images/ai-chat.png)

{% include plans-blockquote.html feature="AI chat component" convert_pro_link_to_embedding=true%}

You can embed an AI chat in your app, so people can ask questions of their data in natural language. Embedded Metabot is a more focused version of [Metabot](../ai/metabot.md), built to work well in an embedded context: it can only display ad-hoc questions and metrics, and it doesn't know about dashboards.

AI chat requires an authenticated (SSO) embed. [Guest embeds](./guest-embedding.md) can't use it.

## Set up AI chat in Metabase

Before you embed the chat, turn on embedded Metabot and tell Metabase which collection it should search:

1. Click the **grid** icon in the upper right.
2. Select **Admin**.
3. Click the **AI** tab.
4. In the left sidebar, click **AI Settings**.
5. In the **Metabot settings** card, click the **Embedded** tab.
6. Turn on **Enable Embedded Metabot**. With that toggle off, your chat component won't work.
7. Under **Collection Embedded Metabot can use**, click **Pick a different collection** and choose the collection that holds the models and metrics embedded Metabot should query.

Pointing embedded Metabot at a focused collection narrows where it looks: when it goes hunting for models and metrics to build a query from, it searches that collection and its subcollections. That's a search scope, not a permission boundary. Embedded Metabot can still reach anything the person using it has permissions for, so to control what people can get to, set [data permissions](../permissions/embedding.md).

The **Embedded** tab configures embedded Metabot separately from the Metabot in your own Metabase, which lives on the **Internal** tab.

For tips and more, see [Metabot settings](../ai/settings.md).

With embedded Metabot set up, add the chat to your app:

- [Web component](#web-component-ai-chat)
- [React SDK](#react-sdk-ai-chat)

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

With a web component, turn saving on with `is-save-enabled="true"`, which is off by default. `target-collection` is optional, but it's worth setting: it picks the collection that new questions land in, so people's work doesn't scatter across your Metabase.

```html
<metabase-metabot
  is-save-enabled="true"
  target-collection="5"
></metabase-metabot>
```

With the SDK, the equivalent props on `MetabotQuestion` are `isSaveEnabled` and `targetCollection`. Setting `targetCollection` also hides the collection picker in the save modal, so nobody has to decide where their question goes.

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

### Notes on `useMetabot`

- **Guard against null while waiting for the SDK bundle**: `useMetabot` returns `null` until the SDK bundle has loaded and `<MetabaseProvider>` has mounted. Always guard before use. If you don't guard it, the first render will throw `Cannot read properties of null` when you reach for `metabot.messages`, `metabot.submitMessage`, etc., because the SDK ships its Metabot internals via a code-split chunk that isn't available synchronously.
- **Bring your own Markdown renderer**: `MetabotQuestion` renders agent text messages internally, including markdown formatting, transcript scrolling, and input styling. The `useMetabot` hook hands you the raw conversation state, which means you own the rendering. In particular, agent text messages (`message.type === 'text'`) contain **markdown**: links, bold, lists, inline code. The snippets above render `message.message` as plain text for brevity, but production usage should pass the text through a markdown renderer (`react-markdown`, `markdown-to-jsx`, or your own) so links and formatting display correctly.
- **Strip links back to Metabase**: the agent text may include links pointing back to the host Metabase, like a link to a chart it created. Those links require an authenticated Metabase session, so people viewing your app won't be able to open them. Strip them out when you render the message, or replace them with a route in your own app.

## Try the AI chat demo

You can check out a [demo of the AI chat component](https://embedded-analytics-sdk-demo.metabase.com/admin/analytics/new/ask-metabot) on our Shoppy demo site.

## Further reading

- [Modular embedding components](./components.md)
- [Metabot](../ai/metabot.md)
- [Metabot settings](../ai/settings.md)
- [Embed a chart](./chart.md)
- [Embed a dashboard](./dashboard.md)
- [Appearance](./appearance.md)
- [Authentication](./authentication.md)
- [Modular embedding SDK](./sdk/introduction.md)
