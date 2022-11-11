import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import { Link } from "react-router";
import Button from "metabase/core/components/Button";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import {
  CardBadge,
  CardDescription,
  CardHeader,
  CardMenu,
  CardRoot,
  CardTitle,
} from "./AuthenticationCard.styled";

export interface AuthenticationSetting {
  value: boolean | null;
  default: boolean;
}

export interface AuthenticationWidgetProps {
  setting: AuthenticationSetting;
  type: string;
  title: string;
  description: string;
  isConfigured: boolean;
  onChange: (value: boolean) => void;
  onDeactivate: () => void;
}

const AuthenticationCard = ({
  setting,
  type,
  title,
  description,
  isConfigured,
  onChange,
  onDeactivate,
}: AuthenticationWidgetProps) => {
  const isEnabled = setting.value ?? setting.default;
  const [isOpened, setIsOpened] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handleDeactivate = useCallback(() => {
    onDeactivate();
    handleClose();
  }, [onDeactivate, handleClose]);

  return (
    <AuthCard
      type={type}
      title={title}
      description={description}
      isEnabled={isEnabled}
      isConfigured={isConfigured}
    >
      <AuthCardMenu
        isEnabled={isEnabled}
        onChange={onChange}
        onDeactivate={handleOpen}
      />
      {isOpened && (
        <AuthCardModal
          title={title}
          onDeactivate={handleDeactivate}
          onClose={handleClose}
        />
      )}
    </AuthCard>
  );
};

export interface AuthCardProps {
  type: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isConfigured: boolean;
  children?: ReactNode;
}

const AuthCard = ({
  type,
  title,
  description,
  isEnabled,
  isConfigured,
  children,
}: AuthCardProps) => {
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
  onDeactivate: () => void;
}

const AuthCardMenu = ({
  isEnabled,
  onChange,
  onDeactivate,
}: AuthCardMenuProps): JSX.Element => {
  const menuItems = useMemo(
    () => [
      {
        title: isEnabled ? t`Pause` : t`Resume`,
        icon: "play",
        action: () => onChange(!isEnabled),
      },
      {
        title: `Deactivate`,
        icon: "close",
        action: onDeactivate,
      },
    ],
    [isEnabled, onChange, onDeactivate],
  );

  return <CardMenu triggerIcon="ellipsis" items={menuItems} />;
};

interface AuthCardModalProps {
  title: string;
  onDeactivate: () => void;
  onClose: () => void;
}

const AuthCardModal = ({
  title,
  onDeactivate,
  onClose,
}: AuthCardModalProps): JSX.Element => {
  return (
    <Modal small onClose={onClose}>
      <ModalContent
        title={t`Deactivate ${title}?`}
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

export default AuthenticationCard;
