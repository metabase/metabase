import classNames from "classnames";
import type { FocusEvent, MouseEvent, KeyboardEvent } from "react";
import { useRef, useState, useMemo } from "react";
import { t } from "ttag";

import { QueryColumnPicker } from "metabase/common/components/QueryColumnPicker";
import { color } from "metabase/lib/colors";
import { Button, Icon, Input, Popover, FocusTrap } from "metabase/ui";
import { getThemeOverrides } from "metabase/ui/theme";
import * as Lib from "metabase-lib";

import styles from "./ColumnInput.module.css";

type ColumnInputProps = {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  label: string;
  value: Lib.ColumnMetadata | null;
  onChange: (column: Lib.ColumnMetadata | null) => void;
};

const theme = getThemeOverrides();

export function ColumnInput({
  query,
  stageIndex,
  columns,
  label,
  value,
  onChange,
}: ColumnInputProps) {
  const columnGroups = useMemo(() => Lib.groupColumns(columns), [columns]);

  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  function handleOpen() {
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
    button.current?.focus();
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget || !event.relatedTarget) {
      return;
    }
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setTimeout(() => setOpen(false), 100);
    }
  }

  function handleButtonClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setOpen(open => !open);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter") {
      setOpen(true);
    }
  }

  const dropdown = (
    <FocusTrap active={open}>
      <div onBlur={handleBlur}>
        <QueryColumnPicker
          query={query}
          stageIndex={stageIndex}
          columnGroups={columnGroups}
          onSelect={onChange}
          onClose={handleClose}
          checkIsColumnSelected={item => item.column === value}
          width="100%"
        />
      </div>
    </FocusTrap>
  );

  const text = useMemo(() => {
    if (!value) {
      return t`Select a column...`;
    }
    const info = Lib.displayInfo(query, stageIndex, value);
    return info.longDisplayName;
  }, [value, query, stageIndex]);

  return (
    <Input.Wrapper
      label={label}
      styles={{
        root: { width: "100%" },
        label: {
          marginBottom: theme.spacing?.xs,
          fontSize: theme.fontSizes?.md,
          color: color("text-medium"),
        },
      }}
    >
      <Popover
        opened={open}
        onClose={handleClose}
        onOpen={handleOpen}
        closeOnEscape
        closeOnClickOutside
        width="target"
        returnFocus
      >
        <Popover.Target>
          <Button
            data-testid="column-input"
            ref={button}
            onMouseDownCapture={handleButtonClick}
            onKeyDown={handleKeyDown}
            fullWidth
            classNames={{
              root: classNames(styles.root, { [styles.open]: open }),
              inner: styles.button,
            }}
            rightIcon={<Icon name="chevrondown" style={{ height: 14 }} />}
          >
            {text}
          </Button>
        </Popover.Target>
        <Popover.Dropdown setupSequencedCloseHandler={open}>
          {dropdown}
        </Popover.Dropdown>
      </Popover>
    </Input.Wrapper>
  );
}
