import { useEffect } from "react";
import { useTimeout } from "react-use";
import { t } from "ttag";

import { DefaultLogoIcon } from "metabase/common/components/LogoIcon";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Button, Flex } from "metabase/ui";

import { goToNextStep, loadDefaults } from "../../actions";
import { LOCALE_TIMEOUT } from "../../constants";
import { getIsLocaleLoaded } from "../../selectors";
import { SetupHelp } from "../SetupHelp";

export const WelcomePage = (): JSX.Element | null => {
  const [isElapsed] = useTimeout(LOCALE_TIMEOUT);
  const isLocaleLoaded = useSelector(getIsLocaleLoaded);
  const dispatch = useDispatch();

  const handleStepSubmit = () => {
    dispatch(goToNextStep());
  };

  useEffect(() => {
    dispatch(loadDefaults());
  }, [dispatch]);

  if (!isElapsed() && !isLocaleLoaded) {
    return null;
  }

  return (
    <Flex
      direction="column"
      align="center"
      mih="100vh"
      data-testid="welcome-page"
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        flex="1 0 auto"
        mt="7rem"
        mb="xxl"
        maw="34.4rem"
      >
        <DefaultLogoIcon height={118} />
        <Box component="h1" c="core-brand" fz="2.2rem" mt="xl">
          {t`Welcome to Metabase`}
        </Box>
        <Box c="text-secondary" fz="lg" lh="xl" my="lg" ta="center">
          {t`Looks like everything is working.`}{" "}
          {t`Now let’s get to know you, connect to your data, and start finding you some answers!`}
        </Box>
        <Button variant="filled" mt="xxl" autoFocus onClick={handleStepSubmit}>
          {t`Let's get started`}
        </Button>
      </Flex>
      <SetupHelp />
    </Flex>
  );
};
