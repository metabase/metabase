import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { Link } from "react-router";
import { isNotNull } from "metabase/core/utils/types";
import { Button } from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import {
  CardBadge,
  CardDescription,
  CardHeader,
  CardMenu,
  CardRoot,
  CardTitle,
} from "./AuthCard.styled";

export interface AuthSetting {
  value: boolean | null;
}

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

  return (
    <AuthCardBody
      type={type}
      title={title}
      description={description}
      isEnabled={isEnabled}
      isConfigured={isConfigured}
    >
      {isConfigured && (
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
  children?: ReactNode;
}

const AuthCardBody = ({
  type,
  title,
  description,
  isEnabled,
  isConfigured,
  children,
}: AuthCardBodyProps) => {
  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {isConfigured && (
          <CardBadge isEnabled={isEnabled}>
            {isEnabled ? t`Active` : t`Paused`}
          </CardBadge>
        )}
        {children}
      </CardHeader>
      <CardDescription>{description}</CardDescription>
      <Button as={Link} to={`/admin/settings/authentication/${type}`}>
        {isConfigured ? t`Edit` : t`Set up`}
      </Button>
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
          <Button key="submit" danger onClick={onDeactivate}>
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
