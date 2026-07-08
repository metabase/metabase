---
title: "Modular embedding SDK - AI chat"
summary: Embed an AI chat component in your app that can create queries from natural language questions.
---

# Modular embedding SDK - AI chat

![Embedded AI chat](../images/ai-chat.png)

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true%}

You can embed an AI chat in your application similar to [Metabot](../modular-embedding.md) in Metabase.

Embedded Metabot is a more focused version of [Metabot](../../ai/metabot.md) designed to work well in an embedded context. Embedded Metabot can only display ad-hoc questions and metrics; it doesn't know about dashboards.

To help embedded Metabot more easily find and focus on the data you care about most, select the collection containing the models and metrics it should be able to use to create queries.

If you're embedding the Metabot component in an app, you can specify a different collection that embedded Metabot is allowed to use for creating queries.

## Chat preview

You can check out a [demo of the AI chat component](https://embedded-analytics-sdk-demo.metabase.com/admin/analytics/new/ask-metabot) on our Shoppy demo site.

## Example

```typescript
{% include_file "{{ dirname }}/snippets/questions/ai-question.tsx" %}
```

## Props

{% include_file "{{ dirname }}/api/snippets/MetabotQuestionProps.md" snippet="properties" %}

## API reference

- [Component](./api/MetabotQuestion.html)
- [Props](./api/MetabotQuestionProps.html)

## Setting up AI chat

To configure your embedded AI chat in your Metabase:

1. Click the **grid** icon in the upper right.
2. Select **Admin**.
3. Click the **AI** tab.
4. In the left sidebar, click **Embedded Metabot**.

When embedding the Metabot component in your app, you should specify a collection that embedded Metabot is allowed to use for creating queries. Embedded Metabot will only have access to that collection.

For tips and more, see [Metabot settings](../../ai/settings.md).

## Layout

Use the `layout` prop to specify which layout to use for the Metabot component:

- `auto` (default): Metabot uses the `stacked` layout on mobile screens, and a `sidebar` layout on larger screens.
- `stacked`: the question visualization stacks on top of the chat interface.
- `sidebar`: the question visualization appears to the left of the chat interface, which is on a sidebar on the right.

## Building custom AI chat UIs with `useMetabot`

If `MetabotQuestion`'s built-in layouts don't fit your app, use the `useMetabot` hook to read Metabot's conversation state directly and render your own UI. The hook gives you the messages, the chart the agent most recently produced, processing and error state, and actions to submit, cancel, retry, or reset the conversation.

### AI chat with inline charts

![AI chat inline charts](../images/ai-chat-inline-chart.png)

When an agent responds, the message can contain a `Chart` component. You can walk the agent's messages and render charts inline alongside the chat transcript:

```typescript
{% include_file "{{ dirname }}/snippets/questions/use-metabot-inline-charts.tsx" %}
```

### AI chat with dedicated chart panel

![AI chat dedicated chart](../images/ai-chat-dedicated-chart.png)

The `CurrentChart` component is bound to the latest chart the agent produced. Render `CurrentChart` once, and it will swap in new charts as the agent creates them. You'll want to filter chart messages out of the transcript so they don't render twice:

```typescript
{% include_file "{{ dirname }}/snippets/questions/use-metabot-dedicated-chart.tsx" %}
```

### Notes on `useMetabot`

- **Guard against null while waiting for the SDK bundle**: `useMetabot` returns `null` until the SDK bundle has loaded and `<MetabaseProvider>` has mounted. Always guard before use. If you don't guard it, the first render will throw `Cannot read properties of null` when you reach for `metabot.messages`, `metabot.submitMessage`, etc., because the SDK ships its Metabot internals via a code-split chunk that isn't available synchronously.
- **Bring your own Markdown renderer**: `MetabotQuestion` renders agent text messages internally, including markdown formatting, transcript scrolling, and input styling. The `useMetabot` hook hands you the raw conversation state, which means you own the rendering. In particular, agent text messages (`message.type === 'text'`) contain **markdown**: links, bold, lists, inline code. The snippets above render `message.message` as plain text for brevity, but production usage should pass the text through a markdown renderer (`react-markdown`, `markdown-to-jsx`, or your own) so links and formatting display correctly.
- **Strip links returned by the agent**: the agent text may include links pointing back to the host Metabase (like a link to a chart it created). Those links require an authenticated Metabase session, so people won't be able to view the links.
