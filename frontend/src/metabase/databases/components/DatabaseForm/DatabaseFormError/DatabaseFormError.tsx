import { useFormikContext } from "formik";
import { Fragment, useRef, useState } from "react";
import { useMount } from "react-use";
import slugg from "slugg";
import { t } from "ttag";

import { useFormErrorMessage } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Alert, Box, Button, Divider, Icon, Paper } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

import { AdditionalHelpButtonGroup } from "./AdditionalHelpButtonGroup";
import S from "./DatabaseFormError.module.css";
import { TroubleshootingTip } from "./TroubleshootingTip";
import { useTroubleshootingTips } from "./useTroubleshootingTips";

export const DatabaseFormError = () => {
  const applicationName = useSelector(getApplicationName);
  const [showMoreTips, setShowMoreTips] = useState<boolean>(false);
  const { isHostAndPortError, errorMessage } = useDatabaseErrorDetails();
  const initialTipCount = isHostAndPortError ? 0 : 2;
  const troubleshootingTips = useTroubleshootingTips(
    showMoreTips ? undefined : initialTipCount,
  );
  const ref = useRef<HTMLDivElement>(null);
  const title = isHostAndPortError
    ? t`Hmm, we couldn't connect to the database`
    : t`${applicationName} tried, but couldn't connect`;

  useMount(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth" });
    }
  });

  const onCheckHostAndPortClick = () => {
    // Scroll to the area with errors
    const scrollableEl = document.getElementById(
      "scrollable-database-form-body",
    );
    const dataErrorEl =
      scrollableEl?.querySelector<HTMLDivElement>("div[data-error]");

    if (dataErrorEl) {
      const y = dataErrorEl.offsetTop - 48; // 48px clearance
      scrollableEl?.scrollTo({ behavior: "smooth", top: y });
    }
  };

  return (
    <Paper className={S.paper} ref={ref}>
      <Box p="md" pb={0}>
        <Alert
          bd="1px solid warning"
          classNames={{ message: S.alertMessage, title: S.alertTitle }}
          color="warning"
          icon={<Icon name="warning" />}
          title={title}
          variant="light"
        >
          {errorMessage}
        </Alert>
        {troubleshootingTips.map((tipProps, _index) => (
          <Fragment key={slugg(tipProps.title)}>
            {!!_index && <Divider variant="dashed" />}
            <TroubleshootingTip {...tipProps} />
          </Fragment>
        ))}
        {showMoreTips && <AdditionalHelpButtonGroup />}
      </Box>
      {isHostAndPortError && (
        <>
          <Divider mt="md" />
          <Button
            fw={700}
            fz="md"
            leftSection={<Icon name="gear" size={12} />}
            onClick={onCheckHostAndPortClick}
            variant="subtle"
          >
            {t`Check Host and Port settings`}
          </Button>
        </>
      )}
      <Divider />
      <Button
        fw={700}
        fz="md"
        leftSection={
          <Icon name={showMoreTips ? "chevronup" : "chevrondown"} size={12} />
        }
        onClick={() => setShowMoreTips((showMoreTips) => !showMoreTips)}
        variant="subtle"
      >
        {showMoreTips ? t`Hide` : t`More troubleshooting tips`}
      </Button>
    </Paper>
  );
};

const useDatabaseErrorDetails = () => {
  const { errors } = useFormikContext<DatabaseData>();
  const originalErrorMessage = useFormErrorMessage();
  const isHostAndPortError =
    typeof errors?.details === "object" &&
    Object.hasOwn(errors?.details, "host") &&
    Object.hasOwn(errors?.details, "port");

  return {
    errorMessage: isHostAndPortError
      ? t`Make sure your Host and Port settings are correct.`
      : originalErrorMessage,
    isHostAndPortError,
  };
};
