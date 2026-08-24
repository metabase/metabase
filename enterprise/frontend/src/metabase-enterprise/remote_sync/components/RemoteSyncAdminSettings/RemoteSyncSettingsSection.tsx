import { type ComponentProps, createContext, useContext } from "react";

import { SettingsSection } from "metabase/settings-components/SettingsSection";

import type { RemoteSyncSettingsVariant } from "../../types";

const RemoteSyncSettingsVariantContext =
  createContext<RemoteSyncSettingsVariant>("admin");

export const RemoteSyncSettingsVariantProvider =
  RemoteSyncSettingsVariantContext.Provider;

export const useRemoteSyncSettingsVariant = () =>
  useContext(RemoteSyncSettingsVariantContext);

export const RemoteSyncSettingsSection = ({
  children,
  title,
  ...props
}: ComponentProps<typeof SettingsSection> & { title: string }) => {
  const variant = useRemoteSyncSettingsVariant();

  return (
    <SettingsSection
      {...props}
      title={title}
      titleProps={{
        order: variant === "settings-modal" ? 3 : 2,
      }}
    >
      {children}
    </SettingsSection>
  );
};
