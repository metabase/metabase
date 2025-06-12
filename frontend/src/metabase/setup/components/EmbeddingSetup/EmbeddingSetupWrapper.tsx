import { Box, Flex } from "metabase/ui";

import { EmbeddingSetupProvider } from "./EmbeddingSetupContext";
import { EmbeddingSetupSidebar } from "./EmbeddingSetupSidebar";
import { useForceLocaleRefresh } from "./useForceLocaleRefresh";

type EmbeddingSetupWrapperProps = {
  children: React.ReactNode;
};

export const EmbeddingSetupWrapper = ({
  children,
}: EmbeddingSetupWrapperProps) => {
  useForceLocaleRefresh();

  return (
    <EmbeddingSetupProvider>
      <Flex
        justify="center"
        style={{
          minHeight: "100vh",
          alignItems: "start",
          width: "100%",
        }}
      >
        <Flex h="100vh" style={{ position: "sticky", top: 0 }}>
          <EmbeddingSetupSidebar />
        </Flex>
        <Box p="xl" flex={1} maw="53rem">
          <Box
            p="xl"
            flex={1}
            bg="bg-white"
            bd="1px solid var(--mb-color-border)"
            w="100%"
            style={{
              borderRadius: "0.5rem",
            }}
          >
            {children}
          </Box>
        </Box>
      </Flex>
    </EmbeddingSetupProvider>
  );
};
