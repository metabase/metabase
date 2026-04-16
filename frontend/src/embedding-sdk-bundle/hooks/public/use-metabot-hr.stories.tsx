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
  SparkleIcon,
  makeSdkWrapper,
} from "./use-metabot.stories.utils";

// ============================================================================
// HR / People Analytics (PeopleHQ) palette
// ============================================================================

const hr = {
  bg: "#1c1c1e",
  surface: "#232325",
  surfaceRaised: "#2c2c2e",
  surfaceHover: "#363638",
  border: "#3a3a3c",
  borderSubtle: "#2c2c2e",
  text: "#f0f0f2",
  textSecondary: "#98989e",
  textMuted: "#636366",
  accent: "#e35b00",
  accentLight: "#ff9f5a",
  accentDim: "#e35b0025",
  gradient: "linear-gradient(135deg, #e35b00 0%, #ff9f5a 100%)",
  red: "#f87171",
  redDim: "#f8717120",
};

// ============================================================================
// Fake PeopleHQ background
// ============================================================================

const PeopleHQBg = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: hr.bg,
      overflow: "hidden",
      zIndex: 0,
    }}
  >
    {/* Top nav */}
    <div
      style={{
        height: 48,
        borderBottom: `1px solid ${hr.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: 24,
      }}
    >
      <span style={{ fontWeight: 800, fontSize: 15, color: hr.text }}>
        PeopleHQ
      </span>
      {["People", "Time Off", "Performance", "Reports", "Hiring"].map((t) => (
        <span
          key={t}
          style={{ fontSize: 13, color: hr.textSecondary, cursor: "pointer" }}
        >
          {t}
        </span>
      ))}
    </div>
    {/* People metrics header */}
    <div style={{ padding: "20px 24px 0" }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: hr.text,
          marginBottom: 16,
        }}
      >
        People Overview
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {[
          ["Headcount", "1,284", "+18 this month"],
          ["Avg. tenure", "3.2 yrs", ""],
          ["Attrition", "8.4%", "-1.2% YoY"],
          ["Open roles", "42", "+7 this week"],
        ].map(([label, val, note]) => (
          <div
            key={label}
            style={{
              background: hr.surface,
              border: `1px solid ${hr.border}`,
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 11, color: hr.textMuted }}>{label}</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: hr.text,
                margin: "4px 0 2px",
              }}
            >
              {val}
            </div>
            {note && (
              <div style={{ fontSize: 11, color: hr.accentLight }}>{note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
    {/* Employee table */}
    <div style={{ padding: "0 24px" }}>
      <div
        style={{
          background: hr.surface,
          border: `1px solid ${hr.border}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: `1px solid ${hr.border}`,
            fontWeight: 600,
            fontSize: 13,
            color: hr.text,
          }}
        >
          Employees
        </div>
        {[
          ["Alice Wang", "Engineering", "Senior IC", "4.2 yrs"],
          ["James Torres", "Sales", "Account Exec", "1.8 yrs"],
          ["Priya Sharma", "Product", "PM II", "3.1 yrs"],
          ["Marcus Lee", "Design", "Lead Designer", "5.6 yrs"],
        ].map(([name, dept, title, tenure], i) => (
          <div
            key={name}
            style={{
              padding: "10px 16px",
              display: "flex",
              gap: 16,
              fontSize: 13,
              color: hr.textSecondary,
              borderBottom: i < 3 ? `1px solid ${hr.borderSubtle}` : "none",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: hr.gradient,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {String(name)[0]}
            </div>
            <span style={{ flex: 1, color: hr.text }}>{name}</span>
            <span>{dept}</span>
            <span style={{ color: hr.textMuted }}>{title}</span>
            <span style={{ fontSize: 11, color: hr.textMuted }}>{tenure}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ============================================================================
// Story — bottom drawer that slides up
// ============================================================================

const HrDemo = () => {
  const metabot = useMetabot();
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [drawerHeight, setDrawerHeight] = useState(340);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const handleDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startY: e.clientY, startHeight: drawerHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) {
        return;
      }
      const delta = dragRef.current.startY - ev.clientY;
      const next = Math.max(
        120,
        Math.min(
          window.innerHeight * 0.85,
          dragRef.current.startHeight + delta,
        ),
      );
      setDrawerHeight(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

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
      <PeopleHQBg />

      {/* Bottom drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: drawerHeight,
            background: hr.surface,
            borderTop: `1px solid ${hr.border}`,
            boxShadow: "0 -16px 60px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
            animation: "metabotFadeUp 0.25s ease",
          }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            style={{
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "row-resize",
              flexShrink: 0,
              background: hr.surfaceRaised,
            }}
          >
            <div
              style={{
                width: 32,
                height: 3,
                borderRadius: 2,
                background: hr.border,
              }}
            />
          </div>

          {/* Header */}
          <div
            style={{
              padding: "10px 16px",
              background: hr.surfaceRaised,
              borderBottom: `1px solid ${hr.border}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: hr.gradient,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <BotIcon size={14} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: hr.text }}>
                Metabot
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: metabot.isProcessing ? hr.accentLight : hr.textMuted,
                }}
              >
                {metabot.isProcessing
                  ? "Thinking..."
                  : "People analytics assistant"}
              </div>
            </div>
            <button
              onClick={() => metabot.resetConversation()}
              style={{
                background: "none",
                border: "none",
                color: hr.textMuted,
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
                color: hr.textSecondary,
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
                padding: "5px 16px",
                fontSize: 12,
                color: hr.red,
                background: hr.redDim,
              }}
            >
              {err.message}
            </div>
          ))}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
            {metabot.messages.length === 0 && !metabot.isProcessing && (
              <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
                {[
                  "How many customers joined each month?",
                  "Show customer distribution by state",
                  "What's the most common acquisition source?",
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      if (!metabot.isProcessing) {
                        metabot.submitMessage(p);
                      }
                    }}
                    style={{
                      background: hr.surfaceRaised,
                      border: `1px solid ${hr.border}`,
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 12,
                      color: hr.textSecondary,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
            <MessageList
              messages={metabot.messages}
              isProcessing={metabot.isProcessing}
              scrollRef={scrollRef}
              palette={hr}
            />
          </div>

          <InstructionsDrawer
            customInstructions={metabot.customInstructions}
            setCustomInstructions={metabot.setCustomInstructions}
            palette={hr}
          />
          <Composer
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            canSend={canSend}
            placeholder="Ask about people data..."
            onCancel={metabot.cancelRequest}
            isProcessing={metabot.isProcessing}
            palette={hr}
          />
        </div>
      )}

      {/* Trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: hr.gradient,
            border: "none",
            borderRadius: 12,
            padding: "10px 18px",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "inherit",
            boxShadow: `0 4px 20px ${hr.accent}40`,
            zIndex: 100,
          }}
        >
          <SparkleIcon size={14} />
          Ask Metabot
        </button>
      )}
    </div>
  );
};

const meta: Meta<typeof HrDemo> = {
  title: "EmbeddingSDK/useMetabot/HR (PeopleHQ)",
  component: HrDemo,
  parameters: {
    layout: "fullscreen",
    // Raise SDK popovers above the bottom drawer (z-index: 1000)
    sdkThemeOverride: { components: { popover: { zIndex: 1001 } } },
  },
  decorators: [makeSdkWrapper()],
};

export default meta;

export const PeopleHQ: StoryFn = () => <HrDemo />;
