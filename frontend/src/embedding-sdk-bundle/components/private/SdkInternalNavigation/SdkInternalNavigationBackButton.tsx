import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import { useSdkInternalNavigationOptional } from "./context";

/**
 * A back button that navigates to the previous entry in the SDK internal navigation stack.
 * Returns null if there's no navigation context or if there's no previous entry to go back to.
 */
export const SdkInternalNavigationBackButton = ({
  style,
}: {
  style?: React.CSSProperties;
}) => {
  const navigation = useSdkInternalNavigationOptional();

  if (!navigation?.canGoBack) {
    return null;
  }

  const { previousEntry, pop } = navigation;

  return (
    <Button
      variant="subtle"
      color="text-secondary"
      size="sm"
      leftSection={<Icon name="chevronleft" />}
      onClick={pop}
      pl={0}
      style={style}
    >
      {t`Back to ${previousEntry?.name}`}
    </Button>
  );
};
