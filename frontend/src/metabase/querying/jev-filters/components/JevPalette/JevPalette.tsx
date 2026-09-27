import cx from "classnames";
import type { ChangeEvent, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { t } from "ttag";

import { Box, Icon, Loader, Modal, Skeleton, Stack, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { formatProbability } from "../../utils";

import S from "./JevPalette.module.css";

/** Shared building blocks for the Jev command palettes (filters, create). */

interface JevPaletteModalProps {
  opened: boolean;
  onClose: () => void;
  ariaLabel: string;
  testId: string;
  children: ReactNode;
}

export function JevPaletteModal({
  opened,
  onClose,
  ariaLabel,
  testId,
  children,
}: JevPaletteModalProps) {
  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      size={680}
      centered={false}
      yOffset="10vh"
      closeOnEscape={false}
      padding={0}
    >
      <Modal.Overlay />
      <Modal.Content
        className={S.content}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {children}
      </Modal.Content>
    </Modal.Root>
  );
}

interface JevPaletteInputProps {
  listId: string;
  activeDescendant?: string;
  ariaLabel: string;
  placeholder: string;
  value: string;
  isFetching: boolean;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function JevPaletteInput({
  listId,
  activeDescendant,
  ariaLabel,
  placeholder,
  value,
  isFetching,
  onChange,
  onKeyDown,
}: JevPaletteInputProps) {
  return (
    <Box className={S.inputRow}>
      <Icon name="sparkles" className={S.inputIcon} />
      <input
        className={S.input}
        data-autofocus
        role="combobox"
        aria-expanded
        aria-autocomplete="list"
        aria-controls={listId}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.currentTarget.value)
        }
        onKeyDown={onKeyDown}
      />
      {isFetching && <Loader size="xs" className={S.inputLoader} />}
    </Box>
  );
}

interface JevPaletteListProps {
  id: string;
  ariaLabel: string;
  children: ReactNode;
}

const keepInputFocus = (event: MouseEvent) => event.preventDefault();

export function JevPaletteList({
  id,
  ariaLabel,
  children,
}: JevPaletteListProps) {
  return (
    <Box
      id={id}
      role="listbox"
      aria-label={ariaLabel}
      className={S.list}
      onMouseDown={keepInputFocus}
    >
      {children}
    </Box>
  );
}

interface JevPaletteSkeletonProps {
  testId: string;
  count?: number;
}

export function JevPaletteSkeleton({
  testId,
  count = 3,
}: JevPaletteSkeletonProps) {
  return (
    <Stack gap="sm" p="sm" data-testid={testId}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} h="1.75rem" radius="sm" />
      ))}
    </Stack>
  );
}

interface JevPaletteRowFrameProps {
  id: string;
  name: string;
  icon: IconName;
  detail?: ReactNode;
  isActive: boolean;
  isHighlighted: boolean;
  testId: string;
  onActivate: () => void;
  children: ReactNode;
}

export function JevPaletteRowFrame({
  id,
  name,
  icon,
  detail,
  isActive,
  isHighlighted,
  testId,
  onActivate,
  children,
}: JevPaletteRowFrameProps) {
  return (
    <Box
      id={id}
      role="option"
      aria-selected={isActive}
      aria-label={name}
      className={cx(S.row, {
        [S.rowActive]: isActive,
        [S.rowSuggested]: isHighlighted,
      })}
      onClick={onActivate}
      data-testid={testId}
    >
      <Icon name={icon} c="text-secondary" />
      <Box className={S.rowName}>
        <Text fw="bold" truncate>
          {name}
        </Text>
        {detail != null && (
          <Text size="xs" c="text-secondary" truncate>
            {detail}
          </Text>
        )}
      </Box>
      <Box className={S.options}>{children}</Box>
    </Box>
  );
}

interface JevPaletteChipProps {
  label: ReactNode;
  probability?: number;
  icon?: IconName;
  isSelected: boolean;
  isGhost?: boolean;
  onClick: () => void;
}

export function JevPaletteChip({
  label,
  probability,
  icon,
  isSelected,
  isGhost = false,
  onClick,
}: JevPaletteChipProps) {
  return (
    <button
      type="button"
      className={cx(S.option, {
        [S.optionSelected]: isSelected,
        [S.optionGhost]: isGhost,
      })}
      aria-pressed={isSelected}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {icon && <Icon name={icon} size={12} className={S.optionIcon} />}
      <span className={S.optionLabel}>{label}</span>
      {probability != null && (
        <span className={S.probability}>{formatProbability(probability)}</span>
      )}
    </button>
  );
}

export function JevPaletteNotice({ children }: { children: ReactNode }) {
  return (
    <Text size="sm" c="text-secondary" px="xl" pb="sm">
      {children}
    </Text>
  );
}

interface JevPaletteFooterProps {
  hints: string;
  latencyMs?: number;
  latencyTestId: string;
}

export function JevPaletteFooter({
  hints,
  latencyMs,
  latencyTestId,
}: JevPaletteFooterProps) {
  return (
    <Box className={S.footer}>
      <Text component="span" size="xs" c="inherit">
        {hints}
      </Text>
      {latencyMs != null && (
        <Text
          component="span"
          size="xs"
          c="inherit"
          className={S.latency}
          data-testid={latencyTestId}
        >
          {t`Jev · ${Math.round(latencyMs)}ms`}
        </Text>
      )}
    </Box>
  );
}

export function getJevPaletteRowElementId(listId: string, index: number) {
  return `${listId}-row-${index}`;
}
