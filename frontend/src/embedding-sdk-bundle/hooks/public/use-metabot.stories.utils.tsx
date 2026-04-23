import type { ReactNode } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import type { defineMetabaseTheme } from "metabase/embedding-sdk/theme";

import type { MetabotMessage } from "../../types/metabot";

type ChartComponent = Extract<MetabotMessage, { type: "chart" }>["Chart"];

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

export const InlineChart = ({ Component }: { Component: ChartComponent }) => (
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
  onRetry,
}: {
  messages: MetabotMessage[];
  isProcessing: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  palette: MessageListPalette;
  onRetry?: (messageId: string) => void;
}) => (
  <>
    {messages.map((message) => {
      const isUser = message.role === "user";

      if (message.type === "chart") {
        return <InlineChart key={message.id} Component={message.Chart} />;
      }

      const content: ReactNode =
        message.type === "text" && message.message
          ? stripMarkdownLinks(message.message)
          : null;

      if (!content) {
        return null;
      }

      return (
        <div
          key={message.id}
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
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10,
                color: palette.textMuted,
                marginTop: 2,
                ...(isUser
                  ? { justifyContent: "flex-end", paddingRight: 2 }
                  : { paddingLeft: 2 }),
              }}
            >
              <span>{formatTime()}</span>
              {!isUser && onRetry && !isProcessing && (
                <button
                  onClick={() => onRetry(message.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: palette.textMuted,
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "inherit",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Retry
                </button>
              )}
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
  onChange: (value: string) => void;
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
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => event.key === "Enter" && onSubmit()}
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
// SDK Wrapper factory
// ============================================================================

// CommonSdkStoryWrapper already handles auth + ComponentProvider + theme via
// Storybook globals. makeSdkWrapper returns it directly; the theme param is
// accepted for call-site compatibility but theme selection is done via globals.
export const makeSdkWrapper = (
  _theme?: ReturnType<typeof defineMetabaseTheme>,
) => CommonSdkStoryWrapper;
