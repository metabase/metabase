import type { ReactNode } from "react";
import { useState } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { defineMetabaseTheme } from "metabase/embedding-sdk/theme";

import type {
  MetabotAgentChartMessage,
  MetabotMessage,
} from "../../types/metabot";

// ============================================================================
// Shared keyframes
// ============================================================================

export const SharedKeyframes = () => (
  <style>{`
    @keyframes metabotPulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.15); }
    }
    @keyframes metabotFadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes metabotShimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes metabotGlow {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
  `}</style>
);

// ============================================================================
// Icons
// ============================================================================

export const BotIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    <circle cx="7" cy="8.5" r="1.4" fill="currentColor" />
    <circle cx="13" cy="8.5" r="1.4" fill="currentColor" />
    <path
      d="M7 13c0 0 1.5 1.8 3 1.8s3-1.8 3-1.8"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

export const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M14.5 8L2 14V9.5L9 8L2 6.5V2L14.5 8Z" fill="currentColor" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M11 3L3 11M3 3L11 11"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

export const SparkleIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z"
      fill="currentColor"
    />
  </svg>
);

// ============================================================================
// Helpers
// ============================================================================

export const stripMarkdownLinks = (text: string) =>
  text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

const formatTime = () => {
  const d = new Date();
  return `${d.getHours() % 12 || 12}:${d.getMinutes().toString().padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
};

// ============================================================================
// InlineChart
// ============================================================================

export const InlineChart = ({
  Component,
}: {
  Component: MetabotAgentChartMessage["Component"];
}) => (
  <div
    style={{
      height: 500,
      width: "100%",
      flexShrink: 0,
      borderRadius: 8,
      overflow: "hidden",
      margin: "6px 0",
      background: "var(--mb-color-background-secondary)",
    }}
  >
    <Component drills isSaveEnabled={false} height="500px" />
  </div>
);

// ============================================================================
// MessageList
// ============================================================================

export type MessageListPalette = {
  accent: string;
  accentLight: string;
  accentDim: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  textSecondary: string;
  gradient: string;
  red: string;
  redDim: string;
};

export const MessageList = ({
  messages,
  isProcessing,
  scrollRef,
  palette,
}: {
  messages: MetabotMessage[];
  isProcessing: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  palette: MessageListPalette;
}) => (
  <>
    {messages.map((msg) => {
      const isUser = msg.role === "user";

      if (msg.type === "tool_call") {
        return (
          <div
            key={msg.id}
            style={{ padding: "3px 0", animation: "metabotFadeUp 0.2s ease" }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: palette.accentLight,
                background: palette.accentDim,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {msg.status === "started" ? "Running" : "Ran"} {msg.name}
            </span>
          </div>
        );
      }

      if (msg.type === "chart") {
        return <InlineChart key={msg.id} Component={msg.Component} />;
      }

      const content: ReactNode =
        "message" in msg && msg.message ? (
          stripMarkdownLinks(msg.message)
        ) : "payload" in msg && msg.payload ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: 12,
              fontFamily: "monospace",
              color: palette.textSecondary,
            }}
          >
            {JSON.stringify(msg.payload, null, 2)}
          </pre>
        ) : null;

      if (!content) {
        return null;
      }

      return (
        <div
          key={msg.id}
          style={{
            display: "flex",
            gap: 8,
            padding: "6px 0",
            animation: "metabotFadeUp 0.25s ease",
          }}
        >
          {!isUser && (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: palette.gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <BotIcon size={13} />
            </div>
          )}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              ...(isUser ? { textAlign: "right" as const } : {}),
            }}
          >
            <div
              style={{
                display: "inline-block",
                maxWidth: "85%",
                textAlign: "left",
                padding: "7px 12px",
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.45,
                ...(isUser
                  ? {
                      background: palette.accent,
                      color: "#fff",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      background: palette.surfaceRaised,
                      color: palette.text,
                      border: `1px solid ${palette.border}`,
                      borderBottomLeftRadius: 4,
                    }),
              }}
            >
              {content}
            </div>
            <div
              style={{
                fontSize: 10,
                color: palette.textMuted,
                marginTop: 2,
                ...(isUser ? { paddingRight: 2 } : { paddingLeft: 2 }),
              }}
            >
              {formatTime()}
            </div>
          </div>
        </div>
      );
    })}

    {isProcessing && (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 0",
          animation: "metabotFadeUp 0.2s ease",
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: palette.gradient,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            flexShrink: 0,
          }}
        >
          <BotIcon size={13} />
        </div>
        <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
          {[0, 0.15, 0.3].map((delay) => (
            <div
              key={delay}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: palette.accentLight,
                animation: `metabotPulse 1.4s ${delay}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    )}

    <div ref={scrollRef} />
  </>
);

// ============================================================================
// Composer
// ============================================================================

export const Composer = ({
  value,
  onChange,
  onSubmit,
  canSend,
  placeholder,
  onCancel,
  isProcessing,
  palette,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  canSend: boolean;
  placeholder?: string;
  onCancel?: () => void;
  isProcessing: boolean;
  palette: MessageListPalette;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 12px",
      borderTop: `1px solid ${palette.border}`,
      background: palette.surface,
    }}
  >
    <input
      style={{
        flex: 1,
        background: palette.surfaceRaised,
        border: `1px solid ${palette.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        color: palette.text,
        outline: "none",
        fontFamily: "inherit",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && onSubmit()}
      placeholder={placeholder ?? "Ask something..."}
    />
    {isProcessing && onCancel && (
      <button
        onClick={onCancel}
        style={{
          background: palette.redDim,
          border: `1px solid ${palette.red}40`,
          borderRadius: 6,
          padding: "6px 8px",
          color: palette.red,
          cursor: "pointer",
          fontSize: 11,
          fontWeight: 600,
          fontFamily: "inherit",
        }}
      >
        Stop
      </button>
    )}
    <button
      onClick={onSubmit}
      disabled={!canSend}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: "none",
        background: canSend ? palette.accent : palette.surfaceRaised,
        color: canSend ? "#fff" : palette.textMuted,
        cursor: canSend ? "pointer" : "default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
      }}
    >
      <SendIcon />
    </button>
  </div>
);

// ============================================================================
// InstructionsDrawer
// ============================================================================

export const InstructionsDrawer = ({
  customInstructions,
  setCustomInstructions,
  palette,
}: {
  customInstructions: string | undefined;
  setCustomInstructions: (v: string | undefined) => void;
  palette: MessageListPalette;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(customInstructions ?? "");

  return (
    <div
      style={{
        borderTop: `1px solid ${palette.border}`,
        background: palette.surface,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "none",
          border: "none",
          color: customInstructions ? palette.accentLight : palette.textMuted,
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <SparkleIcon size={10} />
        {customInstructions ? "Custom instructions active" : "Add instructions"}
        <span style={{ marginLeft: "auto", fontSize: 10 }}>
          {open ? "Hide" : "Edit"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Always respond in bullet points."
            rows={2}
            style={{
              background: palette.surfaceRaised,
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              color: palette.text,
              outline: "none",
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.4,
            }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            {customInstructions && (
              <button
                onClick={() => {
                  setCustomInstructions(undefined);
                  setDraft("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: palette.textMuted,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Clear
              </button>
            )}
            <button
              onClick={() => {
                setCustomInstructions(draft.trim() || undefined);
                setOpen(false);
              }}
              style={{
                background: palette.accent,
                border: "none",
                borderRadius: 4,
                padding: "3px 12px",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// SDK Wrapper factory
// ============================================================================

// CommonSdkStoryWrapper already handles auth + ComponentProvider + theme via
// Storybook globals. makeSdkWrapper returns it directly; the theme param is
// accepted for call-site compatibility but theme selection is done via globals.
export const makeSdkWrapper = (
  _theme?: ReturnType<typeof defineMetabaseTheme>,
) => CommonSdkStoryWrapper;
