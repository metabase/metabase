import { Box } from "metabase/ui";

import { EmbeddingSetupProvider } from "./EmbeddingSetupContext";

type EmbeddingSetupWrapperProps = {
  children: React.ReactNode;
};

export const EmbeddingSetupWrapper = ({
  children,
}: EmbeddingSetupWrapperProps) => {
  return (
    <EmbeddingSetupProvider>
      <Box p="xl" maw="80%" mx="auto" mt="xl">
        {children}
      </Box>
    </EmbeddingSetupProvider>
  );
};
