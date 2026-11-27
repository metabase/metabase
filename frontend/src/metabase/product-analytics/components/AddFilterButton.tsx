import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Icon, UnstyledButton } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./AddFilterButton.module.css";
import { AddFilterPopover } from "./AddFilterPopover";

type AddFilterButtonProps = {
  query: Lib.Query;
  label?: string;
  isInitiallyOpened?: boolean;
  onChange: (query: Lib.Query) => void;
};

export const AddFilterButton = ({
  query,
  label = t`Add a filter`,
  isInitiallyOpened = false,
  onChange,
}: AddFilterButtonProps) => {
  const [isOpened, { close, toggle }] = useDisclosure(isInitiallyOpened);

  return (
    <AddFilterPopover
      query={query}
      isOpened={isOpened}
      onChange={onChange}
      onClose={close}
    >
      <UnstyledButton className={S.add} aria-label={label} onClick={toggle}>
        <Icon name="add" size={12} />
      </UnstyledButton>
    </AddFilterPopover>
  );
};
