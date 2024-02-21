import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { getEnvVarDocsUrl } from "metabase/admin/settings/utils";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import { isNotNull } from "metabase/lib/types";
import { Button, Anchor, Text } from "metabase/ui";
import type { SettingDefinition } from "metabase-types/api";

import {
  CardBadge,
  CardDescription,
  CardHeader,
  CardMenu,
  CardRoot,
  CardTitle,
} from "./AuthCard.styled";

export type AuthSetting = Omit<SettingDefinition, "value"> & {
  value: boolean | null;
};

export interface AuthCardProps {
  setting: AuthSetting;
  type: string;
  name: string;
  title?: string;
  description: string;
  isConfigured: boolean;
  onChange: (value: boolean) => void;
  onDeactivate: () => void;
}

const AuthCard = ({
  setting,
  type,
  name,
  title = name,
  description,
  isConfigured,
  onChange,
  onDeactivate,
}: AuthCardProps) => {
  const isEnabled = setting.value ?? false;
  const isEnvSetting = setting.is_env_setting;

  const [isOpened, setIsOpened] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handleDeactivate = useCallback(async () => {
    await onDeactivate();
    handleClose();
  }, [onDeactivate, handleClose]);

  const footer = isEnvSetting ? (
    <Text>
      Set with env var{" "}
      <Anchor
        href={getEnvVarDocsUrl(setting.env_name)}
        target="_blank"
      >{`$${setting.env_name}`}</Anchor>
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
      {isConfigured && !isEnvSetting && (
        <AuthCardMenu
          isEnabled={isEnabled}
          onChange={onChange}
          onDeactivate={handleOpen}
        />
      )}
      {isOpened && (
        <AuthCardModal
          name={name}
          onDeactivate={handleDeactivate}
          onClose={handleClose}
        />
      )}
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
    <CardRoot>
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
  const menuItems = useMemo(
    () =>
      [
        {
          title: isEnabled ? t`Pause` : t`Resume`,
          icon: isEnabled ? "pause" : "play",
          action: () => onChange(!isEnabled),
        },
        onDeactivate && {
          title: `Deactivate`,
          icon: "close",
          action: onDeactivate,
        },
      ].filter(isNotNull),
    [isEnabled, onChange, onDeactivate],
  );

  return <CardMenu triggerIcon="ellipsis" items={menuItems} />;
};

interface AuthCardModalProps {
  name: string;
  onDeactivate: () => void;
  onClose: () => void;
}

const AuthCardModal = ({
  name,
  onDeactivate,
  onClose,
}: AuthCardModalProps): JSX.Element => {
  return (
    <Modal small onClose={onClose}>
      <ModalContent
        title={t`Deactivate ${name}?`}
        footer={[
          <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
          <Button
            key="submit"
            onClick={onDeactivate}
            variant="filled"
            color="error"
          >
            {t`Deactivate`}
          </Button>,
        ]}
      >
        {t`This will clear all your settings.`}
      </ModalContent>
    </Modal>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AuthCard;
