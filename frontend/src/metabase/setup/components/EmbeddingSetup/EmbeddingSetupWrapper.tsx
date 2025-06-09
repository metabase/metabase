import { Box, Center, Flex } from "metabase/ui";

import { EmbeddingSetupProvider } from "./EmbeddingSetupContext";
import { EmbeddingSetupSidebar } from "./EmbeddingSetupSidebar";

type EmbeddingSetupWrapperProps = {
  children: React.ReactNode;
};

export const EmbeddingSetupWrapper = ({
  children,
}: EmbeddingSetupWrapperProps) => {
  return (
    <EmbeddingSetupProvider>
      <Center>
        <Flex style={{ height: "100vh", overflow: "auto" }}>
          <EmbeddingSetupSidebar />
          <Box p="xl" pl="0" style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
            <Box
              p="xl"
              flex={1} /* The main content area takes remaining space */
              bg="bg-white"
              bd="1px solid var(--mb-color-border)"
              maw="53rem"
              style={{
                borderRadius: "0.5rem",
              }}
            >
              {children}
            </Box>
          </Box>
        </Flex>
      </Center>
    </EmbeddingSetupProvider>
  );
};
