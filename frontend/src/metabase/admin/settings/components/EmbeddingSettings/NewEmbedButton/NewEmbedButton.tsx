import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { Button } from "metabase/ui";

export const NewEmbedButton = () => {
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
                isGuest: true,
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
