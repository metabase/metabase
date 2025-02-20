import cx from "classnames";

import { Box, type BoxProps } from "metabase/ui";

import S from "./FullWidthContainer.module.css";

export const FullWidthContainer = (
  props: BoxProps & { children: React.ReactNode },
) => {
  const { className, ...rest } = props;

  return <Box className={cx(S.FullWidthContainer, className)} {...rest} />;
};
