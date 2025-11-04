import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import PopoverWithTrigger from "metabase/common/components/PopoverWithTrigger";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Icon, Modal } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import { ActionLink, TriggerIconContainer } from "./SegmentActionSelect.styled";
import SegmentRetireModal from "./SegmentRetireModal";

interface SegmentActionSelectProps {
  object: Segment;
  onRetire: () => void;
}

export function SegmentActionSelect({
  object,
  onRetire,
}: SegmentActionSelectProps) {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  const handleRetire = async (_payload: Segment) => {
    await onRetire();
    closeModal();
  };

  return (
    <>
      <PopoverWithTrigger
        triggerElement={
          <TriggerIconContainer>
            <Icon name="ellipsis" />
          </TriggerIconContainer>
        }
      >
        <ul className={AdminS.UserActionsSelect}>
          <li>
            <ActionLink to={`/admin/datamodel/segment/${object.id}`}>
              {t`Edit Segment`}
            </ActionLink>
          </li>
          <li>
            <ActionLink to={`/admin/datamodel/segment/${object.id}/revisions`}>
              {t`Revision History`}
            </ActionLink>
          </li>
          <li className={cx(CS.mt1, CS.borderTop)}>
            <a
              className={cx(
                CS.block,
                CS.p2,
                CS.bgErrorHover,
                CS.textError,
                CS.textWhiteHover,
                CS.cursorPointer,
              )}
              onClick={openModal}
            >
              {t`Retire Segment`}
            </a>
          </li>
        </ul>
      </PopoverWithTrigger>
      <Modal opened={modalOpened} onClose={closeModal}>
        <SegmentRetireModal
          object={object}
          onRetire={handleRetire}
          onClose={closeModal}
        />
      </Modal>
    </>
  );
}
