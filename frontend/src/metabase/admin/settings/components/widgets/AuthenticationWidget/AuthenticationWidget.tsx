import React from "react";
import { t } from "ttag";
import { Link } from "react-router";
import Button from "metabase/core/components/Button";
import Toggle from "metabase/core/components/Toggle";
import {
  WidgetDescription,
  WidgetHeader,
  WidgetRoot,
  WidgetTitle,
} from "./AuthenticationWidget.styled";

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

const AuthenticationWidget = ({
  setting,
  authType,
  authName,
  authDescription,
  authConfigured,
  onChange,
}: AuthenticationWidgetProps) => {
  const value = setting.value ?? setting.default;

  return (
    <WidgetRoot>
      <WidgetHeader>
        <WidgetTitle>{authName}</WidgetTitle>
        {authConfigured && (
          <Toggle value={value} aria-label={authName} onChange={onChange} />
        )}
      </WidgetHeader>
      <WidgetDescription>{authDescription}</WidgetDescription>
      <Button as={Link} to={`/admin/settings/authentication/${authType}`}>
        {t`Configure`}
      </Button>
    </WidgetRoot>
  );
};

export default AuthenticationWidget;
