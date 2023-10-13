import type Tether from "tether";
import type { PopoverBaseProps } from "metabase/ui";
import { Popover } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../../NotebookCell";

export interface ClauseStepProps<T> {
  color: string;
  items: T[];
  isLastOpened?: boolean;
  initialAddText?: string | null;
  tetherOptions?: Tether.ITetherOptions | null;
  popoverProps?: PopoverBaseProps;
  readOnly?: boolean;
  withLegacyPopover?: boolean;
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (item?: T, index?: number) => JSX.Element | null;
  canRemove?: (item: T) => boolean;
  onRemove?: ((item: T, index: number) => void) | null;
  "data-testid"?: string;
}

export const ClauseStep = <T,>({
  color,
  items,
  isLastOpened = false,
  initialAddText = null,
  tetherOptions = null,
  popoverProps = {},
  readOnly,
  withLegacyPopover = false,
  renderName,
  renderPopover,
  canRemove,
  onRemove = null,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  const addItemElement = (
    <NotebookCellAdd
      color={color}
      initialAddText={items.length === 0 && initialAddText}
    />
  );

  const renderItem = (item: T, index: number) => (
    <NotebookCellItem color={color} readOnly={readOnly}>
      {renderName(item, index)}
      {!readOnly && onRemove && (!canRemove || canRemove(item)) && (
        <Icon
          className="ml1"
          name="close"
          onClick={e => {
            e.stopPropagation();
            onRemove(item, index);
          }}
        />
      )}
    </NotebookCellItem>
  );

  if (withLegacyPopover) {
    return (
      <NotebookCell color={color} data-testid={props["data-testid"]}>
        {items.map((item, index) => (
          <PopoverWithTrigger
            key={index}
            triggerElement={renderItem(item, index)}
            tetherOptions={tetherOptions}
            sizeToFit
          >
            {renderPopover(item, index)}
          </PopoverWithTrigger>
        ))}
        {!readOnly && (
          <PopoverWithTrigger
            isInitiallyOpen={isLastOpened}
            triggerElement={addItemElement}
            tetherOptions={tetherOptions}
            sizeToFit
          >
            {renderPopover()}
          </PopoverWithTrigger>
        )}
      </NotebookCell>
    );
  }

  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      {items.map((item, index) => (
        <Popover key={index} trapFocus {...popoverProps}>
          <Popover.Target>{renderItem(item, index)}</Popover.Target>
          <Popover.Dropdown>{renderPopover(item, index)}</Popover.Dropdown>
        </Popover>
      ))}
      {!readOnly && (
        <Popover defaultOpened={isLastOpened} trapFocus {...popoverProps}>
          <Popover.Target>{addItemElement}</Popover.Target>
          <Popover.Dropdown>{renderPopover()}</Popover.Dropdown>
        </Popover>
      )}
    </NotebookCell>
  );
};
