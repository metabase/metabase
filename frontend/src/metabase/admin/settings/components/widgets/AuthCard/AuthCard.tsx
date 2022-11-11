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
} from "./AuthCard.styled";

export interface AuthCardProps {
  type: string;
  title: string;
  description: string;
  isEnabled: boolean;
  isConfigured: boolean;
  onChange: (value: boolean) => void;
  onDeactivate: () => void;
}

const AuthCard = ({
  type,
  title,
  description,
  isEnabled,
  isConfigured,
  onChange,
  onDeactivate,
}: AuthCardProps) => {
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
    <AuthCardBody
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
    </AuthCardBody>
  );
};

export interface AuthCardBodyProps {
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
        action: () => onChange(!isEnabled),
      },
      {
        title: `Deactivate`,
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

export default AuthCard;
