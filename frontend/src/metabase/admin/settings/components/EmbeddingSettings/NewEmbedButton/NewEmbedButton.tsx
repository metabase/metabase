import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { SdkIframeEmbedSetupModalProps } from "metabase/plugins";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Button } from "metabase/ui";

export const NewEmbedButton = () => {
  const dispatch = useDispatch();

  return (
    <Button
      variant="brand"
      size="sm"
      onClick={() => {
        const modalProps: Pick<SdkIframeEmbedSetupModalProps, "initialState"> =
          {
            initialState: {
              isGuest: true,
              useExistingUserSession: true,
            },
          };

        dispatch(setOpenModalWithProps({ id: "embed", props: modalProps }));
      }}
    >
      {t`New embed`}
    </Button>
  );
};
