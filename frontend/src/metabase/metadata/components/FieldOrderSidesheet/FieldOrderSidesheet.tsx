import { t } from "ttag";

import { Sidesheet } from "metabase/common/components/Sidesheet";
import { Flex } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { FieldOrderDropdown } from "./FieldOrderDropdown";

interface Props {
  isOpen: boolean;
  tableId: TableId;
  onClose: () => void;
}

export const FieldOrderSidesheet = ({ isOpen, tableId, onClose }: Props) => {
  return (
    <Sidesheet title={t`Edit column order`} onClose={onClose} isOpen={isOpen}>
      <Flex>
        <FieldOrderDropdown tableId={tableId} />
      </Flex>
    </Sidesheet>
  );
};
