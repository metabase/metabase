import { useState } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import Modal from "metabase/common/components/Modal";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type Segment from "metabase-lib/v1/metadata/Segment";

import SegmentRetireModal from "./SegmentRetireModal";

interface SegmentActionSelectProps {
  segment: Segment;
  onRetire: () => void;
}

export const SegmentActionSelect = ({
  segment,
  onRetire,
}: SegmentActionSelectProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item component={Link} to={`/bench/segment/${segment.id}`}>
            {t`Edit Segment`}
          </Menu.Item>
          <Menu.Item
            component={Link}
            to={`/bench/segment/${segment.id}/revisions`}
          >
            {t`Revision History`}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            c="error"
            onClick={() => setIsModalOpen(true)}
          >{t`Retire Segment`}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <SegmentRetireModal
          object={segment}
          onRetire={async () => {
            await onRetire();
            setIsModalOpen(false);
          }}
          onClose={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  );
};
