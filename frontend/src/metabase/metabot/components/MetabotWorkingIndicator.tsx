import cx from "classnames";
import { t } from "ttag";

import { Text, type TextProps } from "metabase/ui";

import S from "./MetabotWorkingIndicator.module.css";

export const MetabotWorkingIndicator = ({ className, ...props }: TextProps) => (
  <Text className={cx(S.root, className)} role="status" {...props}>
    {t`Working on it...`}
  </Text>
);
