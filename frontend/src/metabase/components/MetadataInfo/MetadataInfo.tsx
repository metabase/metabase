import cx from "classnames";

import { Box, type BoxProps } from "metabase/ui";

import S from "./MetadataInfo.module.css";

export const Description = ({ className, ...props }: BoxProps) => {
  return <Box className={cx(S.Description, className)} {...props} />;
};

export const EmptyDescription = ({ className, ...props }: BoxProps) => {
  return (
    <Description className={cx(S.EmptyDescription, className)} {...props} />
  );
};
