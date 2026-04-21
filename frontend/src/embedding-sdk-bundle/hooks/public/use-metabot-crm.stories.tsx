import type { Meta, StoryFn } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import { useMetabot } from "./use-metabot";
import {
  BotIcon,
  Composer,
  MessageList,
  SharedKeyframes,
  makeSdkWrapper,
} from "./use-metabot.stories.utils";

// ============================================================================
// CRM (AcmeCRM) palette
// ============================================================================

const crm = {
  bg: "#16325c",
  surface: "#1b3d72",
  surfaceRaised: "#214886",
  surfaceHover: "#27529a",
  border: "#2b5dae",
  borderSubtle: "#1f4480",
  text: "#e8f0fe",
  textSecondary: "#7faad4",
  textMuted: "#4d7ab0",
  accent: "#0176d3",
  accentLight: "#58b0ff",
  accentDim: "#0176d325",
  gradient: "linear-gradient(135deg, #0176d3 0%, #58b0ff 100%)",
  red: "#f87171",
  redDim: "#f8717120",
};

// ============================================================================
// Fake AcmeCRM background
// ============================================================================

const deals = [
  { name: "Acme Corp", stage: "Proposal", amount: "$48,000", owner: "Sarah" },
  {
    name: "TechStart Inc",
    stage: "Negotiation",
    amount: "$92,000",
    owner: "James",
  },
  { name: "Global Retail", stage: "Demo", amount: "$24,500", owner: "Priya" },
  {
    name: "FinCo Ltd",
    stage: "Prospecting",
    amount: "$130,000",
    owner: "Alex",
  },
  { name: "CloudSoft", stage: "Closed Won", amount: "$76,000", owner: "Maria" },
];

const stageColor = (stage: string) => {
  if (stage === "Closed Won") {
    return crm.accentLight;
  }
  if (stage === "Negotiation") {
    return "#fbbf24";
  }
  if (stage === "Proposal") {
    return "#a78bfa";
  }
  return crm.textMuted;
};

const AcmeCRMBg = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: crm.bg,
      overflow: "hidden",
      zIndex: 0,
    }}
  >
    {/* Top nav */}
    <div
      style={{
        height: 44,
        borderBottom: `1px solid ${crm.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 20,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 14, color: crm.text }}>
        <span style={{ color: crm.accentLight }}>Acme</span>CRM
      </span>
      {["Home", "Leads", "Opportunities", "Accounts", "Reports"].map((t) => (
        <span
          key={t}
          style={{ fontSize: 12, color: crm.textSecondary, cursor: "pointer" }}
        >
          {t}
        </span>
      ))}
    </div>
    {/* Pipeline header */}
    <div style={{ padding: "16px 20px 0" }}>
      <div
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: crm.text,
          marginBottom: 4,
        }}
      >
        Pipeline Q2 2025
      </div>
      <div style={{ fontSize: 12, color: crm.textMuted, marginBottom: 16 }}>
        Total: $370,500 · 5 open deals
      </div>
      {/* Deal list */}
      <div
        style={{
          background: crm.surface,
          border: `1px solid ${crm.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: `1px solid ${crm.border}`,
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            fontSize: 11,
            fontWeight: 600,
            color: crm.textMuted,
          }}
        >
          <span>Account</span>
          <span>Stage</span>
          <span>Amount</span>
          <span>Owner</span>
        </div>
        {deals.map((deal, i) => (
          <div
            key={deal.name}
            style={{
              padding: "10px 14px",
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              fontSize: 13,
              color: crm.textSecondary,
              borderBottom:
                i < deals.length - 1 ? `1px solid ${crm.borderSubtle}` : "none",
              alignItems: "center",
            }}
          >
            <span style={{ color: crm.text, fontWeight: 500 }}>
              {deal.name}
            </span>
            <span style={{ color: stageColor(deal.stage) }}>{deal.stage}</span>
            <span style={{ fontWeight: 600, color: crm.text }}>
              {deal.amount}
            </span>
            <span style={{ color: crm.textMuted }}>{deal.owner}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================================
// Story — persistent right side panel (always visible)
// ============================================================================

const CrmDemo = () => {
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
        {metabot.CurrentChart ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: crm.bg,
            }}
          >
            <metabot.CurrentChart drills isSaveEnabled={false} height="100%" />
          </div>
        ) : (
          <AcmeCRMBg />
        )}
      </div>

      {/* Persistent right panel — pinned alongside the deal list */}
      <div
        style={{
          width: 320,
          height: "100%",
          background: crm.surface,
          borderLeft: `1px solid ${crm.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px",
            background: crm.surfaceRaised,
            borderBottom: `1px solid ${crm.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: crm.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <BotIcon size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: crm.text }}>
              Metabot
            </div>
            <div
              style={{
                fontSize: 10,
                color: metabot.isProcessing ? crm.accentLight : crm.textMuted,
              }}
            >
              {metabot.isProcessing ? "Analyzing pipeline..." : "CRM analytics"}
            </div>
          </div>
          {metabot.messages.length > 0 && (
            <button
              onClick={() => metabot.resetConversation()}
              style={{
                background: "none",
                border: "none",
                color: crm.textMuted,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Errors */}
        {metabot.errorMessages.map((err, i) => (
          <div
            key={i}
            style={{
              padding: "5px 14px",
              fontSize: 12,
              color: crm.red,
              background: crm.redDim,
            }}
          >
            {err.message}
          </div>
        ))}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
          {metabot.messages.length === 0 && !metabot.isProcessing && (
            <div style={{ padding: "8px 0" }}>
              <div
                style={{
                  fontSize: 11,
                  color: crm.textMuted,
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                SUGGESTED QUESTIONS
              </div>
              {[
                "Which customers have the highest total spend?",
                "Show orders by acquisition source",
                "Average order value by state",
              ].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    if (!metabot.isProcessing) {
                      metabot.submitMessage(p);
                    }
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: crm.surfaceRaised,
                    border: `1px solid ${crm.border}`,
                    borderRadius: 7,
                    padding: "8px 10px",
                    fontSize: 12,
                    color: crm.textSecondary,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    marginBottom: 6,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <MessageList
            messages={metabot.messages.filter(
              (message) => message.type !== "chart",
            )}
            isProcessing={metabot.isProcessing}
            scrollRef={scrollRef}
            palette={crm}
            onRetry={metabot.retryMessage}
          />
        </div>

        <Composer
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          canSend={canSend}
          placeholder="Ask about customers, orders..."
          onCancel={metabot.cancelRequest}
          isProcessing={metabot.isProcessing}
          palette={crm}
        />
      </div>
    </div>
  );
};

const meta: Meta<typeof CrmDemo> = {
  title: "EmbeddingSDK/useMetabot/CRM (AcmeCRM)",
  component: CrmDemo,
  parameters: { layout: "fullscreen" },
  decorators: [makeSdkWrapper()],
};

export default meta;

export const AcmeCRM: StoryFn = () => <CrmDemo />;
