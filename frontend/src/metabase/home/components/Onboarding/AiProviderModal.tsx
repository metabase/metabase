import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, createContext, useContext } from "react";

import { AIProviderConfigurationModal } from "metabase/metabot/components/AIProviderConfigurationModal";

const AiProviderModalContext = createContext<() => void>(() => undefined);

/** Opens the "Connect to an AI provider" modal from within a checklist item. */
export const useAiProviderModal = () => useContext(AiProviderModalContext);

/**
 * Owns the AI provider modal, so that it mounts next to the checklist rather
 * than inside the `Accordion` as a stray sibling of one of its items.
 */
export const AiProviderModalProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [opened, { open, close }] = useDisclosure();

  return (
    <AiProviderModalContext.Provider value={open}>
      {children}
      <AIProviderConfigurationModal opened={opened} onClose={close} />
    </AiProviderModalContext.Provider>
  );
};
