import cx from "classnames";

import LighthouseSvg from "img/bridge.svg?component";
import { Box } from "metabase/ui";

import Styles from "./Lighthouse.module.css";

export const LighthouseIllustration = () => {
  return (
    <Box className={Styles.LighthouseContainer} w="100%" h="100%">
      <LighthouseSvg
        width="max(1953px, 100%)"
        height="max(375px, 19.2cqw)"
        className={cx(Styles.LighthouseImage, Styles.LighthouseColors)}
      />
    </Box>
  );
};

export const LighthouseIllustrationThumbnail = () => {
  return (
    <Box className={Styles.LighthouseContainer} w="90px" h="90px">
      <LighthouseSvg
        width="100px"
        height="100px"
        className={cx(Styles.LighthouseColors, Styles.LighthouseThumbnail)}
      />
    </Box>
  );
};
