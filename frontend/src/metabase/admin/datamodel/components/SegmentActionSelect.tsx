import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { Segment } from "metabase-types/api";

import S from "./SegmentActionSelect.module.css";
import { SegmentRetireModal } from "./SegmentRetireModal";

interface SegmentActionSelectProps {
  object: Segment;
  onRetire: () => void;
  readOnly?: boolean;
}

export function SegmentActionSelect({
  object,
  onRetire,
  readOnly,
}: SegmentActionSelectProps) {
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown p="sm">
          {!readOnly && (
            <Menu.Item component={Link} to={Urls.dataModelSegment(object.id)}>
              {t`Edit Segment`}
            </Menu.Item>
          )}
          <Menu.Item
            component={Link}
            to={Urls.dataModelSegmentRevisions(object.id)}
          >
            {t`Revision History`}
          </Menu.Item>
          {!readOnly && (
            <>
              <Menu.Divider />
              <Menu.Item className={S.dangerItem} onClick={openModal}>
                {t`Retire Segment`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      <SegmentRetireModal
        opened={modalOpened}
        onClose={closeModal}
        onRetire={onRetire}
      />
    </>
  );
}
