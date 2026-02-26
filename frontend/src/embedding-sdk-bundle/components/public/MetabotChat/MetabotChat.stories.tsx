import type { Meta, StoryFn } from "@storybook/react";
import type { CSSProperties } from "react";
import { useMemo } from "react";

// Side effects (Mantine styles, dayjs plugins, etc)
import "embedding-sdk-bundle";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { getStorybookSdkAuthConfigForUser } from "embedding-sdk-bundle/test/CommonSdkStoryWrapper";
import { defineMetabaseTheme } from "metabase/embedding-sdk/theme";

import { MetabotChat } from "./MetabotChat";

// ============================================================================
// Dark SaaS palette
// ============================================================================

const dk = {
  bg: "#0B0D11",
  surface: "#13161C",
  surfaceRaised: "#1A1D25",
  border: "#2A2E38",
  borderSubtle: "#1F222A",
  text: "#E4E5E9",
  textSecondary: "#8B8F9A",
  textMuted: "#5C6170",
  accent: "#6C5CE7",
  accentLight: "#A29BFE",
  green: "#00D68F",
  red: "#FF6B6B",
};

// ============================================================================
// SDK dark theme that matches the SaaS page palette
// ============================================================================

const saasTheme = defineMetabaseTheme({
  fontFamily: "Inter",
  fontSize: "14px",
  colors: {
    brand: dk.accent,
    filter: dk.accentLight,
    "text-primary": dk.text,
    "text-secondary": dk.textSecondary,
    "text-tertiary": dk.textMuted,
    border: dk.border,
    background: dk.surface,
    "background-secondary": dk.surfaceRaised,
    "background-hover": dk.surfaceRaised,
    "background-disabled": dk.border,
    positive: dk.green,
    negative: dk.red,
  },
});

// ============================================================================
// Custom decorator: forces dark theme on every story
// ============================================================================

const DarkSdkWrapper = (Story: StoryFn) => {
  const authConfig = useMemo(
    () => getStorybookSdkAuthConfigForUser("admin"),
    [],
  );

  return (
    <ComponentProvider authConfig={authConfig} theme={saasTheme}>
      <Story />
    </ComponentProvider>
  );
};

// ============================================================================
// Fake SaaS dashboard background
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
      {["Dashboard", "Reports", "Data", "Settings"].map((label) => (
        <span
          key={label}
          style={{ fontSize: 13, color: dk.textSecondary, cursor: "pointer" }}
        >
          {label}
        </span>
      ))}
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 16,
        padding: "24px",
        maxWidth: 900,
      }}
    >
      {(
        [
          ["Revenue", "$1.24M", "+12.3%"],
          ["Users", "48.2K", "+8.7%"],
          ["Churn", "2.1%", "-0.4%"],
        ] as const
      ).map(([label, val, delta]) => (
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
              color: delta.startsWith("-") ? dk.red : dk.green,
              marginTop: 4,
            }}
          >
            {delta}
          </div>
        </div>
      ))}
    </div>

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
                borderBottom:
                  i < 3 ? `1px solid ${dk.borderSubtle}` : "none",
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

const fullPageStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
  fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
};

// ============================================================================
// Story 1: Standalone chat panel (inline, no trigger)
// ============================================================================

const StandalonePanelDemo = () => (
  <div style={fullPageStyle}>
    <SaasPageBg />
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${dk.border}`,
        background: dk.surface,
        boxShadow: `0 24px 80px rgba(0,0,0,0.5)`,
      }}
    >
      <MetabotChat height={500} width={400} />
    </div>
  </div>
);

// ============================================================================
// Story 2: FloatingActionButton (Intercom-style)
// ============================================================================

const FloatingActionButtonDemo = () => (
  <div style={fullPageStyle}>
    <SaasPageBg />
    <MetabotChat.FloatingActionButton panelHeight={520} panelWidth={380} />
  </div>
);

// ============================================================================
// Story 3: CommandBar (centered bottom AI bar)
// ============================================================================

const CommandBarDemo = () => (
  <div style={fullPageStyle}>
    <SaasPageBg />
    <MetabotChat.CommandBar width={560} panelHeight={420} />
  </div>
);

// ============================================================================
// Story 4: Full-width bottom panel
// ============================================================================

const FullWidthDemo = () => (
  <div style={fullPageStyle}>
    <SaasPageBg />
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        background: dk.surface,
        borderTop: `1px solid ${dk.border}`,
      }}
    >
      <MetabotChat height={300} width="100%" />
    </div>
  </div>
);

// ============================================================================
// Storybook meta
// ============================================================================

export default {
  title: "EmbeddingSDK/MetabotChat",
  parameters: {
    layout: "fullscreen",
  },
  decorators: [DarkSdkWrapper],
} satisfies Meta;

export const StandalonePanel: StoryFn = () => <StandalonePanelDemo />;
StandalonePanel.storyName = "Standalone Panel";

export const FloatingActionButton: StoryFn = () => (
  <FloatingActionButtonDemo />
);
FloatingActionButton.storyName = "Floating Action Button (Intercom)";

export const CommandBar: StoryFn = () => <CommandBarDemo />;
CommandBar.storyName = "Command Bar (AI Bar)";

export const FullWidthPanel: StoryFn = () => <FullWidthDemo />;
FullWidthPanel.storyName = "Full-Width Bottom Panel";
