import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { useSelector } from "metabase/lib/redux";
import { ProfileLink } from "metabase/nav/components/ProfileLink/ProfileLink";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  type IconName,
  Stack,
  type StackProps,
  Tooltip,
} from "metabase/ui";

import S from "./PaneHeader.module.css";
import type { PaneHeaderTab } from "./types";

export interface PaneHeaderProps extends Omit<StackProps, "title"> {
  title?: ReactNode;
  icon?: IconName;
  menu?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  showMetabotButton?: boolean;
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
  ...rest
}: PaneHeaderProps) => {
  return (
    <Stack gap={0} pt="xs" {...rest}>
      {(breadcrumbs || showMetabotButton) && (
        <Flex mb="lg" mt="md" w="100%">
          {breadcrumbs}

          <Group ml="auto" gap="md">
            {showMetabotButton && <PLUGIN_METABOT.MetabotDataStudioButton />}
            <ProfileLink className={S.ProfileLink} />
          </Group>
        </Flex>
      )}
      <Group
        className={className}
        gap="sm"
        justify="space-between"
        wrap="nowrap"
      >
        <Stack gap="md">
          {title && (
            <Group align="center" gap="sm" wrap="nowrap">
              {icon && <FixedSizeIcon name={icon} c="brand" size={20} />}
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
      bd={isOptional ? "1px solid var(--mb-color-border)" : undefined}
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
  withBackground?: boolean;
};

export function PaneHeaderTabs({ tabs, withBackground }: PaneHeaderTabsProps) {
  const { pathname } = useSelector(getLocation);
  const backgroundColor = withBackground
    ? "background-secondary"
    : "transparent";

  return (
    <Group gap="sm">
      {tabs.map(({ label, to, icon, isSelected = to === pathname }) => {
        return (
          <Button
            key={label}
            component={Link}
            to={to}
            size="sm"
            radius="xl"
            c={isSelected ? "brand" : undefined}
            bg={isSelected ? "brand-light" : backgroundColor}
            bd="none"
            leftSection={icon != null ? <FixedSizeIcon name={icon} /> : null}
          >
            {label}
          </Button>
        );
      })}
    </Group>
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
