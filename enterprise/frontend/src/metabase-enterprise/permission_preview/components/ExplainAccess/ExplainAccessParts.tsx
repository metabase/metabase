import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { SidesheetCard } from "metabase/common/components/Sidesheet";
import {
  Alert,
  Box,
  Ellipsified,
  Flex,
  Icon,
  Text,
  type TextProps,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { PreviewTarget } from "../types";

import S from "./ExplainAccess.module.css";
import { type Verdict, getSubject } from "./explain";
import type { ValueStatus } from "./labels";

interface SheetTextProps extends TextProps {
  children?: ReactNode;
}

/** 14px on a 20px line, the sheet's text. */
export function BodyText(props: SheetTextProps) {
  return <Text lh="1.25rem" c="text-primary" {...props} />;
}

/** 12px on a 16px line, the second line of a row. */
export function SmallText(props: SheetTextProps) {
  return <Text fz="sm" lh="1rem" c="text-secondary" {...props} />;
}

interface SheetCardProps {
  title?: string;
  /** The ⓘ beside the title: what the card's permission means */
  info?: { label: string; text: string };
  children: ReactNode;
}

export function SheetCard({ title, info, children }: SheetCardProps) {
  return (
    <SidesheetCard
      title={
        title && (
          <Flex component="span" align="center" gap="xs">
            {title}
            {info && (
              <Tooltip multiline w="20rem" label={info.text}>
                <UnstyledButton
                  display="flex"
                  c="text-secondary"
                  aria-label={info.label}
                >
                  <Icon name="info" />
                </UnstyledButton>
              </Tooltip>
            )}
          </Flex>
        )
      }
    >
      <Box my="-sm">{children}</Box>
    </SidesheetCard>
  );
}

interface RowProps {
  /** A grey word before the name, like "Collection" */
  label?: string;
  name: string;
  /** The database after a table's name, dimmed; it is cut before the name */
  database?: string;
  /** What a cut-off name's tooltip says, when the name and database aren't all */
  tooltip?: string;
  /** The second line: where the value comes from */
  detail?: string | null;
  /** A 16px slot, so rows line up under rows that open */
  hasChevronSlot?: boolean;
  children?: ReactNode;
}

/** A row of a card: the name on the left, the status on the right, both on the first line. */
export function Row({
  label,
  name,
  database,
  tooltip,
  detail,
  hasChevronSlot,
  children,
}: RowProps) {
  return (
    <Flex gap="sm" py="sm" align="flex-start" wrap="nowrap">
      {hasChevronSlot && <Box w="1rem" flex="none" />}
      <Box flex={1} miw={0}>
        <Flex gap="sm" align="baseline" wrap="nowrap">
          {label && <BodyText c="text-secondary">{label}</BodyText>}
          <RowName name={name} database={database} tooltip={tooltip} />
        </Flex>
        {detail && (
          <Ellipsified fz="sm" lh="1rem" c="text-secondary">
            {detail}
          </Ellipsified>
        )}
      </Box>
      {children}
    </Flex>
  );
}

type RowNameProps = Pick<RowProps, "name" | "database" | "tooltip">;

/** A row's name, and a table's database. Whichever is cut off shows both in a tooltip. */
function RowName({
  name,
  database,
  tooltip = database ? `${name} · ${database}` : name,
}: RowNameProps) {
  return (
    <>
      <Ellipsified
        flex="0 1 auto"
        miw={0}
        fz="md"
        lh="1.25rem"
        c="text-primary"
        tooltip={tooltip}
      >
        {name}
      </Ellipsified>
      {database && (
        <Ellipsified
          // Takes only the room the name leaves: shrinking both, even unevenly, cuts the name by a fraction of a pixel
          flex="1 1 0"
          miw={0}
          fz="sm"
          lh="1rem"
          c="text-secondary"
          tooltip={tooltip}
        >
          {`· ${database}`}
        </Ellipsified>
      )}
    </>
  );
}

interface StatusButtonProps {
  status: ValueStatus;
  /** What the button says to a screen reader, with the row's name */
  rowName: string;
  /** Left out beside a verdict that already shows the icon */
  withIcon?: boolean;
  onClick: () => void;
}

/** A value's icon, label and chevron: opens the value's reason. */
export function StatusButton({
  status,
  rowName,
  withIcon = true,
  onClick,
}: StatusButtonProps) {
  return (
    <UnstyledButton
      className={S.status}
      aria-label={`${rowName}, ${status.label}`}
      onClick={onClick}
    >
      {withIcon && <Icon name={status.icon} c={status.color} />}
      <span className={S.statusLabel}>{status.label}</span>
      <Icon name="chevronright" c="text-secondary" />
    </UnstyledButton>
  );
}

interface ToggleRowProps {
  name: string;
  database?: string;
  /** Plain text at the right of a fold, or a status button of a row that opens */
  status: ReactNode;
  initiallyOpen?: boolean;
  /** Its rows open too: their own chevrons take the indent, so their names stay in this row's column */
  hasToggleRows?: boolean;
  children: ReactNode;
}

/** A row that opens its content, the content 24px in as a tree. */
export function ToggleRow({
  name,
  database,
  status,
  initiallyOpen = false,
  hasToggleRows = false,
  children,
}: ToggleRowProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <>
      <div className={S.toggleRow}>
        <UnstyledButton
          className={S.toggleButton}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <Icon
            name={isOpen ? "chevrondown" : "chevronright"}
            c="text-secondary"
          />
          <RowName name={name} database={database} />
        </UnstyledButton>
        {status}
      </div>
      {isOpen && <Box pl={hasToggleRows ? undefined : "xl"}>{children}</Box>}
    </>
  );
}

/** The status of a fold: plain text, nothing to click. */
export function FoldStatus({ label }: { label: string }) {
  return (
    <BodyText c="text-secondary" flex="none">
      {label}
    </BodyText>
  );
}

const VERDICT_ICONS: Record<
  Exclude<Verdict["kind"], "error">,
  { name: IconName; color: ValueStatus["color"] }
> = {
  success: { name: "check", color: "feedback-positive" },
  filtered: { name: "permissions_limited", color: "core-brand" },
  warning: { name: "warning", color: "feedback-warning" },
};

interface VerdictLineProps {
  icon: IconName;
  color: ValueStatus["color"];
  /** A dimmed line under the verdict: where the value comes from */
  detail?: string | null;
  children: ReactNode;
}

/** The sheet's verdict: an icon and one bold line that wraps. */
export function VerdictLine({
  icon,
  color,
  detail,
  children,
}: VerdictLineProps) {
  return (
    <Flex gap="sm" align="flex-start" wrap="nowrap">
      <Icon name={icon} c={color} mt="xs" flex="none" />
      <div>
        <BodyText fw="bold">{children}</BodyText>
        {detail && <SmallText>{detail}</SmallText>}
      </div>
    </Flex>
  );
}

export function VerdictView({ verdict }: { verdict: Verdict }) {
  if (verdict.kind === "error") {
    return (
      <Alert color="error" icon={<Icon name="close" />}>
        <BodyText fw="bold">{verdict.text}</BodyText>
      </Alert>
    );
  }
  const icon = VERDICT_ICONS[verdict.kind];
  return (
    <VerdictLine icon={icon.name} color={icon.color}>
      {verdict.text}
    </VerdictLine>
  );
}

interface SummaryLinkProps {
  subject: string;
  onClick: () => void;
}

export function SummaryLink({ subject, onClick }: SummaryLinkProps) {
  return (
    <UnstyledButton className={S.summaryLink} onClick={onClick}>
      <Icon name="arrow_right" />
      {t`See everything ${subject} can access`}
    </UnstyledButton>
  );
}

interface ItemLineProps {
  icon: IconName;
  name: string;
  /** A table's database, after its name */
  database?: string;
  /** The person the sheet explains, on the line "as {name}" */
  target: PreviewTarget;
}

/** The item the sheet explains: its name wraps, bold and one size up, with the person under it. */
export function ItemLine({ icon, name, database, target }: ItemLineProps) {
  return (
    <Flex gap="sm" align="flex-start" wrap="nowrap">
      <Icon name={icon} c="text-secondary" mt="xxs" flex="none" />
      <Box miw={0}>
        <Text component="div" fz="lg" fw="bold" lh="1.375rem" c="text-primary">
          <span style={{ overflowWrap: "anywhere" }}>{name}</span>
          {database && (
            <Text component="span" fz="sm" fw="normal" c="text-secondary">
              {` · ${database}`}
            </Text>
          )}
        </Text>
        <SmallText>{t`as ${getSubject(target)}`}</SmallText>
      </Box>
    </Flex>
  );
}

/** A value's icon and label with nothing to click. */
export function PlainStatus({ status }: { status: ValueStatus }) {
  return (
    <Flex align="center" gap="xs" wrap="nowrap">
      <Icon name={status.icon} c={status.color} />
      <BodyText>{status.label}</BodyText>
    </Flex>
  );
}

interface DisclosureProps {
  title: string;
  /** The counts per status, one dimmed line under the title */
  counts: string;
  children: ReactNode;
}

/** A section of the summary, folded at first. */
export function Disclosure({ title, counts, children }: DisclosureProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <UnstyledButton
        display="flex"
        w="100%"
        style={{ alignItems: "flex-start", gap: "var(--mantine-spacing-sm)" }}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Icon
          name={isOpen ? "chevrondown" : "chevronright"}
          c="text-secondary"
          mt="xxs"
          flex="none"
        />
        <Box miw={0}>
          <BodyText c="text-secondary">{title}</BodyText>
          <SmallText truncate>{counts}</SmallText>
        </Box>
      </UnstyledButton>
      {isOpen && <Box pl="xl">{children}</Box>}
    </div>
  );
}
