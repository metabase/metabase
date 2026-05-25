import { useEffect } from "react";
import { useTimeout } from "react-use";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { DefaultLogoIcon } from "metabase/common/components/LogoIcon";
import { useDispatch, useSelector } from "metabase/redux";
import { Flex, rem } from "metabase/ui";

import { goToNextStep, loadDefaults } from "../../actions";
import { LOCALE_TIMEOUT } from "../../constants";
import { getIsLocaleLoaded } from "../../selectors";
import { SetupHelp } from "../SetupHelp";

import S from "./WelcomePage.module.css";

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
      data-testid="welcome-page"
      direction="column"
      align="center"
      mih="100vh"
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        flex="1 0 auto"
        mt={rem(112)}
        mb="xl"
        maw={rem(550)}
      >
        <DefaultLogoIcon height={118} />
        <h1 className={S.title}>{t`Welcome to Metabase`}</h1>
        <div className={S.body}>
          {t`Looks like everything is working.`}{" "}
          {t`Now let’s get to know you, connect to your data, and start finding you some answers!`}
        </div>
        <Button
          className={S.button}
          primary
          autoFocus
          onClick={handleStepSubmit}
        >
          {t`Let's get started`}
        </Button>
      </Flex>
      <SetupHelp />
    </Flex>
  );
};
