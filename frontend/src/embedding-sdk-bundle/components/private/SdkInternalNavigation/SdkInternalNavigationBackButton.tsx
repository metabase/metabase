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

  // Get the name from the previous entry (placeholder entries don't have names)
  const previousName =
    previousEntry && "name" in previousEntry ? previousEntry.name : undefined;

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
      {previousName ? t`Back to ${previousName}` : t`Back`}
    </Button>
  );
};
