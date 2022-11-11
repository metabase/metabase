import React from "react";
import { t } from "ttag";
import { Link } from "react-router";
import Button from "metabase/core/components/Button";
import Toggle from "metabase/core/components/Toggle";
import {
  CardDescription,
  CardHeader,
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
  const value = setting.value ?? setting.default;

  return (
    <CardRoot>
      <CardHeader>
        <CardTitle>{authName}</CardTitle>
        {authConfigured && (
          <Toggle value={value} aria-label={authName} onChange={onChange} />
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
