import { t } from "ttag";

import { Sidesheet } from "metabase/common/components/Sidesheet";
import { Flex } from "metabase/ui";

import { FieldOrderDropdown } from "./FieldOrderDropdown";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FieldOrderSidesheet = ({ isOpen, onClose }: Props) => {
  return (
    <Sidesheet title={t`Edit column order`} onClose={onClose} isOpen={isOpen}>
      <Flex>
        <FieldOrderDropdown />
      </Flex>
    </Sidesheet>
  );
};
