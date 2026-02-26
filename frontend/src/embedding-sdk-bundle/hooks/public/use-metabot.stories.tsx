import type { Meta, StoryFn } from "@storybook/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { CommonSdkStoryWrapper } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";

import { useMetabot } from "./use-metabot";

// ============================================================================
// Shared dark SaaS palette
// ============================================================================

const dk = {
  bg: "#0B0D11",
  surface: "#13161C",
  surfaceRaised: "#1A1D25",
  surfaceHover: "#22262F",
  border: "#2A2E38",
  borderSubtle: "#1F222A",
  text: "#E4E5E9",
  textSecondary: "#8B8F9A",
  textMuted: "#5C6170",
  accent: "#6C5CE7",
  accentLight: "#A29BFE",
  accentDim: "#6C5CE730",
  green: "#00D68F",
  greenDim: "#00D68F25",
  red: "#FF6B6B",
  redDim: "#FF6B6B20",
  yellow: "#FECA57",
  gradient: "linear-gradient(135deg, #6C5CE7 0%, #A29BFE 50%, #74B9FF 100%)",
  gradientSubtle:
    "linear-gradient(135deg, #6C5CE740 0%, #A29BFE40 50%, #74B9FF40 100%)",
};

// ============================================================================
// Shared keyframes
// ============================================================================

const SharedKeyframes = () => (
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
// Shared icons
// ============================================================================

const BotIcon = ({ size = 18 }: { size?: number }) => (
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

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M14.5 8L2 14V9.5L9 8L2 6.5V2L14.5 8Z" fill="currentColor" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path
      d="M11 3L3 11M3 3L11 11"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const SparkleIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z"
      fill="currentColor"
    />
  </svg>
);

// ============================================================================
// Shared: message list renderer
// ============================================================================

type MetabotMessage = {
  id: string;
  role: "user" | "agent";
  type: string;
  message?: string;
  name?: string;
  args?: string;
  status?: string;
  payload?: unknown;
};

const formatTime = () => {
  const d = new Date();
  return `${d.getHours() % 12 || 12}:${d.getMinutes().toString().padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
};

const MessageList = ({
  messages,
  isProcessing,
  scrollRef,
}: {
  messages: MetabotMessage[];
  isProcessing: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
}) => (
  <>
    {messages.map((msg) => {
      const isUser = msg.role === "user";

      if (msg.type === "tool_call") {
        return (
          <div
            key={msg.id}
            style={{
              padding: "3px 0",
              animation: "metabotFadeUp 0.2s ease",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: dk.accentLight,
                background: dk.accentDim,
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              {(msg as MetabotMessage & { status: string }).status === "started"
                ? "Running"
                : "Ran"}{" "}
              {msg.name}
            </span>
          </div>
        );
      }

      const content: ReactNode =
        "message" in msg && msg.message ? (
          msg.message
        ) : "payload" in msg && msg.payload ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: 12,
              fontFamily: "monospace",
              color: dk.textSecondary,
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
                background: dk.gradient,
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
                      background: dk.accent,
                      color: "#fff",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      background: dk.surfaceRaised,
                      color: dk.text,
                      border: `1px solid ${dk.border}`,
                      borderBottomLeftRadius: 4,
                    }),
              }}
            >
              {content}
            </div>
            <div
              style={{
                fontSize: 10,
                color: dk.textMuted,
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
            background: dk.gradient,
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
                background: dk.accentLight,
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
// Shared: composer bar
// ============================================================================

const Composer = ({
  value,
  onChange,
  onSubmit,
  canSend,
  placeholder,
  onCancel,
  isProcessing,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  canSend: boolean;
  placeholder?: string;
  onCancel?: () => void;
  isProcessing: boolean;
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "8px 12px",
      borderTop: `1px solid ${dk.border}`,
      background: dk.surface,
    }}
  >
    <input
      style={{
        flex: 1,
        background: dk.surfaceRaised,
        border: `1px solid ${dk.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        color: dk.text,
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
          background: dk.redDim,
          border: `1px solid ${dk.red}40`,
          borderRadius: 6,
          padding: "6px 8px",
          color: dk.red,
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
        background: canSend ? dk.accent : dk.surfaceHover,
        color: canSend ? "#fff" : dk.textMuted,
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
// Shared: custom instructions drawer (collapsible)
// ============================================================================

const InstructionsDrawer = ({
  customInstructions,
  setCustomInstructions,
}: {
  customInstructions: string | undefined;
  setCustomInstructions: (v: string | undefined) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(customInstructions ?? "");

  return (
    <div
      style={{
        borderTop: `1px solid ${dk.border}`,
        background: dk.surface,
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
          color: customInstructions ? dk.accentLight : dk.textMuted,
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
              background: dk.surfaceRaised,
              border: `1px solid ${dk.border}`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 12,
              color: dk.text,
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
                  color: dk.textMuted,
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
                background: dk.accent,
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
// Fake SaaS page background
// ============================================================================

const SaasPageBg = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: dk.bg,
      overflow: "hidden",
      zIndex: 0,
    }}
  >
    {/* Fake nav */}
    <div
      style={{
        height: 48,
        borderBottom: `1px solid ${dk.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 15, color: dk.text }}>
        <span style={{ color: dk.accent }}>Acme</span> Analytics
      </span>
      {["Dashboard", "Reports", "Data", "Settings"].map((t) => (
        <span
          key={t}
          style={{ fontSize: 13, color: dk.textSecondary, cursor: "pointer" }}
        >
          {t}
        </span>
      ))}
    </div>
    {/* Fake cards */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 16,
        padding: "24px",
        maxWidth: 900,
      }}
    >
      {[
        ["Revenue", "$1.24M", "+12.3%"],
        ["Users", "48.2K", "+8.7%"],
        ["Churn", "2.1%", "-0.4%"],
      ].map(([label, val, delta]) => (
        <div
          key={label}
          style={{
            background: dk.surface,
            border: `1px solid ${dk.border}`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 12, color: dk.textMuted }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: dk.text }}>
            {val}
          </div>
          <div
            style={{
              fontSize: 12,
              color: delta?.startsWith("-") ? dk.red : dk.green,
              marginTop: 4,
            }}
          >
            {delta}
          </div>
        </div>
      ))}
    </div>
    {/* Fake table */}
    <div style={{ padding: "0 24px" }}>
      <div
        style={{
          background: dk.surface,
          border: `1px solid ${dk.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {["Top Customers", "Recent Orders", "Pipeline", "Activity"].map(
          (row, i) => (
            <div
              key={row}
              style={{
                padding: "12px 20px",
                borderBottom: i < 3 ? `1px solid ${dk.borderSubtle}` : "none",
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                color: dk.textSecondary,
              }}
            >
              <span>{row}</span>
              <span style={{ color: dk.textMuted }}>View &rarr;</span>
            </div>
          ),
        )}
      </div>
    </div>
  </div>
);

// ============================================================================
// STORY 1: Intercom-style floating bubble
// ============================================================================

const IntercomDemo = () => {
  const metabot = useMetabot();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [metabot.messages, metabot.isProcessing]);

  const handleSubmit = () => {
    if (inputValue.trim() && !metabot.isProcessing) {
      metabot.submitMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const canSend = inputValue.trim().length > 0 && !metabot.isProcessing;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <SharedKeyframes />
      <SaasPageBg />

      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 16,
            border: "none",
            background: dk.gradient,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 4px 24px ${dk.accent}50, 0 0 0 1px ${dk.accent}30`,
            zIndex: 1000,
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <BotIcon size={26} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 380,
            height: 560,
            borderRadius: 16,
            background: dk.surface,
            border: `1px solid ${dk.border}`,
            boxShadow: `0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px ${dk.border}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 1000,
            animation: "metabotFadeUp 0.25s ease",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              background: dk.surfaceRaised,
              borderBottom: `1px solid ${dk.border}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: dk.gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <BotIcon size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: dk.text,
                }}
              >
                Metabot
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: metabot.isProcessing ? dk.green : dk.textMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: metabot.isProcessing ? dk.green : dk.textMuted,
                  }}
                />
                {metabot.isProcessing ? "Thinking..." : "Online"}
              </div>
            </div>
            <button
              onClick={() => metabot.resetConversation()}
              style={{
                background: "none",
                border: "none",
                color: dk.textMuted,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: dk.textSecondary,
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Errors */}
          {metabot.errorMessages.map((err, i) => (
            <div
              key={i}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                color: dk.red,
                background: dk.redDim,
                borderBottom: `1px solid ${dk.red}20`,
              }}
            >
              {err.message}
            </div>
          ))}

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
            }}
          >
            {metabot.messages.length === 0 && !metabot.isProcessing && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 10,
                  color: dk.textMuted,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: dk.gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                  }}
                >
                  <BotIcon size={24} />
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: dk.text,
                  }}
                >
                  Ask Metabot anything
                </div>
                <div style={{ fontSize: 12, maxWidth: 240 }}>
                  Get insights from your data, explore dashboards, or ask
                  questions in plain English.
                </div>
              </div>
            )}
            <MessageList
              messages={metabot.messages as MetabotMessage[]}
              isProcessing={metabot.isProcessing}
              scrollRef={scrollRef}
            />
          </div>

          {/* Instructions */}
          <InstructionsDrawer
            customInstructions={metabot.customInstructions}
            setCustomInstructions={metabot.setCustomInstructions}
          />

          {/* Composer */}
          <Composer
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            canSend={canSend}
            placeholder="Ask a question..."
            onCancel={metabot.cancelRequest}
            isProcessing={metabot.isProcessing}
          />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STORY 2: Floating AI bar that expands into a chat panel
// ============================================================================

const AiBarDemo = () => {
  const metabot = useMetabot();
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [metabot.messages, metabot.isProcessing]);

  const handleSubmit = () => {
    if (inputValue.trim() && !metabot.isProcessing) {
      metabot.submitMessage(inputValue.trim());
      setInputValue("");
      if (!expanded) {
        setExpanded(true);
      }
    }
  };

  const canSend = inputValue.trim().length > 0 && !metabot.isProcessing;

  // Collapsed: floating bar
  // Expanded: full chat panel

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <SharedKeyframes />
      <SaasPageBg />

      {/* Floating container */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          ...(expanded
            ? {
                width: 520,
                height: 500,
              }
            : {
                width: 480,
                height: "auto",
              }),
        }}
      >
        {/* Glow effect behind the bar (collapsed only) */}
        {!expanded && (
          <div
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: 18,
              background: dk.gradient,
              opacity: 0.35,
              filter: "blur(8px)",
              animation: "metabotGlow 3s ease infinite",
              pointerEvents: "none",
            }}
          />
        )}

        <div
          style={{
            position: "relative",
            borderRadius: expanded ? 16 : 16,
            background: dk.surface,
            border: `1px solid ${dk.border}`,
            boxShadow: expanded
              ? `0 24px 80px rgba(0,0,0,0.5)`
              : `0 8px 40px rgba(0,0,0,0.4)`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            height: expanded ? 500 : "auto",
            transition: "height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Gradient border shimmer (collapsed) */}
          {!expanded && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 16,
                border: "1px solid transparent",
                background: `linear-gradient(${dk.surface}, ${dk.surface}) padding-box, ${dk.gradient} border-box`,
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          )}

          {expanded ? (
            <>
              {/* ---- Expanded: Header ---- */}
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: `1px solid ${dk.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 0,
                  background: dk.surfaceRaised,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: dk.gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                  }}
                >
                  <BotIcon size={14} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: dk.text,
                    }}
                  >
                    Metabot
                  </div>
                </div>
                <button
                  onClick={() => metabot.resetConversation()}
                  style={{
                    background: "none",
                    border: "none",
                    color: dk.textMuted,
                    fontSize: 11,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => setExpanded(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: dk.textSecondary,
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                  }}
                >
                  <CloseIcon />
                </button>
              </div>

              {/* Errors */}
              {metabot.errorMessages.map((err, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    color: dk.red,
                    background: dk.redDim,
                    borderBottom: `1px solid ${dk.red}20`,
                  }}
                >
                  {err.message}
                </div>
              ))}

              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "10px 14px",
                }}
              >
                {metabot.messages.length === 0 && !metabot.isProcessing && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      gap: 8,
                      color: dk.textMuted,
                      textAlign: "center",
                      fontSize: 13,
                    }}
                  >
                    <SparkleIcon size={20} />
                    Ask about your data, metrics, or dashboards.
                  </div>
                )}
                <MessageList
                  messages={metabot.messages as MetabotMessage[]}
                  isProcessing={metabot.isProcessing}
                  scrollRef={scrollRef}
                />
              </div>

              {/* Instructions */}
              <InstructionsDrawer
                customInstructions={metabot.customInstructions}
                setCustomInstructions={metabot.setCustomInstructions}
              />

              {/* Composer */}
              <Composer
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                canSend={canSend}
                placeholder="Follow up..."
                onCancel={metabot.cancelRequest}
                isProcessing={metabot.isProcessing}
              />
            </>
          ) : (
            /* ---- Collapsed: AI bar ---- */
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 6px 6px 14px",
                position: "relative",
                zIndex: 2,
                cursor: "text",
              }}
              onClick={() => {
                const input = document.getElementById("aibar-input");
                input?.focus();
              }}
            >
              <div
                style={{
                  color: dk.accentLight,
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <SparkleIcon size={16} />
              </div>
              <input
                id="aibar-input"
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: 14,
                  color: dk.text,
                  fontFamily: "inherit",
                  padding: "8px 0",
                }}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                onFocus={() => {
                  // if there are messages, expand to show them
                  if (metabot.messages.length > 0) {
                    setExpanded(true);
                  }
                }}
                placeholder="Ask Metabot about your data..."
              />
              {metabot.messages.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(true);
                  }}
                  style={{
                    background: dk.surfaceHover,
                    border: `1px solid ${dk.border}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    color: dk.textSecondary,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {metabot.messages.length} msg
                  {metabot.messages.length !== 1 ? "s" : ""}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleSubmit();
                }}
                disabled={!canSend}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: "none",
                  background: canSend ? dk.accent : dk.surfaceHover,
                  color: canSend ? "#fff" : dk.textMuted,
                  cursor: canSend ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                <SendIcon />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Storybook exports
// ============================================================================

export default {
  title: "EmbeddingSDK/useMetabot",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [CommonSdkStoryWrapper],
} satisfies Meta;

export const Intercom: StoryFn = () => <IntercomDemo />;
export const FloatingAIBar: StoryFn = () => <AiBarDemo />;

// ============================================================================
// Slack palette
// ============================================================================

const sl = {
  bg: "#1A1D21",
  sidebar: "#19171D",
  sidebarHover: "#27242C",
  sidebarActive: "#1164A3",
  sidebarText: "#CFD0D2",
  sidebarTextMuted: "#9B9C9E",
  channel: "#FFFFFF",
  surface: "#222529",
  surfaceRaised: "#2C2D30",
  border: "#393A3D",
  text: "#D1D2D3",
  textSecondary: "#ABABAD",
  textMuted: "#757577",
  accent: "#1264A3",
  accentHover: "#0D5A94",
  green: "#007A5A",
  greenLight: "#2BAC76",
  link: "#1D9BD1",
  yellow: "#ECB22E",
  red: "#E01E5A",
};

// ============================================================================
// STORY 3: Slack-style layout — sidebar + channel thread
// ============================================================================

const SlackDemo = () => {
  const metabot = useMetabot();
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeChannel, setActiveChannel] = useState("metabot");

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [metabot.messages, metabot.isProcessing]);

  const handleSubmit = () => {
    if (inputValue.trim() && !metabot.isProcessing) {
      metabot.submitMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const canSend = inputValue.trim().length > 0 && !metabot.isProcessing;

  const channels = [
    { name: "general", unread: false },
    { name: "data-requests", unread: true },
    { name: "metabot", unread: false, isBot: true },
    { name: "eng-analytics", unread: false },
    { name: "revenue-alerts", unread: true },
  ];

  const dms = [
    { name: "Sarah Chen", status: "active" },
    { name: "Alex Rivera", status: "away" },
    { name: "Metabot", status: "active", isBot: true },
  ];

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        fontFamily:
          '"Lato", "Noto Sans", -apple-system, BlinkMacSystemFont, sans-serif',
        background: sl.bg,
        color: sl.text,
      }}
    >
      <SharedKeyframes />

      {/* ---- Sidebar ---- */}
      <div
        style={{
          width: 260,
          background: sl.sidebar,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          borderRight: `1px solid ${sl.border}`,
        }}
      >
        {/* Workspace header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${sl.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: sl.green,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>
              Acme Corp
            </div>
          </div>
        </div>

        {/* Channels */}
        <div style={{ padding: "12px 0", flex: 1, overflowY: "auto" }}>
          <div
            style={{
              padding: "0 16px 6px",
              fontSize: 13,
              fontWeight: 700,
              color: sl.sidebarTextMuted,
            }}
          >
            Channels
          </div>
          {channels.map((ch) => (
            <div
              key={ch.name}
              onClick={() => setActiveChannel(ch.name)}
              style={{
                padding: "4px 16px 4px 22px",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                background:
                  activeChannel === ch.name
                    ? sl.sidebarActive
                    : "transparent",
                color:
                  activeChannel === ch.name
                    ? "#fff"
                    : ch.unread
                      ? "#fff"
                      : sl.sidebarText,
                fontWeight: ch.unread || activeChannel === ch.name ? 700 : 400,
                borderRadius: 6,
                margin: "0 8px",
              }}
            >
              <span style={{ color: sl.sidebarTextMuted, fontSize: 14 }}>
                {ch.isBot ? (
                  <BotIcon size={14} />
                ) : (
                  "#"
                )}
              </span>
              {ch.name}
              {ch.unread && activeChannel !== ch.name && (
                <div
                  style={{
                    marginLeft: "auto",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: sl.red,
                  }}
                />
              )}
            </div>
          ))}

          <div
            style={{
              padding: "12px 16px 6px",
              fontSize: 13,
              fontWeight: 700,
              color: sl.sidebarTextMuted,
            }}
          >
            Direct Messages
          </div>
          {dms.map((dm) => (
            <div
              key={dm.name}
              style={{
                padding: "4px 16px 4px 22px",
                fontSize: 14,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: sl.sidebarText,
                borderRadius: 6,
                margin: "0 8px",
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    dm.status === "active" ? sl.greenLight : sl.textMuted,
                  flexShrink: 0,
                }}
              />
              {dm.name}
              {dm.isBot && (
                <span
                  style={{
                    fontSize: 10,
                    background: sl.surfaceRaised,
                    color: sl.textMuted,
                    padding: "1px 5px",
                    borderRadius: 3,
                    fontWeight: 700,
                  }}
                >
                  BOT
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ---- Main channel area ---- */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Channel header */}
        <div
          style={{
            padding: "10px 20px",
            borderBottom: `1px solid ${sl.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <BotIcon size={18} />
          <span style={{ fontSize: 16, fontWeight: 900, color: "#fff" }}>
            metabot
          </span>
          <span
            style={{
              fontSize: 10,
              background: sl.green,
              color: "#fff",
              padding: "2px 6px",
              borderRadius: 3,
              fontWeight: 700,
            }}
          >
            AI
          </span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 12,
              color: sl.textMuted,
              fontSize: 13,
            }}
          >
            <span
              onClick={() => metabot.resetConversation()}
              style={{ cursor: "pointer" }}
            >
              Clear
            </span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {metabot.messages.length === 0 && !metabot.isProcessing && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  background: sl.green,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                <BotIcon size={32} />
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 900,
                  color: "#fff",
                  marginBottom: 4,
                }}
              >
                This is the beginning of your conversation with Metabot
              </div>
              <div style={{ color: sl.textMuted, fontSize: 14 }}>
                Ask questions about your data in plain English.
              </div>
            </div>
          )}

          {(metabot.messages as MetabotMessage[]).map((msg) => {
            const isUser = msg.role === "user";

            if (msg.type === "tool_call") {
              return (
                <div
                  key={msg.id}
                  style={{
                    padding: "2px 0 2px 52px",
                    fontSize: 12,
                    color: sl.textMuted,
                    fontStyle: "italic",
                  }}
                >
                  {msg.status === "started" ? "Running" : "Ran"} {msg.name}
                </div>
              );
            }

            const content =
              "message" in msg && msg.message
                ? msg.message
                : "payload" in msg && msg.payload
                  ? JSON.stringify(msg.payload, null, 2)
                  : null;

            if (!content) {
              return null;
            }

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "8px 0",
                  animation: "metabotFadeUp 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    background: isUser ? sl.accent : sl.green,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                    fontSize: 14,
                    fontWeight: 900,
                  }}
                >
                  {isUser ? "Y" : <BotIcon size={18} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 900,
                        color: "#fff",
                      }}
                    >
                      {isUser ? "You" : "Metabot"}
                    </span>
                    <span
                      style={{ fontSize: 11, color: sl.textMuted }}
                    >
                      {formatTime()}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: sl.text,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {content}
                  </div>
                </div>
              </div>
            );
          })}

          {metabot.isProcessing && (
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "8px 0",
                animation: "metabotFadeUp 0.2s ease",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  background: sl.green,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                <BotIcon size={18} />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "10px 0",
                }}
              >
                {[0, 0.15, 0.3].map((delay) => (
                  <div
                    key={delay}
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: sl.textMuted,
                      animation: `metabotPulse 1.4s ${delay}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>

        {/* Errors */}
        {metabot.errorMessages.map((err, i) => (
          <div
            key={i}
            style={{
              padding: "6px 20px",
              fontSize: 13,
              color: sl.red,
              background: `${sl.red}15`,
              borderTop: `1px solid ${sl.border}`,
            }}
          >
            {err.message}
          </div>
        ))}

        {/* Composer */}
        <div style={{ padding: "0 20px 20px" }}>
          <div
            style={{
              border: `1px solid ${sl.border}`,
              borderRadius: 8,
              background: sl.surface,
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  padding: "10px 14px",
                  fontSize: 14,
                  color: sl.text,
                  fontFamily: "inherit",
                }}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Message #metabot"
              />
              {metabot.isProcessing && (
                <button
                  onClick={metabot.cancelRequest}
                  style={{
                    background: "none",
                    border: "none",
                    color: sl.red,
                    cursor: "pointer",
                    padding: "0 8px",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "inherit",
                  }}
                >
                  Stop
                </button>
              )}
            </div>
            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "4px 8px",
                borderTop: `1px solid ${sl.border}`,
                gap: 2,
              }}
            >
              <div style={{ flex: 1 }} />
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  border: "none",
                  background: canSend ? sl.green : "transparent",
                  color: canSend ? "#fff" : sl.textMuted,
                  cursor: canSend ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.1s",
                }}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Teams palette
// ============================================================================

const tm = {
  bg: "#292929",
  sidebar: "#1F1F1F",
  sidebarHover: "#3D3D3D",
  sidebarActive: "#4F4F4F",
  surface: "#292929",
  surfaceRaised: "#3D3D3D",
  border: "#404040",
  text: "#FFFFFF",
  textSecondary: "#D6D6D6",
  textMuted: "#ADADAD",
  accent: "#6264A7",
  accentLight: "#7B83EB",
  purple: "#6264A7",
  purpleLight: "#8B8CC7",
  compose: "#323232",
  composeBorder: "#5B5FC7",
};

// ============================================================================
// STORY 4: Microsoft Teams-style layout
// ============================================================================

const TeamsDemo = () => {
  const metabot = useMetabot();
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("chat");

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [metabot.messages, metabot.isProcessing]);

  const handleSubmit = () => {
    if (inputValue.trim() && !metabot.isProcessing) {
      metabot.submitMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const canSend = inputValue.trim().length > 0 && !metabot.isProcessing;

  const navItems = [
    { icon: "💬", label: "Chat", id: "chat" },
    { icon: "👥", label: "Teams", id: "teams" },
    { icon: "📅", label: "Calendar", id: "calendar" },
    { icon: "📞", label: "Calls", id: "calls" },
    { icon: "📁", label: "Files", id: "files" },
  ];

  const recentChats = [
    { name: "Product Team", preview: "Let's review the sprint...", time: "2m", unread: true },
    { name: "Metabot", preview: "Revenue is up 12.3%", time: "15m", isBot: true },
    { name: "Design Review", preview: "Looks great!", time: "1h", unread: false },
    { name: "Sarah Chen", preview: "Can you check the query?", time: "3h", unread: false },
  ];

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        fontFamily:
          '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
        background: tm.bg,
        color: tm.text,
      }}
    >
      <SharedKeyframes />

      {/* ---- Left rail (icon nav) ---- */}
      <div
        style={{
          width: 68,
          background: tm.sidebar,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 8,
          gap: 4,
          flexShrink: 0,
          borderRight: `1px solid ${tm.border}`,
        }}
      >
        {navItems.map((item) => (
          <div
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background:
                activeTab === item.id ? tm.sidebarActive : "transparent",
              position: "relative",
            }}
          >
            {activeTab === item.id && (
              <div
                style={{
                  position: "absolute",
                  left: -10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 20,
                  borderRadius: 2,
                  background: tm.accentLight,
                }}
              />
            )}
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span
              style={{
                fontSize: 9,
                color: tm.textMuted,
                marginTop: 1,
              }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* ---- Chat list panel ---- */}
      <div
        style={{
          width: 300,
          background: tm.sidebar,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          borderRight: `1px solid ${tm.border}`,
        }}
      >
        <div
          style={{
            padding: "14px 16px 8px",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          Chat
        </div>

        {/* Search */}
        <div style={{ padding: "4px 12px 8px" }}>
          <div
            style={{
              background: tm.surfaceRaised,
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 13,
              color: tm.textMuted,
            }}
          >
            Search or type a command
          </div>
        </div>

        {/* Recent */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              padding: "8px 16px 4px",
              fontSize: 12,
              fontWeight: 700,
              color: tm.textMuted,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Recent
          </div>
          {recentChats.map((chat) => (
            <div
              key={chat.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                cursor: "pointer",
                background:
                  chat.isBot ? tm.sidebarActive : "transparent",
                borderRadius: 4,
                margin: "0 8px",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: chat.isBot ? tm.purple : tm.surfaceRaised,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {chat.isBot ? (
                  <BotIcon size={18} />
                ) : (
                  chat.name[0]
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: chat.unread ? 700 : 400,
                      color: tm.text,
                    }}
                  >
                    {chat.name}
                  </span>
                  <span
                    style={{ fontSize: 11, color: tm.textMuted }}
                  >
                    {chat.time}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: tm.textMuted,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chat.preview}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Main conversation ---- */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div
          style={{
            padding: "12px 20px",
            borderBottom: `1px solid ${tm.border}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: tm.purple,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <BotIcon size={16} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Metabot</div>
            <div style={{ fontSize: 11, color: tm.textMuted }}>
              {metabot.isProcessing ? "Typing..." : "AI Assistant"}
            </div>
          </div>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
            }}
          >
            <button
              onClick={() => metabot.resetConversation()}
              style={{
                background: tm.surfaceRaised,
                border: `1px solid ${tm.border}`,
                borderRadius: 4,
                padding: "4px 12px",
                color: tm.textSecondary,
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              New chat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px" }}>
          {metabot.messages.length === 0 && !metabot.isProcessing && (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${tm.purple}, ${tm.accentLight})`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  marginBottom: 16,
                }}
              >
                <BotIcon size={36} />
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                Metabot
              </div>
              <div
                style={{
                  color: tm.textMuted,
                  fontSize: 14,
                  maxWidth: 340,
                  margin: "0 auto",
                  lineHeight: 1.5,
                }}
              >
                Your AI assistant for exploring data. Ask about metrics,
                dashboards, or write queries in plain English.
              </div>
            </div>
          )}

          {(metabot.messages as MetabotMessage[]).map((msg) => {
            const isUser = msg.role === "user";

            if (msg.type === "tool_call") {
              return (
                <div
                  key={msg.id}
                  style={{
                    padding: "2px 0 2px 48px",
                    fontSize: 12,
                    color: tm.textMuted,
                    fontStyle: "italic",
                  }}
                >
                  {msg.status === "started" ? "Processing" : "Completed"}{" "}
                  {msg.name}
                </div>
              );
            }

            const content =
              "message" in msg && msg.message
                ? msg.message
                : "payload" in msg && msg.payload
                  ? JSON.stringify(msg.payload, null, 2)
                  : null;

            if (!content) {
              return null;
            }

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "6px 0",
                  animation: "metabotFadeUp 0.2s ease",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: isUser ? tm.surfaceRaised : tm.purple,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {isUser ? "Y" : <BotIcon size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {isUser ? "You" : "Metabot"}
                    </span>
                    <span
                      style={{ fontSize: 11, color: tm.textMuted }}
                    >
                      {formatTime()}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: tm.textSecondary,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {content}
                  </div>
                </div>
              </div>
            );
          })}

          {metabot.isProcessing && (
            <div
              style={{
                display: "flex",
                gap: 12,
                padding: "6px 0",
                animation: "metabotFadeUp 0.2s ease",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: tm.purple,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                <BotIcon size={16} />
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "10px 0",
                }}
              >
                {[0, 0.15, 0.3].map((delay) => (
                  <div
                    key={delay}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: tm.purpleLight,
                      animation: `metabotPulse 1.4s ${delay}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>

        {/* Errors */}
        {metabot.errorMessages.map((err, i) => (
          <div
            key={i}
            style={{
              padding: "6px 20px",
              fontSize: 13,
              color: "#F85149",
              background: "#F8514915",
            }}
          >
            {err.message}
          </div>
        ))}

        {/* Compose box */}
        <div style={{ padding: "0 20px 16px" }}>
          <div
            style={{
              border: `2px solid ${tm.border}`,
              borderRadius: 4,
              background: tm.compose,
              overflow: "hidden",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = tm.composeBorder;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = tm.border;
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  padding: "12px 14px",
                  fontSize: 14,
                  color: tm.text,
                  fontFamily: "inherit",
                }}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Type a new message"
              />
            </div>
            {/* Toolbar row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "4px 10px 6px",
                gap: 4,
              }}
            >
              <div style={{ flex: 1 }} />
              {metabot.isProcessing && (
                <button
                  onClick={metabot.cancelRequest}
                  style={{
                    background: "none",
                    border: `1px solid ${tm.border}`,
                    borderRadius: 4,
                    padding: "3px 10px",
                    color: tm.textMuted,
                    cursor: "pointer",
                    fontSize: 12,
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                style={{
                  width: 32,
                  height: 28,
                  borderRadius: 4,
                  border: "none",
                  background: canSend ? tm.purple : "transparent",
                  color: canSend ? "#fff" : tm.textMuted,
                  cursor: canSend ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.1s",
                }}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Slack: StoryFn = () => <SlackDemo />;
export const MicrosoftTeams: StoryFn = () => <TeamsDemo />;
