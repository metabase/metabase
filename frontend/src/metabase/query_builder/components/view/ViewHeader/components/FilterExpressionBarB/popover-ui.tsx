import cx from "classnames";
import type { ReactNode, Ref } from "react";
import { Fragment } from "react";
import { createPortal } from "react-dom";

import { Checkbox, Flex, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "../KeyboardFilterRow/KeyboardFilterRow.module.css";
import { UNSCORED, getOptionScores } from "../KeyboardFilterRow/fuzzy-search";
import type { SuggestionGroup } from "../KeyboardFilterRow/types";
import { getTileShareStyle } from "../KeyboardFilterRow/value-widgets";

import BS from "./FilterExpressionBarB.module.css";

export type BarOption = {
  id: string;
  label: string;
  icon?: IconName;
  description?: string;
  leftSection?: ReactNode;
  isChecked?: boolean;
  share?: { value: number; label: string };
  run: () => void;
};

export type BarOptionGroup = {
  section?: string;
  label?: string;
  options: BarOption[];
};

export const DEFAULT_POPOVER_WIDTH = 300;
const POPOVER_OFFSET = 8;

export type Anchor = { left: number; top: number };

export function getAnchorBelow(rect: { left: number; bottom: number }): Anchor {
  return { left: rect.left, top: rect.bottom + POPOVER_OFFSET };
}

function isTextInput(target: EventTarget) {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      ["text", "search", "number", ""].includes(target.type))
  );
}

interface BarPopoverProps {
  anchor: Anchor;
  width?: number;
  /** A panel on the right of the main content, like a map. */
  aside?: ReactNode;
  /** Clicks keep the focus in the editor, except in text inputs. */
  keepsEditorFocus?: boolean;
  popoverRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

/** A popover at a fixed point of the window, outside the editor's DOM. */
export function BarPopover({
  anchor,
  width = DEFAULT_POPOVER_WIDTH,
  aside,
  keepsEditorFocus = true,
  popoverRef,
  children,
}: BarPopoverProps) {
  const maxLeft = window.innerWidth - width - POPOVER_OFFSET * 2;
  return createPortal(
    <div
      ref={popoverRef}
      className={cx(BS.popover, { [BS.popoverWithAside]: aside != null })}
      style={{
        left: Math.max(POPOVER_OFFSET, Math.min(anchor.left, maxLeft)),
        top: anchor.top,
        width,
      }}
      onMouseDown={(event) => {
        if (keepsEditorFocus && !isTextInput(event.target)) {
          event.preventDefault();
        }
      }}
    >
      <div className={BS.popoverMain}>{children}</div>
      {aside != null && <div className={S.dropdownAside}>{aside}</div>}
    </div>,
    document.body,
  );
}

/** The groups with the options that match the text, best matches first. */
export function searchGroups(
  groups: SuggestionGroup[],
  text: string,
): SuggestionGroup[] {
  const searchText = text.trim().toLowerCase();
  if (searchText.length === 0) {
    return groups;
  }
  const scores = getOptionScores(groups, searchText);
  return groups
    .map((group) => ({
      ...group,
      options: group.isUnfiltered
        ? group.options
        : group.options
            .filter((option) => scores.has(option.value))
            .sort(
              (a, b) =>
                (scores.get(a.value) ?? UNSCORED) -
                (scores.get(b.value) ?? UNSCORED),
            ),
    }))
    .filter((group) => group.options.length > 0);
}

export function flattenOptions(groups: BarOptionGroup[]) {
  return groups.flatMap((group) => group.options);
}

interface OptionListProps {
  groups: BarOptionGroup[];
  highlightIndex: number;
  isTiles?: boolean;
  columns?: number;
  isMultiSelect?: boolean;
  maxHeight?: string;
  emptyMessage?: string;
  onHighlight: (index: number) => void;
}

/**
 * The options of a popover, by section. The highlight follows mouse moves,
 * not mouse enters, so a list that opens under a resting pointer keeps its
 * highlight.
 */
export function OptionList({
  groups,
  highlightIndex,
  isTiles = false,
  columns = 1,
  isMultiSelect = false,
  maxHeight = "20rem",
  emptyMessage,
  onHighlight,
}: OptionListProps) {
  let flatIndex = -1;
  const hasOptions = groups.some((group) => group.options.length > 0);
  if (!hasOptions) {
    return emptyMessage != null ? (
      <div className={BS.empty}>{emptyMessage}</div>
    ) : null;
  }
  return (
    <div className={BS.options} style={{ maxHeight }}>
      {groups.map((group, groupIndex) => (
        <Fragment key={groupIndex}>
          {group.section != null &&
            group.section !== groups[groupIndex - 1]?.section && (
              <div
                className={cx(S.sectionHeader, {
                  [S.sectionDivider]: groupIndex > 0,
                })}
              >
                {group.section}
              </div>
            )}
          {group.label != null && (
            <div className={S.groupLabel}>{group.label}</div>
          )}
          <div
            className={cx({ [S.optionGrid]: isTiles || columns > 1 })}
            style={
              isTiles || columns > 1
                ? {
                    gridTemplateColumns: `repeat(${isTiles ? 2 : columns}, minmax(0, 1fr))`,
                  }
                : undefined
            }
          >
            {group.options.map((option) => {
              flatIndex++;
              const index = flatIndex;
              const isHighlighted = index === highlightIndex;
              return (
                <div
                  key={option.id}
                  ref={(element) => {
                    if (isHighlighted) {
                      element?.scrollIntoView({ block: "nearest" });
                    }
                  }}
                  role="option"
                  aria-selected={isHighlighted}
                  className={cx(
                    isTiles ? S.tile : BS.option,
                    { [S.shareTile]: isTiles && option.share != null },
                    { [BS.isHighlighted]: isHighlighted },
                  )}
                  style={
                    isTiles && option.share != null
                      ? getTileShareStyle(option.share.value)
                      : undefined
                  }
                  data-combobox-selected={isHighlighted || undefined}
                  aria-pressed={
                    isTiles ? (option.isChecked ?? false) : undefined
                  }
                  onMouseMove={() => {
                    if (!isHighlighted) {
                      onHighlight(index);
                    }
                  }}
                  onClick={option.run}
                >
                  {isMultiSelect && !isTiles ? (
                    <Checkbox
                      className={S.optionCheckbox}
                      classNames={{
                        labelWrapper: S.optionCheckboxLabelWrapper,
                      }}
                      checked={option.isChecked ?? false}
                      label={<OptionLabel option={option} />}
                      readOnly
                      tabIndex={-1}
                    />
                  ) : (
                    <OptionLabel
                      option={
                        isTiles && option.isChecked
                          ? { ...option, icon: "check" }
                          : option
                      }
                    />
                  )}
                  {isTiles && option.share != null && (
                    <span className={S.tileShare}>{option.share.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function OptionLabel({ option }: { option: BarOption }) {
  return (
    <Flex align="center" gap="sm" miw={0}>
      {option.icon && <Icon name={option.icon} />}
      {option.leftSection}
      <span className={S.optionLabel} title={option.label}>
        {option.label}
      </span>
      {option.description && (
        <span className={S.optionDescription}>{option.description}</span>
      )}
    </Flex>
  );
}
