import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Button } from "metabase/ui";

export const CancelEditButton = (props: { onClick: () => void }) => {
  useRegisterShortcut([
    {
      id: "dashboard-cancel-edit",
      perform: props.onClick,
    },
  ]);

  return (
    <Button key="cancel" variant="subtle" size="sm" onClick={props.onClick}>
      {t`Cancel`}
    </Button>
  );
};
