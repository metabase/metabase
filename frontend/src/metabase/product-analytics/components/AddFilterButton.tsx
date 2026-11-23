import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Icon, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./AddFilterButton.module.css";
import { AddFilterPopover } from "./AddFilterPopover";

type AddFilterButtonProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
};

export const AddFilterButton = ({ query, onChange }: AddFilterButtonProps) => {
  const [isOpened, { close, toggle }] = useDisclosure(false);

  return (
    <AddFilterPopover
      query={query}
      isOpened={isOpened}
      onChange={onChange}
      onClose={close}
    >
      <UnstyledButton
        className={S.add}
        aria-label={t`Add a filter`}
        onClick={toggle}
      >
        <Icon name="add" size={12} />
      </UnstyledButton>
    </AddFilterPopover>
  );
};
