import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

export const CheckHostAndPortButton = () => {
  const onCheckHostAndPortClick = () => {
    // Scroll to the area with errors
    document
      .querySelector<HTMLDivElement>("div[data-error]")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Button
      leftSection={<Icon name="gear" />}
      onClick={onCheckHostAndPortClick}
      variant="subtle"
    >
      {t`Check Host and Port settings`}
    </Button>
  );
};
