import type Tether from "tether";
import type { PopoverBaseProps } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../../NotebookCell";
import { ClausePopover } from "./ClausePopover";

type RenderItemOpts<T> = {
  item: T;
  index: number;
  onOpen?: () => void;
};

type RenderPopoverOpts<T> = {
  item?: T;
  index?: number;
  onClose?: () => void;
};

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
  renderPopover: (opts: RenderPopoverOpts<T>) => JSX.Element | null;
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
  const renderNewItem = ({ onOpen }: { onOpen?: () => void }) => (
    <NotebookCellAdd
      initialAddText={items.length === 0 && initialAddText}
      color={color}
      onClick={onOpen}
    />
  );

  const renderItem = ({ item, index, onOpen }: RenderItemOpts<T>) => (
    <NotebookCellItem color={color} readOnly={readOnly} onClick={onOpen}>
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
            triggerElement={renderItem({ item, index })}
            tetherOptions={tetherOptions}
            sizeToFit
          >
            {renderPopover({ item, index })}
          </PopoverWithTrigger>
        ))}
        {!readOnly && (
          <PopoverWithTrigger
            isInitiallyOpen={isLastOpened}
            triggerElement={renderNewItem({})}
            tetherOptions={tetherOptions}
            sizeToFit
          >
            {renderPopover({})}
          </PopoverWithTrigger>
        )}
      </NotebookCell>
    );
  }

  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      {items.map((item, index) => (
        <ClausePopover
          {...popoverProps}
          key={index}
          renderItem={onOpen => renderItem({ item, index, onOpen })}
          renderPopover={onClose => renderPopover({ item, index, onClose })}
        />
      ))}
      {!readOnly && (
        <ClausePopover
          {...popoverProps}
          isInitiallyOpen={isLastOpened}
          renderItem={onOpen => renderNewItem({ onOpen })}
          renderPopover={onClose => renderPopover({ onClose })}
        />
      )}
    </NotebookCell>
  );
};
