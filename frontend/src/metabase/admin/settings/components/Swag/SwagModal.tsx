import { useLocalStorage } from "react-use";
import { t } from "ttag";

import { getCurrentUser } from "metabase/admin/datamodel/selectors";
import { useSelector } from "metabase/lib/redux";
import { Button, Flex, Modal, type ModalProps, Text } from "metabase/ui";

import { SWAG_51_LOCAL_STORAGE_KEY, SWAG_LINK } from "./constants";

export const SwagModal = (props: Pick<ModalProps, "opened" | "onClose">) => {
  const user = useSelector(getCurrentUser);
  const url = user.email ? `${SWAG_LINK}?email=${user.email}` : SWAG_LINK;

  const [_value, setValue, _remove] = useLocalStorage(
    SWAG_51_LOCAL_STORAGE_KEY,
  );

  return (
    <Modal title={t`A little something from us to you`} {...props} size={560}>
      <Text mt="0.5rem">
        {t`As a thank-you for trying out this beta we’d love to send you some swag, while our supplies last. Click the button to give us your details and we’ll send you an email with instructions.`}
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
