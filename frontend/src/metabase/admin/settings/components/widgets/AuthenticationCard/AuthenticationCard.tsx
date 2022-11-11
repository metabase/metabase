import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { Link } from "react-router";
import Button from "metabase/core/components/Button";
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
  authType: string;
  authName: string;
  authDescription: string;
  authConfigured: boolean;
  onChange: (value: boolean) => void;
}

const AuthenticationCard = ({
  setting,
  authType,
  authName,
  authDescription,
  authConfigured,
  onChange,
}: AuthenticationWidgetProps) => {
  const isEnabled = setting.value ?? setting.default;

  const menuItems = useMemo(() => {
    return [
      {
        title: isEnabled ? t`Pause` : t`Resume`,
        icon: "play",
        action: () => onChange(!isEnabled),
      },
    ];
  }, [isEnabled, onChange]);

  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>{authName}</CardTitle>
        {authConfigured && (
          <>
            <CardBadge isEnabled={isEnabled}>
              {isEnabled ? t`Active` : t`Paused`}
            </CardBadge>{" "}
            <CardMenu triggerIcon="ellipsis" items={menuItems} />
          </>
        )}
      </CardHeader>
      <CardDescription>{authDescription}</CardDescription>
      <Button as={Link} to={`/admin/settings/authentication/${authType}`}>
        {authConfigured ? t`Edit` : t`Set up`}
      </Button>
    </CardRoot>
  );
};

export default AuthenticationCard;
