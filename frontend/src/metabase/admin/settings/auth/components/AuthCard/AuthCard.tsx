import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useGetEnvVarDocsUrl } from "metabase/admin/settings/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ActionIcon, Anchor, Button, Icon, Menu, Text } from "metabase/ui";
import type { SettingDefinition } from "metabase-types/api";

import {
  CardBadge,
  CardDescription,
  CardHeader,
  CardRoot,
  CardTitle,
} from "./AuthCard.styled";

export interface AuthCardProps {
  setting?: Pick<SettingDefinition, "is_env_setting" | "env_name">;
  type: string;
  name: string;
  title?: string;
  description: string;
  isEnabled: boolean;
  isConfigured: boolean;
  onChange?: (value: boolean) => void;
  onDeactivate?: () => void;
}

export const AuthCard = ({
  setting,
  type,
  name,
  title = name,
  description,
  isEnabled,
  isConfigured,
  onChange,
  onDeactivate,
}: AuthCardProps) => {
  const isEnvSetting = setting?.is_env_setting;

  const [isOpened, setIsOpened] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handleDeactivate = useCallback(async () => {
    await onDeactivate?.();
    handleClose();
  }, [onDeactivate, handleClose]);

  const { url: docsUrl } = useGetEnvVarDocsUrl(setting?.env_name);

  const footer = isEnvSetting ? (
    <Text>
      {c("{0} is the name of a variable")
        .jt`Set with env var ${<Anchor key="anchor" href={docsUrl} target="_blank">{`$${setting.env_name}`}</Anchor>}`}
    </Text>
  ) : null;

  return (
    <AuthCardBody
      type={type}
      title={title}
      description={description}
      isEnabled={isEnabled}
      isConfigured={isConfigured && !isEnvSetting}
      footer={footer}
    >
      {isConfigured && !isEnvSetting && onChange && (
        <AuthCardMenu
          isEnabled={isEnabled}
          onChange={onChange}
          onDeactivate={handleOpen}
        />
      )}
      <ConfirmModal
        opened={isOpened}
        title={c("{0} is the name of an authentication service")
          .t`Deactivate ${name}?`}
        message={t`This will clear all your settings.`}
        confirmButtonText={t`Deactivate`}
        onConfirm={handleDeactivate}
        onClose={handleClose}
      />
    </AuthCardBody>
  );
};

interface AuthCardBodyProps {
  type: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isConfigured: boolean;
  badgeText?: string;
  buttonText?: string;
  buttonEnabled?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}

export const AuthCardBody = ({
  type,
  title,
  description,
  isEnabled,
  isConfigured,
  badgeText,
  buttonText,
  footer,
  children,
}: AuthCardBodyProps) => {
  const badgeContent = badgeText ?? (isEnabled ? t`Active` : t`Paused`);
  const buttonLabel = buttonText ?? (isConfigured ? t`Edit` : t`Set up`);

  return (
    <SettingsSection>
      <CardRoot data-testid={`${type}-setting`}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {isConfigured && (
            <CardBadge isEnabled={isEnabled} data-testid="card-badge">
              {badgeContent}
            </CardBadge>
          )}
          {children}
        </CardHeader>
        <CardDescription>{description}</CardDescription>
        {footer ? (
          footer
        ) : (
          <Link to={`/admin/settings/authentication/${type}`}>
            <Button>{buttonLabel}</Button>
          </Link>
        )}
      </CardRoot>
    </SettingsSection>
  );
};

interface AuthCardMenuProps {
  isEnabled: boolean;
  onChange: (isEnabled: boolean) => void;
  onDeactivate?: () => void;
}

const AuthCardMenu = ({
  isEnabled,
  onChange,
  onDeactivate,
}: AuthCardMenuProps): JSX.Element => {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon aria-label={t`Actions`} variant="subtle" ml="auto">
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Icon name={isEnabled ? "pause" : "play"} aria-hidden />}
          onClick={() => onChange(!isEnabled)}
        >
          {isEnabled ? t`Pause` : t`Resume`}
        </Menu.Item>
        {onDeactivate && (
          <Menu.Item
            leftSection={<Icon name="close" aria-hidden />}
            onClick={onDeactivate}
          >
            {t`Deactivate`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};
