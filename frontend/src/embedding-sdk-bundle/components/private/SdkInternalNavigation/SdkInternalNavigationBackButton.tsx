import cx from "classnames";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import S from "./SdkInternalNavigationBackButton.module.css";
import { useSdkInternalNavigationOptional } from "./context";

/**
 * A back button that navigates to the previous entry in the SDK internal navigation stack.
 * Returns null if there's no navigation context or if there's no previous entry to go back to.
 */
export const SdkInternalNavigationBackButton = ({
  style,
  className,
}: {
  style?: React.CSSProperties;
  className?: string;
}) => {
  const navigation = useSdkInternalNavigationOptional();

  if (!navigation?.canGoBack) {
    return null;
  }

  const { previousEntry, pop } = navigation;

  const previousName =
    previousEntry && "name" in previousEntry ? previousEntry.name : undefined;

  const label = previousName ? t`Back to ${previousName}` : t`Back`;

  return (
    <Button
      variant="subtle"
      color="text-secondary"
      size="sm"
      leftSection={<Icon name="chevronleft" />}
      onClick={pop}
      pl={0}
      style={style}
      className={cx(className, S.backButton)}
      aria-label={label}
    >
      {label}
    </Button>
  );
};
