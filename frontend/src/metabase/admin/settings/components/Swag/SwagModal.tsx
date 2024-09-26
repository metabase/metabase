import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Button, Flex, Modal, type ModalProps, Text } from "metabase/ui";

import { SWAG_51_LOCAL_STORAGE_KEY } from "./constants";

const SWAG_LINK = "https://metaba.se/rc-51-swag";

export const SwagModal = (props: Pick<ModalProps, "opened" | "onClose">) => {
  const user = useSelector(getCurrentUser);
  const url = user.email ? `${SWAG_LINK}?email=${user.email}` : SWAG_LINK;

  const [_value, setValue, _remove] = useLocalStorage(
    SWAG_51_LOCAL_STORAGE_KEY,
  );

  return (
    <Modal title={t`A little somthing from us to you`} {...props} size="lg">
      <Text>
        {t`As a thank-you for trying out our release candidate, here's a one-time
        link to claim some sweet, sweet Metabase swag`}
      </Text>
      <Flex justify="center" pt="1.5rem">
        <Button
          component={"a"}
          href={url}
          target="_blank"
          variant="filled"
          onClick={() => {
            setValue(true);
            props.onClose();
          }}
        >
          {t`Get my swag`}
        </Button>
      </Flex>
    </Modal>
  );
};
