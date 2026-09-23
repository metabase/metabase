import { t } from "ttag";

import { openEmbedJsWizard } from "metabase/embedding/store/embed-setup-modal";
import { useDispatch } from "metabase/redux";
import { Button } from "metabase/ui";

interface NewEmbedButtonProps {
  /**
   * Force initial authentication mode to `guest`
   */
  forceIsGuest?: boolean;
}

export const NewEmbedButton = ({ forceIsGuest }: NewEmbedButtonProps) => {
  const dispatch = useDispatch();

  return (
    <Button
      variant="brand"
      size="sm"
      onClick={() => {
        dispatch(openEmbedJsWizard({ isGuest: forceIsGuest }));
      }}
    >
      {t`New embed`}
    </Button>
  );
};
