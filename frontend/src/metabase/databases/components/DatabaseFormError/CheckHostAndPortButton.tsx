import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

export const CheckHostAndPortButton = () => {
  const onCheckHostAndPortClick = () => {
    // Scroll to the area with errors
    const scrollableEl = document.getElementById(
      "scrollable-database-form-body",
    );
    const dataErrorEl =
      scrollableEl?.querySelector<HTMLDivElement>("div[data-error]");

    if (dataErrorEl) {
      const y = dataErrorEl.offsetTop - 48; // 48px clearance
      scrollableEl?.scrollTo({ behavior: "smooth", top: y });
    }
  };

  return (
    <Button
      fw={700}
      fz="md"
      leftSection={<Icon name="gear" size={12} />}
      onClick={onCheckHostAndPortClick}
      variant="subtle"
    >
      {t`Check Host and Port settings`}
    </Button>
  );
};
