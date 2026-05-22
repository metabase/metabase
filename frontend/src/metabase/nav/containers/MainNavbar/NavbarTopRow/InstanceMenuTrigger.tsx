import { forwardRef } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Icon } from "metabase/ui";

import S from "./NavbarTopRow.module.css";

export const InstanceMenuTrigger = forwardRef<HTMLButtonElement>(
  function InstanceMenuTrigger(props, ref) {
    const applicationName = useSelector(getApplicationName);

    return (
      <Button
        ref={ref}
        variant="subtle"
        color="text-primary"
        size="sm"
        px="sm"
        rightSection={<Icon name="chevrondown" size={10} />}
        aria-label={t`Open ${applicationName} menu`}
        data-testid="instance-menu-trigger"
        className={S.instanceButton}
        {...props}
      >
        <span className={S.instanceName}>{applicationName}</span>
      </Button>
    );
  },
);
