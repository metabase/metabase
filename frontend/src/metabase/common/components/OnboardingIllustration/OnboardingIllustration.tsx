import cx from "classnames";

import OnboardingSVG from "assets/img/onboarding_bg.svg?component";
import { Box } from "metabase/ui";

import Styles from "./Onboarding.module.css";

export const OnboardingIllustration = () => {
  return (
    <Box className={Styles.Container} w="100%" h="100%">
      <OnboardingSVG className={cx(Styles.Image, Styles.Colors)} />
    </Box>
  );
};
