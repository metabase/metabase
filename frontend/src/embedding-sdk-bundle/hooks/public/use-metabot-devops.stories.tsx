import type { Meta, StoryFn } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import { useMetabot } from "./use-metabot";
import {
  CloseIcon,
  MessageList,
  SharedKeyframes,
  SparkleIcon,
  makeSdkWrapper,
} from "./use-metabot.stories.utils";

// ============================================================================
// DevOps (InfraWatch) palette
// ============================================================================

const dv = {
  bg: "#1b1e2e",
  surface: "#20243a",
  surfaceRaised: "#272b42",
  surfaceHover: "#2f3450",
  border: "#363b5a",
  borderSubtle: "#2a2f4a",
  text: "#e2e4f0",
  textSecondary: "#8b90b0",
  textMuted: "#585d7e",
  accent: "#774aa4",
  accentLight: "#b39ddb",
  accentDim: "#774aa425",
  gradient: "linear-gradient(135deg, #774aa4 0%, #b39ddb 100%)",
  red: "#f87171",
  redDim: "#f8717120",
};

// ============================================================================
// Fake InfraWatch monitoring background
// ============================================================================

const InfraWatchBg = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: dv.bg,
      overflow: "hidden",
      zIndex: 0,
    }}
  >
    {/* Top nav */}
    <div
      style={{
        height: 44,
        borderBottom: `1px solid ${dv.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 20,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 14, color: dv.accentLight }}>
        InfraWatch
      </span>
      {["Dashboards", "Monitors", "APM", "Logs", "Infrastructure"].map((t) => (
        <span
          key={t}
          style={{ fontSize: 12, color: dv.textSecondary, cursor: "pointer" }}
        >
          {t}
        </span>
      ))}
      <span style={{ marginLeft: "auto", fontSize: 12, color: dv.textMuted }}>
        Press ⌘K to open Metabot
      </span>
    </div>
    {/* Alert list */}
    <div style={{ padding: "20px 24px" }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: dv.text,
          marginBottom: 16,
        }}
      >
        Active monitors
      </div>
      {[
        ["P1", "API error rate > 5%", "web-api", "3m ago", true],
        ["P2", "CPU usage > 90%", "worker-fleet", "12m ago", true],
        ["P3", "Memory spike", "cache-cluster", "1h ago", false],
        ["P3", "Latency p99 > 800ms", "checkout-service", "2h ago", false],
      ].map(([prio, name, service, time, active]) => (
        <div
          key={String(name)}
          style={{
            background: dv.surface,
            border: `1px solid ${active ? dv.red + "50" : dv.border}`,
            borderLeft: `4px solid ${active ? dv.red : dv.textMuted}`,
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: active ? dv.red : dv.textMuted,
              background: dv.surfaceRaised,
              padding: "2px 6px",
              borderRadius: 4,
            }}
          >
            {String(prio)}
          </span>
          <span style={{ flex: 1, color: dv.text }}>{String(name)}</span>
          <span style={{ color: dv.textMuted }}>{String(service)}</span>
          <span style={{ color: dv.textMuted, fontSize: 11 }}>
            {String(time)}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ============================================================================
// Story — command palette (Cmd+K modal)
// ============================================================================

const DevopsDemo = () => {
  const metabot = useMetabot();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [metabot.messages, metabot.isProcessing]);

  // Open/close with Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      <InfraWatchBg />

      {/* Command palette overlay */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: 999,
            }}
          />
          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "10%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 600,
              maxHeight: 480,
              background: dv.surface,
              border: `1px solid ${dv.border}`,
              borderRadius: 14,
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              zIndex: 1000,
              animation: "metabotFadeUp 0.2s ease",
            }}
          >
            {/* Search bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderBottom: `1px solid ${dv.border}`,
                flexShrink: 0,
                color: dv.accentLight,
              }}
            >
              <SparkleIcon size={16} />
              <style>{`.dv-search-input::placeholder { color: ${dv.textSecondary}; opacity: 1; }`}</style>
              <input
                autoFocus
                className="dv-search-input"
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: 15,
                  color: dv.text,
                  fontFamily: "inherit",
                }}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Ask about products, orders..."
              />
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: dv.textMuted,
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
                  color: dv.red,
                  background: dv.redDim,
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
                minHeight: 0,
              }}
            >
              {metabot.messages.length === 0 && !metabot.isProcessing && (
                <div
                  style={{
                    color: dv.textMuted,
                    fontSize: 13,
                    padding: "16px 0",
                  }}
                >
                  <div
                    style={{
                      marginBottom: 8,
                      fontWeight: 600,
                      color: dv.textSecondary,
                    }}
                  >
                    Suggested
                  </div>
                  {[
                    "Which products have the lowest ratings?",
                    "Show order volume over time",
                    "Average review rating by category",
                  ].map((p) => (
                    <div
                      key={p}
                      onClick={() => {
                        if (!metabot.isProcessing) {
                          metabot.submitMessage(p);
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 13,
                        color: dv.text,
                        marginBottom: 4,
                        background: dv.surfaceRaised,
                        border: `1px solid ${dv.border}`,
                      }}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              )}
              <MessageList
                messages={metabot.messages}
                isProcessing={metabot.isProcessing}
                scrollRef={scrollRef}
                palette={dv}
              />
            </div>

            {/* Footer controls */}
            <div
              style={{
                borderTop: `1px solid ${dv.border}`,
                padding: "6px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 11, color: dv.textMuted }}>
                {metabot.messages.length > 0 && (
                  <button
                    onClick={() => metabot.resetConversation()}
                    style={{
                      background: "none",
                      border: "none",
                      color: dv.textMuted,
                      cursor: "pointer",
                      fontSize: 11,
                      fontFamily: "inherit",
                    }}
                  >
                    Clear conversation
                  </button>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                style={{
                  background: canSend ? dv.accent : dv.surfaceRaised,
                  border: "none",
                  borderRadius: 6,
                  padding: "5px 14px",
                  color: canSend ? "#fff" : dv.textMuted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: canSend ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {metabot.isProcessing ? "Stop" : "Ask →"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Cmd+K hint button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: dv.surface,
            border: `1px solid ${dv.border}`,
            borderRadius: 10,
            padding: "8px 14px",
            color: dv.textSecondary,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "inherit",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
            zIndex: 100,
          }}
        >
          <SparkleIcon size={14} />
          Ask Metabot
          <kbd
            style={{
              background: dv.surfaceRaised,
              padding: "1px 6px",
              borderRadius: 4,
              fontSize: 11,
              color: dv.textMuted,
            }}
          >
            ⌘K
          </kbd>
        </button>
      )}
    </div>
  );
};

const meta: Meta<typeof DevopsDemo> = {
  title: "EmbeddingSDK/useMetabot/DevOps (InfraWatch Monitoring)",
  component: DevopsDemo,
  parameters: {
    layout: "fullscreen",
    // Raise SDK popovers above the command palette modal (z-index: 1000)
    sdkThemeOverride: { components: { popover: { zIndex: 1001 } } },
  },
  decorators: [makeSdkWrapper()],
};

export default meta;

export const InfraWatchMonitoring: StoryFn = () => <DevopsDemo />;
