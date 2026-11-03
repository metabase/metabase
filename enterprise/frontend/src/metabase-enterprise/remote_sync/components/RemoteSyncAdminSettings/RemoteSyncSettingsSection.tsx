import { type ComponentProps, createContext, useContext } from "react";

import {
  SETTINGS_CARD_DESCRIPTION_PROPS,
  SETTINGS_CARD_TITLE_PROPS,
  SettingsSection,
} from "metabase/settings-components";
import { Box, Stack, Text, Title } from "metabase/ui";

import type { RemoteSyncSettingsVariant } from "../../types";

const RemoteSyncSettingsVariantContext =
  createContext<RemoteSyncSettingsVariant>("admin");

export const RemoteSyncSettingsVariantProvider =
  RemoteSyncSettingsVariantContext.Provider;

export const useRemoteSyncSettingsVariant = () =>
  useContext(RemoteSyncSettingsVariantContext);

// Sections inside an enclosing card (e.g. "Advanced settings") render without their own card chrome.
const RemoteSyncNestedSectionContext = createContext(false);

export const RemoteSyncNestedSectionProvider =
  RemoteSyncNestedSectionContext.Provider;

export const RemoteSyncSettingsSection = ({
  children,
  title,
  ...props
}: ComponentProps<typeof SettingsSection> & { title: string }) => {
  const variant = useRemoteSyncSettingsVariant();
  const isNested = useContext(RemoteSyncNestedSectionContext);
  const isModalVariant = variant === "settings-modal";

  if (isNested) {
    return (
      <Stack gap="lg">
        <Box>
          <Title order={isModalVariant ? 4 : 3} size="h5">
            {title}
          </Title>
          {props.description && (
            <Text c="text-secondary" {...SETTINGS_CARD_DESCRIPTION_PROPS}>
              {props.description}
            </Text>
          )}
        </Box>
        {children}
      </Stack>
    );
  }

  return (
    <SettingsSection
      {...props}
      title={title}
      titleProps={{
        ...SETTINGS_CARD_TITLE_PROPS,
        order: isModalVariant ? 3 : 2,
      }}
    >
      {children}
    </SettingsSection>
  );
};
