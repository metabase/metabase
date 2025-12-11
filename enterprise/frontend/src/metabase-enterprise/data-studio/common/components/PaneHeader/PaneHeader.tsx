import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
  Box,
  Button,
  FixedSizeIcon,
  Flex,
  Group,
  type GroupProps,
  type IconName,
  Stack,
  Tooltip,
} from "metabase/ui";

import type { PaneHeaderTab } from "./types";

interface PaneHeaderProps extends Omit<GroupProps, "title"> {
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
    <Group
      className={className}
      gap="sm"
      justify="space-between"
      px="lg"
      py="md"
      wrap="nowrap"
      {...rest}
    >
      <Stack gap="sm" w="100%">
        {(breadcrumbs || showMetabotButton) && (
          <Flex mb="md" mt="md" h="2rem">
            {breadcrumbs}
            {showMetabotButton && (
              <Box ml="auto">
                <PLUGIN_METABOT.MetabotDataStudioButton />
              </Box>
            )}
          </Flex>
        )}
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
  const backgroundColor = withBackground ? "bg-secondary" : "transparent";

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
