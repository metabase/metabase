import { useDisclosure } from "@mantine/hooks";
import { Fragment, useRef } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { Alert, Box, Button, Divider, Icon, Paper, Text } from "metabase/ui";

import { AdditionalHelpButtonGroup } from "./AdditionalHelpButtonGroup";
import { CheckHostAndPortButton } from "./CheckHostAndPortButton";
import S from "./DatabaseFormError.module.css";
import { TroubleshootingTip } from "./TroubleshootingTip";
import { useTroubleshootingTips } from "./useTroubleshootingTips";
import { useDatabaseErrorDetails } from "./utils";

export const DatabaseFormError = () => {
  const [showAllTips, { toggle: toggleShowAllTips }] = useDisclosure(false);
  const { isHostAndPortError, errorMessage } = useDatabaseErrorDetails();
  const troubleshootingTips = useTroubleshootingTips(
    isHostAndPortError,
    showAllTips,
  );
  const ref = useRef<HTMLDivElement>(null);
  const title = isHostAndPortError
    ? t`Hmm, we couldn't connect to the database`
    : // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only visible to admins
      t`Metabase tried, but couldn't connect`;

  useMount(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth" });
    }
  });

  return (
    <Paper className={S.paper} ref={ref}>
      <Box p="md" pb={0}>
        <Alert color="warning" icon={<Icon name="warning" />} title={title}>
          <Text>{errorMessage}</Text>
        </Alert>
        {troubleshootingTips.map((tipProps, index) => (
          <Fragment key={tipProps.key}>
            {!!index && <Divider variant="dashed" />}
            <TroubleshootingTip {...tipProps} />
          </Fragment>
        ))}
        {showAllTips && <AdditionalHelpButtonGroup />}
      </Box>
      {isHostAndPortError && (
        <>
          <Divider mt="md" />
          <CheckHostAndPortButton />
        </>
      )}
      <Divider />
      <Button
        fw={700}
        fz="md"
        leftSection={
          <Icon name={showAllTips ? "chevronup" : "chevrondown"} size={12} />
        }
        onClick={toggleShowAllTips}
        variant="subtle"
      >
        {showAllTips ? t`Hide` : t`More troubleshooting tips`}
      </Button>
    </Paper>
  );
};
