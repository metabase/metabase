import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Link } from "metabase/common/components/Link";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { useSegmentDrag } from "../../segments/drag-context";
import type { PaletteSegment } from "../../segments/types";

import S from "./PaletteSegmentItem.module.css";

/**
 * What a saved segment's menu offers. The pages open in a new tab, so the
 * analysis stays put. Each is omitted when it isn't available, e.g. without
 * permission to write segments.
 */
export type SavedSegmentActions = {
  /** The segment editor. */
  editUrl?: string;
  revisionsUrl?: string;
  /** The segment's page in Data Studio. */
  dataStudioUrl?: string;
  onRemove?: () => void;
};

type PaletteSegmentItemProps = {
  segment: PaletteSegment;
  /** Makes a click use the segment, as a drop would. */
  onSelect?: () => void;
  onEditDraft?: () => void;
  onSaveDraft?: () => void;
  onDiscardDraft?: () => void;
  /** A saved segment's definition, shown below the row when expanded. */
  definition?: ReactNode;
  savedActions?: SavedSegmentActions;
};

/**
 * A segment in the palette, dragged by its whole row. A click on a saved
 * segment shows its definition, read-only, and another hides it, unless the
 * click uses the segment; then its menu shows the definition.
 */
export const PaletteSegmentItem = ({
  segment,
  onSelect,
  onEditDraft,
  onSaveDraft,
  onDiscardDraft,
  definition,
  savedActions = {},
}: PaletteSegmentItemProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDefinition = definition !== undefined;
  const toggleExpanded = () => setIsExpanded((expanded) => !expanded);
  const handleClick = onSelect ?? (hasDefinition ? toggleExpanded : undefined);
  const { dragging, hovering, startDrag, endDrag, setHovering } =
    useSegmentDrag();
  const isDragging =
    dragging?.kind === "segment" && dragging.segment.key === segment.key;

  return (
    <Stack
      className={S.item}
      role={handleClick !== undefined ? "button" : undefined}
      tabIndex={handleClick !== undefined ? 0 : undefined}
      aria-expanded={hasDefinition ? isExpanded : undefined}
      data-status={segment.status}
      data-dragging={isDragging}
      data-selectable={handleClick !== undefined}
      draggable
      onClick={handleClick}
      onKeyDown={(event) => {
        if (handleClick !== undefined && event.key === "Enter") {
          handleClick();
        }
      }}
      onMouseEnter={() => setHovering(segment)}
      onMouseLeave={() => {
        if (hovering?.key === segment.key) {
          setHovering(null);
        }
      }}
      gap={0}
      bdrs="md"
      onDragStart={(event) => startDrag(segment, event)}
      onDragEnd={() => {
        endDrag();
        setHovering(null);
      }}
    >
      <Group gap="sm" wrap="nowrap" p="xs">
        <Box c="text-disabled" display="flex" style={{ flexShrink: 0 }}>
          <Icon name="grabber" size={12} />
        </Box>
        {segment.status !== "sample" && (
          <Icon
            name="segment"
            className={S.segmentIcon}
            data-status={segment.status}
            aria-hidden
          />
        )}
        <Tooltip
          label={segment.description}
          disabled={!segment.description}
          openDelay={400}
          position="right"
        >
          <Text
            truncate
            flex={1}
            miw={0}
            // A draft isn't a segment yet; its name reads quieter.
            c={segment.status === "draft" ? "text-secondary" : undefined}
          >
            {segment.name}
          </Text>
        </Tooltip>
        {segment.status === "draft" && (
          <RowMenu label={t`Draft options`}>
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={onEditDraft}
            >
              {t`Edit draft`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="bookmark" />}
              onClick={onSaveDraft}
            >
              {t`Save as a segment…`}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="trash" />}
              onClick={onDiscardDraft}
            >
              {t`Discard draft`}
            </Menu.Item>
          </RowMenu>
        )}
        {segment.status === "saved" && (
          <SavedSegmentMenu
            actions={savedActions}
            // The row's click uses the segment, so the menu shows it instead.
            definitionToggle={
              hasDefinition && onSelect !== undefined
                ? { isExpanded, onToggle: toggleExpanded }
                : undefined
            }
          />
        )}
      </Group>
      {hasDefinition && isExpanded && (
        // Reading the definition shouldn't use or collapse the segment.
        <Box
          px="sm"
          pb="sm"
          pt="xs"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {definition}
        </Box>
      )}
    </Stack>
  );
};

type RowMenuProps = {
  label: string;
  children: ReactNode;
};

/** A row's "…" menu. */
const RowMenu = ({ label, children }: RowMenuProps) => (
  // The row's own click (use, edit or expand) must not fire from the menu.
  <Box
    display="flex"
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
  >
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size="sm" variant="subtle" aria-label={label}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{children}</Menu.Dropdown>
    </Menu>
  </Box>
);

type SavedSegmentMenuProps = {
  actions: SavedSegmentActions;
  definitionToggle?: { isExpanded: boolean; onToggle: () => void };
};

const SavedSegmentMenu = ({
  actions: { editUrl, revisionsUrl, dataStudioUrl, onRemove },
  definitionToggle,
}: SavedSegmentMenuProps) => {
  const [isConfirmOpen, { open: openConfirm, close: closeConfirm }] =
    useDisclosure();
  if (
    definitionToggle === undefined &&
    [editUrl, revisionsUrl, dataStudioUrl, onRemove].every(
      (action) => action === undefined,
    )
  ) {
    return null;
  }

  return (
    <>
      <RowMenu label={t`Segment actions`}>
        {definitionToggle !== undefined && (
          <Menu.Item
            leftSection={
              <Icon
                name={definitionToggle.isExpanded ? "chevronup" : "chevrondown"}
              />
            }
            onClick={definitionToggle.onToggle}
          >
            {definitionToggle.isExpanded
              ? t`Hide definition`
              : t`Show definition`}
          </Menu.Item>
        )}
        {editUrl !== undefined && (
          <NewTabMenuItem to={editUrl} icon="pencil">
            {t`Edit segment`}
          </NewTabMenuItem>
        )}
        {revisionsUrl !== undefined && (
          <NewTabMenuItem to={revisionsUrl} icon="history">
            {t`Revision history`}
          </NewTabMenuItem>
        )}
        {dataStudioUrl !== undefined && (
          <NewTabMenuItem to={dataStudioUrl} icon="external">
            {t`View in Data Studio`}
          </NewTabMenuItem>
        )}
        {onRemove !== undefined && (
          <Menu.Item
            c="feedback-negative"
            leftSection={<Icon name="trash" />}
            onClick={openConfirm}
          >
            {t`Remove segment`}
          </Menu.Item>
        )}
      </RowMenu>
      {onRemove !== undefined && (
        // React bubbles the portaled modal's clicks to the row; keep them there.
        <Box
          display="contents"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <ConfirmModal
            title={t`Remove this segment?`}
            message={t`This segment will be permanently removed.`}
            opened={isConfirmOpen}
            onClose={closeConfirm}
            onConfirm={() => {
              closeConfirm();
              onRemove();
            }}
            confirmButtonText={t`Remove`}
          />
        </Box>
      )}
    </>
  );
};

type NewTabMenuItemProps = {
  to: string;
  icon: IconName;
  children: ReactNode;
};

/** A menu link that opens in a new tab, so the analysis stays put. */
const NewTabMenuItem = ({ to, icon, children }: NewTabMenuItemProps) => (
  <Menu.Item
    component={Link}
    to={to}
    target="_blank"
    rel="noopener noreferrer"
    leftSection={<Icon name={icon} />}
  >
    {children}
  </Menu.Item>
);
