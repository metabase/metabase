import type { FC, ReactNode } from "react";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { MetabotDataStudioButton } from "metabase/metabot/components/MetabotDataStudioButton";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getLocation } from "metabase/selectors/routing";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  type StackProps,
  Tabs,
  type TabsTabProps,
  Tooltip,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./PaneHeader.module.css";
import type { PaneHeaderTab } from "./types";

export interface PaneHeaderProps extends Omit<StackProps, "title"> {
  title?: ReactNode;
  icon?: IconName;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  breadcrumbs: ReactNode;
  showMetabotButton?: boolean;
  showAppSwitcher?: boolean;
}

export const PaneHeader = ({
  className,
  title,
  icon,
  menu,
  tabs,
  actions,
  breadcrumbs,
  showMetabotButton,
  showAppSwitcher = true,
  ...rest
}: PaneHeaderProps) => {
  return (
    <Stack gap={0} pt="xs" {...rest}>
      <Flex mb="lg" mt="md" w="100%" h="xl">
        {breadcrumbs}

        <Group ml="auto" gap="md" className={S.ButtonGroup}>
          {showMetabotButton && <MetabotDataStudioButton />}
          {showAppSwitcher && <AppSwitcher />}
        </Group>
      </Flex>
      <Group
        className={className}
        gap="sm"
        justify="space-between"
        align="flex-start"
        wrap="nowrap"
      >
        <Stack gap="md">
          {title && (
            <Group align="center" gap="sm" wrap="nowrap">
              {icon && <FixedSizeIcon name={icon} c="core-brand" size={20} />}
              {title}
              {menu}
            </Group>
          )}
          {tabs}
        </Stack>
        {actions}
      </Group>
    </Stack>
  );
};

type PaneHeaderTitleProps = {
  children?: ReactNode;
};

export function PanelHeaderTitle({ children }: PaneHeaderTitleProps) {
  return (
    <Box fw="bold" fz="h3" lh="h3">
      {children}
    </Box>
  );
}

type PaneHeaderInputProps = {
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  isOptional?: boolean;
  readOnly?: boolean;
  "data-testid"?: string;
  onChange?: (value: string) => void;
  onContentChange?: (value: string) => void;
};

export function PaneHeaderInput({
  initialValue,
  placeholder = t`Name`,
  maxLength,
  "data-testid": dataTestId,
  isOptional,
  readOnly = false,
  onChange,
  onContentChange,
}: PaneHeaderInputProps) {
  return (
    <EditableText
      initialValue={initialValue}
      placeholder={placeholder}
      maxLength={maxLength}
      p={0}
      fw="bold"
      fz="h3"
      lh="h3"
      px={isOptional ? "xs" : undefined}
      bd={isOptional ? "1px solid var(--mb-color-border-neutral)" : undefined}
      isOptional={isOptional}
      isDisabled={readOnly}
      data-testid={dataTestId}
      onChange={onChange}
      onContentChange={onContentChange}
    />
  );
}

type PaneHeaderTabsProps = {
  tabs: PaneHeaderTab[];
};

/**
 * Mantine's `Tabs.Tab` is built with the non-polymorphic `factory`, so
 * `component`/`to` aren't in its prop types. However it still accepts the
 * prop and it works as expected, thus type casting.
 */
const LinkTab = Tabs.Tab as FC<
  TabsTabProps & { component: typeof Link; to: string }
>;

function isTabSelected(tab: PaneHeaderTab, pathname: string) {
  const { to, isSelected } = tab;
  return typeof isSelected === "function"
    ? isSelected(pathname)
    : (isSelected ?? to === pathname);
}

export function PaneHeaderTabs({ tabs }: PaneHeaderTabsProps) {
  const { pathname } = useSelector(getLocation);
  const activeTab = tabs.find((tab) => isTabSelected(tab, pathname));

  return (
    <Tabs variant="pills" value={activeTab?.to ?? null}>
      <Tabs.List>
        {tabs.map(({ label, to, icon, isGated }) => (
          <LinkTab
            key={label}
            value={to}
            component={Link}
            to={to}
            leftSection={icon != null ? <FixedSizeIcon name={icon} /> : null}
            rightSection={isGated ? <UpsellGem.New size={14} /> : null}
          >
            {label}
          </LinkTab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

type PaneHeaderActionsProps = {
  errorMessage?: string;
  isValid?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  alwaysVisible?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PaneHeaderActions({
  errorMessage,
  isValid = true,
  isDirty = false,
  isSaving = false,
  alwaysVisible = false,
  onSave,
  onCancel,
}: PaneHeaderActionsProps) {
  const canSave = isDirty && !isSaving && isValid;

  if (!isDirty && !isSaving && !alwaysVisible) {
    return null;
  }

  return (
    <Group wrap="nowrap">
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Tooltip label={errorMessage} disabled={errorMessage == null}>
        <Button variant="filled" disabled={!canSave} onClick={onSave}>
          {t`Save`}
        </Button>
      </Tooltip>
    </Group>
  );
}
