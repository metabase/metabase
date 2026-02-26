# MetabotChat Component & useMetabot Hook — Usage Instructions

## Overview

The Metabase Embedding SDK provides two complementary ways to integrate AI chat into your application:

| API | Purpose |
|-----|---------|
| `MetabotChat` | Ready-made UI component with chat history, input, and suggestions |
| `useMetabot` | Headless hook for building a fully custom chat UI |

Both require wrapping your app in `<MetabaseProvider>`.

---

## Table of Contents

1. [MetabotChat Component](#metabotchat-component)
   - [Standalone Panel](#standalone-panel)
   - [Floating Action Button (Intercom-style)](#floating-action-button)
   - [Command Bar (AI bar)](#command-bar)
2. [useMetabot Hook](#usemetabot-hook)
   - [API Reference](#api-reference)
   - [Custom Instructions](#custom-instructions)
   - [Building a Custom Chat UI](#building-a-custom-chat-ui)
3. [Theming](#theming)
4. [Constraints](#constraints)

---

## MetabotChat Component

### Import

```tsx
import { MetabotChat } from "@metabase/embedding-sdk-react";
```

`MetabotChat` ships with three layout variants:

| Component | Description |
|-----------|-------------|
| `<MetabotChat>` | Inline chat panel — embed it anywhere |
| `<MetabotChat.FloatingActionButton>` | Intercom-style FAB in the bottom-right corner |
| `<MetabotChat.CommandBar>` | Centered bottom bar that expands into a chat panel |

---

### Standalone Panel

A chat panel you embed directly into your page layout.

#### Basic usage

```tsx
<MetabotChat height={500} width={400} />
```

#### Sidebar layout

```tsx
function App() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <main style={{ flex: 1 }}>
        {/* Your app content */}
      </main>

      <aside style={{ width: 380, borderLeft: "1px solid #eee" }}>
        <MetabotChat height="100%" width="100%" />
      </aside>
    </div>
  );
}
```

#### Full-width bottom drawer

```tsx
function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <main style={{ flex: 1 }}>
        {/* Your app content */}
      </main>

      <MetabotChat height={300} width="100%" />
    </div>
  );
}
```

#### Fixed bottom panel

```tsx
function App() {
  return (
    <>
      {/* Your app content */}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0 }}>
        <MetabotChat height={280} width="100%" />
      </div>
    </>
  );
}
```

#### With custom styling

```tsx
<MetabotChat
  height={500}
  width={400}
  className="my-chat-panel"
  style={{ borderRadius: 16, overflow: "hidden" }}
/>
```

---

### Floating Action Button

An Intercom-style button fixed to the bottom-right corner. Clicking it toggles a floating chat panel.

#### Basic usage

```tsx
function App() {
  return (
    <>
      {/* Your app content */}
      <MetabotChat.FloatingActionButton />
    </>
  );
}
```

#### Custom panel size

```tsx
<MetabotChat.FloatingActionButton panelHeight={600} panelWidth={420} />
```

#### Compact panel for mobile

```tsx
<MetabotChat.FloatingActionButton panelHeight={400} panelWidth={320} />
```

---

### Command Bar

A floating bar centered at the bottom of the viewport. Clicking it expands into a full chat panel. Includes a collapse button to minimize back to the bar.

#### Basic usage

```tsx
function App() {
  return (
    <>
      {/* Your app content */}
      <MetabotChat.CommandBar />
    </>
  );
}
```

#### Custom width and panel height

```tsx
<MetabotChat.CommandBar width={700} panelHeight={500} />
```

#### Narrow command bar

```tsx
<MetabotChat.CommandBar width={400} panelHeight={350} />
```

---

### Props Reference

#### `MetabotChat`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `height` | `CSSProperties["height"]` | — | Height of the panel |
| `width` | `CSSProperties["width"]` | — | Width of the panel |
| `className` | `string` | — | Custom class on root element |
| `style` | `CSSProperties` | — | Custom inline styles on root element |
| `children` | `ReactNode` | — | Override the default chat layout |

#### `MetabotChat.FloatingActionButton`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `panelHeight` | `CSSProperties["height"]` | `500` | Height of the floating chat panel |
| `panelWidth` | `CSSProperties["width"]` | `400` | Width of the floating chat panel |
| `className` | `string` | — | Custom class on root element |
| `style` | `CSSProperties` | — | Custom inline styles on root element |
| `children` | `ReactNode` | — | Override the default chat layout |

#### `MetabotChat.CommandBar`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `panelHeight` | `CSSProperties["height"]` | `400` | Height of the expanded chat panel |
| `width` | `CSSProperties["width"]` | `600` | Width of the command bar and panel |
| `className` | `string` | — | Custom class on root element |
| `style` | `CSSProperties` | — | Custom inline styles on root element |
| `children` | `ReactNode` | — | Override the default chat layout |

---

## useMetabot Hook

A headless hook for full control over Metabot. Use this when you want to build a completely custom chat UI.

### Import

```tsx
import { useMetabot } from "@metabase/embedding-sdk-react";
```

### API Reference

```tsx
const {
  // --- Prompt State ---
  prompt,              // string — current input value
  setPrompt,           // (value: string) => void

  // --- Conversation Actions ---
  submitMessage,       // (message: string) => void — send a message
  retryMessage,        // retry a failed message by ID
  cancelRequest,       // cancel the in-flight request
  resetConversation,   // clear all messages and start over

  // --- Conversation State ---
  messages,            // array of chat messages
  errorMessages,       // array of error messages
  isProcessing,        // boolean — true while Metabot is thinking
  isLongConversation,  // boolean — true when conversation is long
  activeToolCalls,     // currently running tool calls
  reactions,           // navigation suggestions, code edits, etc.

  // --- Visibility ---
  visible,             // boolean — sidebar visibility
  setVisible,          // (visible: boolean) => void

  // --- Custom Instructions ---
  customInstructions,     // string | undefined
  setCustomInstructions,  // (instructions: string | undefined) => void
} = useMetabot();
```

### Custom Instructions

Append instructions to Metabot's system prompt. These appear last in the prompt and take high precedence.

```tsx
function App() {
  const { setCustomInstructions } = useMetabot();

  useEffect(() => {
    setCustomInstructions("Always respond in bullet points. Keep answers under 3 sentences.");
  }, []);

  // ...
}
```

Clear instructions by passing `undefined`:

```tsx
setCustomInstructions(undefined);
```

### Building a Custom Chat UI

#### Minimal chat

```tsx
function MinimalChat() {
  const { messages, submitMessage, isProcessing } = useMetabot();
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim()) {
      submitMessage(input.trim());
      setInput("");
    }
  };

  return (
    <div>
      <div>
        {messages.map((msg) => (
          <div key={msg.id}>{msg.message}</div>
        ))}
        {isProcessing && <div>Thinking...</div>}
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        placeholder="Ask something..."
      />
      <button onClick={handleSend} disabled={isProcessing}>
        Send
      </button>
    </div>
  );
}
```

#### Chat with error handling and cancel

```tsx
function ChatWithControls() {
  const {
    messages,
    errorMessages,
    submitMessage,
    cancelRequest,
    resetConversation,
    isProcessing,
  } = useMetabot();
  const [input, setInput] = useState("");

  return (
    <div>
      {errorMessages.map((err, i) => (
        <div key={i} style={{ color: "red" }}>{err.message}</div>
      ))}

      {messages.map((msg) => (
        <div key={msg.id}>{msg.message}</div>
      ))}

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && input.trim()) {
            submitMessage(input.trim());
            setInput("");
          }
        }}
      />

      {isProcessing ? (
        <button onClick={cancelRequest}>Stop</button>
      ) : (
        <button onClick={() => { submitMessage(input.trim()); setInput(""); }}>
          Send
        </button>
      )}

      <button onClick={resetConversation}>New Chat</button>
    </div>
  );
}
```

#### Custom instructions panel

```tsx
function InstructionsPanel() {
  const { customInstructions, setCustomInstructions } = useMetabot();
  const [draft, setDraft] = useState(customInstructions ?? "");

  return (
    <div>
      <h3>Custom Instructions</h3>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Always respond in bullet points."
      />
      <button onClick={() => setCustomInstructions(draft.trim() || undefined)}>
        Apply
      </button>
      <button onClick={() => { setCustomInstructions(undefined); setDraft(""); }}>
        Clear
      </button>
    </div>
  );
}
```

#### Toggle chat visibility

```tsx
function ChatToggle() {
  const { visible, setVisible } = useMetabot();

  return (
    <button onClick={() => setVisible(!visible)}>
      {visible ? "Hide Chat" : "Show Chat"}
    </button>
  );
}
```

#### Programmatic message submission (e.g. from a button)

```tsx
function QuickActions() {
  const { submitMessage, isProcessing } = useMetabot();

  const prompts = [
    "What were last month's top products?",
    "Show me revenue by region",
    "How is churn trending?",
  ];

  return (
    <div>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          disabled={isProcessing}
          onClick={() => submitMessage(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
```

---

## Theming

MetabotChat respects the SDK theme passed to `<MetabaseProvider>`. To make the chat match a dark application:

```tsx
import { MetabaseProvider, defineMetabaseTheme } from "@metabase/embedding-sdk-react";

const darkTheme = defineMetabaseTheme({
  colors: {
    brand: "#6C5CE7",
    "text-primary": "#E4E5E9",
    "text-secondary": "#8B8F9A",
    "text-tertiary": "#5C6170",
    border: "#2A2E38",
    background: "#13161C",
    "background-secondary": "#1A1D25",
    "background-hover": "#1A1D25",
    positive: "#00D68F",
    negative: "#FF6B6B",
  },
});

function App() {
  return (
    <MetabaseProvider authConfig={authConfig} theme={darkTheme}>
      <MetabotChat.FloatingActionButton />
    </MetabaseProvider>
  );
}
```

---

## Constraints

- Only **one** instance of `MetabotChat` (or its variants) can be rendered at a time. Rendering multiple will trigger a console warning and the duplicate will not render.
- `MetabotChat` requires an **Enterprise** license. In OSS builds the component renders nothing.
- Both `MetabotChat` and `useMetabot` must be used inside a `<MetabaseProvider>`.
- Guest embedding is not supported — the user must be authenticated.
