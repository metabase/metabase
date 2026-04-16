import type { Meta, StoryFn } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import { useMetabot } from "./use-metabot";
import {
  BotIcon,
  Composer,
  InstructionsDrawer,
  MessageList,
  SharedKeyframes,
  makeSdkWrapper,
} from "./use-metabot.stories.utils";

// ============================================================================
// FinTech (PayFlow) palette
// ============================================================================

const ft = {
  bg: "#0a2540",
  surface: "#0d2d4a",
  surfaceRaised: "#133558",
  surfaceHover: "#1a3f67",
  border: "#1e4976",
  borderSubtle: "#153560",
  text: "#e8f0fe",
  textSecondary: "#8bafd4",
  textMuted: "#4a7499",
  accent: "#635bff",
  accentLight: "#a29bfe",
  accentDim: "#635bff25",
  gradient: "linear-gradient(135deg, #635bff 0%, #a29bfe 100%)",
  red: "#f87171",
  redDim: "#f8717120",
};

// ============================================================================
// Fake PayFlow Dashboard background
// ============================================================================

const PayFlowBg = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: ft.bg,
      overflow: "hidden",
      zIndex: 0,
    }}
  >
    {/* Top nav */}
    <div
      style={{
        height: 48,
        borderBottom: `1px solid ${ft.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 15, color: ft.text }}>
        <span style={{ color: ft.accentLight }}>Pay</span>Flow
      </span>
      {["Home", "Payments", "Customers", "Reports", "Developers"].map((t) => (
        <span
          key={t}
          style={{ fontSize: 13, color: ft.textSecondary, cursor: "pointer" }}
        >
          {t}
        </span>
      ))}
    </div>
    {/* Stat cards */}
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 16,
        padding: 24,
      }}
    >
      {[
        ["Gross volume", "$2.41M", "+18.2%"],
        ["MRR", "$142K", "+6.4%"],
        ["Churn", "2.8%", "-0.3%"],
        ["Active subs", "8,214", "+12.1%"],
      ].map(([label, val, delta]) => (
        <div
          key={label}
          style={{
            background: ft.surface,
            border: `1px solid ${ft.border}`,
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, color: ft.textMuted }}>{label}</div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: ft.text,
              margin: "6px 0 4px",
            }}
          >
            {val}
          </div>
          <div
            style={{
              fontSize: 12,
              color: delta?.startsWith("-") ? ft.red : ft.accentLight,
            }}
          >
            {delta}
          </div>
        </div>
      ))}
    </div>
    {/* Payments table */}
    <div style={{ padding: "0 24px" }}>
      <div
        style={{
          background: ft.surface,
          border: `1px solid ${ft.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${ft.border}`,
            fontWeight: 600,
            fontSize: 13,
            color: ft.text,
          }}
        >
          Recent payments
        </div>
        {[
          ["Jane Cooper", "Enterprise plan", "$2,400", "Succeeded"],
          ["Acme Corp", "Starter plan", "$149", "Succeeded"],
          ["Bob Martin", "Pro plan", "$490", "Failed"],
          ["TechCo Ltd", "Enterprise plan", "$2,400", "Refunded"],
        ].map(([name, plan, amount, status], i) => (
          <div
            key={name}
            style={{
              padding: "12px 16px",
              display: "flex",
              gap: 16,
              fontSize: 13,
              color: ft.textSecondary,
              borderBottom: i < 3 ? `1px solid ${ft.borderSubtle}` : "none",
            }}
          >
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ color: ft.textMuted }}>{plan}</span>
            <span style={{ fontWeight: 600, color: ft.text }}>{amount}</span>
            <span
              style={{
                color:
                  status === "Succeeded"
                    ? ft.accentLight
                    : status === "Failed"
                      ? ft.red
                      : ft.textMuted,
              }}
            >
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================================
// Story
// ============================================================================

const FintechDemo = () => {
  const metabot = useMetabot();
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
        display: "flex",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <SharedKeyframes />
      <div style={{ flex: 1, position: "relative" }}>
        <PayFlowBg />
      </div>

      {/* Inline side panel — always visible on the right */}
      <div
        style={{
          width: 360,
          height: "100%",
          background: ft.surface,
          borderLeft: `1px solid ${ft.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            background: ft.surfaceRaised,
            borderBottom: `1px solid ${ft.border}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: ft.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <BotIcon size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: ft.text }}>
              Metabot
            </div>
            <div
              style={{
                fontSize: 11,
                color: metabot.isProcessing ? ft.accentLight : ft.textMuted,
              }}
            >
              {metabot.isProcessing ? "Analyzing..." : "Financial analytics"}
            </div>
          </div>
          <button
            onClick={() => metabot.resetConversation()}
            style={{
              background: "none",
              border: "none",
              color: ft.textMuted,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        </div>

        {/* Errors */}
        {metabot.errorMessages.map((err, i) => (
          <div
            key={i}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              color: ft.red,
              background: ft.redDim,
            }}
          >
            {err.message}
          </div>
        ))}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
          {metabot.messages.length === 0 && !metabot.isProcessing && (
            <div
              style={{
                textAlign: "center",
                padding: "40px 16px",
                color: ft.textMuted,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: ft.gradient,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  margin: "0 auto 12px",
                }}
              >
                <BotIcon size={22} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: ft.text,
                  marginBottom: 8,
                }}
              >
                Revenue insights
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                {
                  'Try: "What\'s the total revenue this month?" or "Show revenue trend over time"'
                }
              </div>
            </div>
          )}
          <MessageList
            messages={metabot.messages}
            isProcessing={metabot.isProcessing}
            scrollRef={scrollRef}
            palette={ft}
          />
        </div>

        <InstructionsDrawer
          customInstructions={metabot.customInstructions}
          setCustomInstructions={metabot.setCustomInstructions}
          palette={ft}
        />
        <Composer
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          canSend={canSend}
          placeholder="Ask about revenue, orders..."
          onCancel={metabot.cancelRequest}
          isProcessing={metabot.isProcessing}
          palette={ft}
        />
      </div>
    </div>
  );
};

const meta: Meta<typeof FintechDemo> = {
  title: "EmbeddingSDK/useMetabot/FinTech (PayFlow)",
  component: FintechDemo,
  parameters: { layout: "fullscreen" },
  decorators: [makeSdkWrapper()],
};

export default meta;

export const PayFlow: StoryFn = () => <FintechDemo />;
