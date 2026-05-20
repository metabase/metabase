import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
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
        dispatch(
          setOpenModalWithProps({
            id: "embed",
            props: {
              initialState: {
                isGuest: forceIsGuest,
                useExistingUserSession: true,
              },
            },
          }),
        );
      }}
    >
      {t`New embed`}
    </Button>
  );
};
