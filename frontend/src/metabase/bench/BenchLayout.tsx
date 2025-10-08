import type { ReactNode } from "react";
import { useState } from "react";
import { withRouter } from "react-router";

import { Box, Flex, ThemeProvider } from "metabase/ui";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { BenchSidebar } from "./components";
import { BenchToolbar } from "./components/BenchToolbar";
import { BenchMetabot } from "./components/BenchMetabot/BenchMetabot";

interface BenchLayoutProps {
  children: ReactNode;
}

function BenchLayoutComponent({ children }: BenchLayoutProps) {
  const [isMetabotOpen, setIsMetabotOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleMetabotToggle = () => {
    setIsMetabotOpen(!isMetabotOpen);
  };

  const handleSidebarToggle = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <ThemeProvider>
      <Box
        style={{
          height: "100vh",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {/* Main nav on the far left - conditionally rendered */}
        {isSidebarOpen && <BenchSidebar />}

        {/* Main content area taking up the full rest of the view */}
        <Box
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Toolbar on top */}
          <BenchToolbar
            isMetabotOpen={isMetabotOpen}
            onMetabotToggle={handleMetabotToggle}
            isSidebarOpen={isSidebarOpen}
            onSidebarToggle={handleSidebarToggle}
          />

          {/* Horizontal series of panels below toolbar */}
          <Box style={{ flex: 1, overflow: "hidden" }}>
            <PanelGroup direction="horizontal">
              {/* Main content panel */}
              <Panel defaultSize={isMetabotOpen ? 75 : 100} minSize={50}>
                <Box h="100%" style={{ overflow: "hidden" }}>
                  {children}
                </Box>
              </Panel>

              {/* Metabot panel - conditionally rendered */}
              {isMetabotOpen && (
                <>
                  <PanelResizeHandle
                    style={{
                      width: "4px",
                      cursor: "col-resize",
                      borderRadius: "2px",
                      margin: "0 2px",
                    }}
                  />
                  <Panel defaultSize={25} minSize={15} maxSize={40}>
                    <Box
                      h="100%"
                      style={{
                        borderLeft: "1px solid var(--mb-color-border)",
                      }}
                    >
                      <BenchMetabot />
                    </Box>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export const BenchLayout = withRouter(BenchLayoutComponent);
