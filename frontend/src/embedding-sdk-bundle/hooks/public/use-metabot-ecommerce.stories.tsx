import type { Meta, StoryFn } from "@storybook/react";
import { useEffect, useRef, useState } from "react";

import { useMetabot } from "./use-metabot";
import {
  BotIcon,
  CloseIcon,
  Composer,
  InstructionsDrawer,
  MessageList,
  SharedKeyframes,
  makeSdkWrapper,
} from "./use-metabot.stories.utils";

// ============================================================================
// E-commerce (Storefront) palette
// ============================================================================

const ec = {
  bg: "#1a1c1e",
  surface: "#202325",
  surfaceRaised: "#282b2d",
  surfaceHover: "#303336",
  border: "#3d4144",
  borderSubtle: "#2d3033",
  text: "#e3e5e8",
  textSecondary: "#9ba3a8",
  textMuted: "#5e666b",
  accent: "#008060",
  accentLight: "#34d399",
  accentDim: "#00806025",
  gradient: "linear-gradient(135deg, #008060 0%, #34d399 100%)",
  red: "#f87171",
  redDim: "#f8717120",
};

// ============================================================================
// Fake Storefront Admin background
// ============================================================================

const StorefrontBg = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: ec.bg,
      overflow: "hidden",
      zIndex: 0,
      display: "flex",
    }}
  >
    {/* Left sidebar */}
    <div
      style={{
        width: 200,
        background: "#111314",
        borderRight: `1px solid ${ec.border}`,
        padding: "16px 0",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "0 16px 16px",
          fontWeight: 800,
          fontSize: 15,
          color: ec.text,
        }}
      >
        Storefront
      </div>
      {[
        "Orders",
        "Products",
        "Customers",
        "Analytics",
        "Marketing",
        "Discounts",
      ].map((item, i) => (
        <div
          key={item}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            color: i === 2 ? ec.text : ec.textSecondary,
            background: i === 2 ? ec.surfaceRaised : "none",
            borderLeft:
              i === 2 ? `3px solid ${ec.accent}` : "3px solid transparent",
            cursor: "pointer",
          }}
        >
          {item}
        </div>
      ))}
    </div>

    {/* Main content */}
    <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: ec.text }}>
          Customers
        </div>
        <button
          style={{
            background: ec.accent,
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Export
        </button>
      </div>
      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          ["Total customers", "48,291", "+8.3%"],
          ["Returning", "61%", "+2.1%"],
          ["Avg. order value", "$84.20", "+12%"],
        ].map(([label, val, delta]) => (
          <div
            key={label}
            style={{
              background: ec.surface,
              border: `1px solid ${ec.border}`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 12, color: ec.textMuted }}>{label}</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: ec.text,
                margin: "4px 0",
              }}
            >
              {val}
            </div>
            <div style={{ fontSize: 12, color: ec.accentLight }}>{delta}</div>
          </div>
        ))}
      </div>
      {/* Order table */}
      <div
        style={{
          background: ec.surface,
          border: `1px solid ${ec.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${ec.border}`,
            fontWeight: 600,
            fontSize: 13,
            color: ec.text,
          }}
        >
          Recent orders
        </div>
        {[
          ["#1204", "Sarah Chen", "$142.00", "Fulfilled"],
          ["#1203", "James Park", "$89.50", "Pending"],
          ["#1202", "Maria Santos", "$214.00", "Fulfilled"],
          ["#1201", "Alex Kim", "$56.80", "Cancelled"],
        ].map(([id, name, amount, status], i) => (
          <div
            key={id}
            style={{
              padding: "12px 16px",
              display: "flex",
              gap: 16,
              fontSize: 13,
              color: ec.textSecondary,
              borderBottom: i < 3 ? `1px solid ${ec.borderSubtle}` : "none",
            }}
          >
            <span style={{ color: ec.accentLight, fontWeight: 600 }}>{id}</span>
            <span style={{ flex: 1 }}>{name}</span>
            <span>{amount}</span>
            <span
              style={{
                color:
                  status === "Fulfilled"
                    ? ec.accentLight
                    : status === "Cancelled"
                      ? ec.red
                      : ec.textMuted,
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

const EcommerceDemo = () => {
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
      <StorefrontBg />

      {/* Slide-in drawer from right */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            width: 400,
            height: "100%",
            background: ec.surface,
            borderLeft: `1px solid ${ec.border}`,
            boxShadow: "-24px 0 80px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
            animation: "metabotFadeUp 0.25s ease",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              background: ec.surfaceRaised,
              borderBottom: `1px solid ${ec.border}`,
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
                background: ec.gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <BotIcon size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: ec.text }}>
                Metabot
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: metabot.isProcessing ? ec.accentLight : ec.textMuted,
                }}
              >
                {metabot.isProcessing
                  ? "Thinking..."
                  : "Ask about your store data"}
              </div>
            </div>
            <button
              onClick={() => metabot.resetConversation()}
              style={{
                background: "none",
                border: "none",
                color: ec.textMuted,
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
                color: ec.textSecondary,
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
                color: ec.red,
                background: ec.redDim,
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
                  padding: "40px 20px",
                  color: ec.textMuted,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: ec.gradient,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    margin: "0 auto 12px",
                  }}
                >
                  <BotIcon size={24} />
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: ec.text,
                    marginBottom: 8,
                  }}
                >
                  Ask about your store
                </div>
                <div
                  style={{ marginTop: 16, width: "100%", textAlign: "left" }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: ec.textMuted,
                      fontWeight: 600,
                      marginBottom: 8,
                      textAlign: "center",
                    }}
                  >
                    SUGGESTED QUESTIONS
                  </div>
                  {[
                    "Show top products by revenue this month",
                    "Why did orders drop last Tuesday?",
                    "Which customers ordered the most?",
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
                        background: ec.surfaceRaised,
                        border: `1px solid ${ec.border}`,
                        borderRadius: 7,
                        padding: "8px 10px",
                        fontSize: 12,
                        color: ec.textSecondary,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        marginBottom: 6,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <MessageList
              messages={metabot.messages}
              isProcessing={metabot.isProcessing}
              scrollRef={scrollRef}
              palette={ec}
            />
          </div>

          <InstructionsDrawer
            customInstructions={metabot.customInstructions}
            setCustomInstructions={metabot.setCustomInstructions}
            palette={ec}
          />
          <Composer
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            canSend={canSend}
            placeholder="Ask about orders, products..."
            onCancel={metabot.cancelRequest}
            isProcessing={metabot.isProcessing}
            palette={ec}
          />
        </div>
      )}

      {/* FAB to open drawer */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            width: 52,
            height: 52,
            borderRadius: 14,
            border: "none",
            background: ec.gradient,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 4px 24px ${ec.accent}50`,
            zIndex: 1000,
          }}
        >
          <BotIcon size={24} />
        </button>
      )}
    </div>
  );
};

const meta: Meta<typeof EcommerceDemo> = {
  title: "EmbeddingSDK/useMetabot/Ecommerce (Storefront)",
  component: EcommerceDemo,
  parameters: {
    layout: "fullscreen",
    // Raise SDK popovers above the slide-in drawer (z-index: 1000)
    sdkThemeOverride: { components: { popover: { zIndex: 1001 } } },
  },
  decorators: [makeSdkWrapper()],
};

export default meta;

export const Storefront: StoryFn = () => <EcommerceDemo />;
