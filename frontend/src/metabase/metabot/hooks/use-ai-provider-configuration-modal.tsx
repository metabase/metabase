import { type UseDisclosureOptions, useDisclosure } from "@mantine/hooks";

import { AIProviderConfigurationModal } from "../components/AIProviderConfigurationModal";

export function useAiProviderConfigurationModal(
  options?: UseDisclosureOptions,
) {
  const [isOpen, { close, open }] = useDisclosure(false, options);

  return {
    openAiProviderConfigurationModal: open,
    closeAiProviderConfigurationModal: close,
    aiProviderConfigurationModal: isOpen ? (
      <AIProviderConfigurationModal opened={isOpen} onClose={close} />
    ) : null,
  };
}
