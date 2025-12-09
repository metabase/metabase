import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
  PLUGIN_TRANSFORMS,
} from "metabase/plugins";
import { getLocation } from "metabase/selectors/routing";
import {
  Box,
  Center,
  FixedSizeIcon,
  Flex,
  type IconName,
  Loader,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import S from "./DataStudioLayout.module.css";

type DataStudioLayoutProps = {
  children?: ReactNode;
};

export function DataStudioLayout({ children }: DataStudioLayoutProps) {
  const {
    value: _isNavbarOpened,
    setValue: setIsNavbarOpened,
    isLoading,
  } = useUserKeyValue({
    namespace: "data_studio",
    key: "isNavbarOpened",
  });

  const isNavbarOpened = _isNavbarOpened === false ? false : true;

  return isLoading ? (
    <Center h="100%">
      <Loader />
    </Center>
  ) : (
    <Flex h="100%">
      <DataStudioNav
        isNavbarOpened={isNavbarOpened}
        onNavbarToggle={setIsNavbarOpened}
      />
      <Box h="100%" flex={1} miw={0}>
        {children}
      </Box>
    </Flex>
  );
}

type DataStudioNavProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function DataStudioNav({ isNavbarOpened, onNavbarToggle }: DataStudioNavProps) {
  const { pathname } = useSelector(getLocation);
  const canAccessDataModel = useSelector(
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel,
  );
  const canAccessTransforms = useSelector(
    PLUGIN_TRANSFORMS.canAccessTransforms,
  );
  const isDataTab = pathname.startsWith(Urls.dataStudioData());
  const isGlossaryTab = pathname.startsWith(Urls.dataStudioGlossary());

  const isModelingTab = pathname.startsWith(Urls.dataStudioModeling());
  const isDependenciesTab = pathname.startsWith(Urls.dependencyGraph());
  const isJobsTab = pathname.startsWith(Urls.transformJobList());
  const isRunsTab = pathname.startsWith(Urls.transformRunList());

  // TODO: Why am i like this?
  const isTransformsTab =
    pathname.startsWith(Urls.transformList()) && !isJobsTab;

  return (
    <Stack
      className={cx(S.nav, { [S.opened]: isNavbarOpened })}
      h="100%"
      p="0.75rem"
      justify="space-between"
      data-testid="data-studio-nav"
    >
      <Stack gap="0.75rem">
        <DataStudioNavbarToggle
          isNavbarOpened={isNavbarOpened}
          onNavbarToggle={onNavbarToggle}
        />
        <DataStudioTab
          label={t`Library`}
          icon="repository"
          to={Urls.dataStudioModeling()}
          isSelected={isModelingTab}
          showLabel={isNavbarOpened}
        />

        {canAccessDataModel && (
          <DataStudioTab
            label={t`Data structure`}
            icon="open_folder"
            to={Urls.dataStudioData()}
            isSelected={isDataTab}
            showLabel={isNavbarOpened}
          />
        )}
        {canAccessDataModel && (
          <DataStudioTab
            label={t`Glossary`}
            icon="glossary"
            to={Urls.dataStudioGlossary()}
            isSelected={isGlossaryTab}
            showLabel={isNavbarOpened}
          />
        )}
        {PLUGIN_DEPENDENCIES.isEnabled && (
          <DataStudioTab
            label={t`Dependency graph`}
            icon="dependencies"
            to={Urls.dependencyGraph()}
            isSelected={isDependenciesTab}
            showLabel={isNavbarOpened}
          />
        )}
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Transforms`}
            icon="transform"
            to={Urls.transformList()}
            isSelected={isTransformsTab}
            showLabel={isNavbarOpened}
          />
        )}
      </Stack>
      <Stack gap="0.75rem">
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Jobs`}
            icon="clock"
            to={Urls.transformJobList()}
            isSelected={isJobsTab}
            showLabel={isNavbarOpened}
          />
        )}
        {canAccessTransforms && (
          <DataStudioTab
            label={t`Runs`}
            icon="play_outlined"
            to={Urls.transformRunList()}
            isSelected={isRunsTab}
            showLabel={isNavbarOpened}
          />
        )}
        <DataStudioTab
          label={t`Exit`}
          icon="exit"
          to={"/"}
          showLabel={isNavbarOpened}
        />
      </Stack>
    </Stack>
  );
}

type DataStudioTabProps = {
  label: string;
  icon: IconName;
  to: string;
  isSelected?: boolean;
  showLabel: boolean;
};

const TOOLTIP_OPEN_DELAY = 1000;

function DataStudioTab({
  label,
  icon,
  to,
  isSelected,
  showLabel,
}: DataStudioTabProps) {
  return (
    <Tooltip
      label={label}
      position="right"
      openDelay={TOOLTIP_OPEN_DELAY}
      disabled={showLabel}
    >
      <Box
        className={cx(S.tab, { [S.selected]: isSelected })}
        component={ForwardRefLink}
        to={to}
        p="0.5rem"
        bdrs="md"
        aria-label={label}
      >
        <FixedSizeIcon name={icon} display="block" className={S.icon} />
        {showLabel && <Text lh="sm">{label}</Text>}
      </Box>
    </Tooltip>
  );
}

type DataStudioNavbarToggleProps = {
  isNavbarOpened: boolean;
  onNavbarToggle: (isOpened: boolean) => void;
};

function DataStudioNavbarToggle({
  isNavbarOpened,
  onNavbarToggle,
}: DataStudioNavbarToggleProps) {
  return (
    <Flex justify="space-between">
      <UnstyledButton
        className={cx(S.toggle, {
          [S.hoverButton]: !isNavbarOpened,
          [S.disablePointer]: isNavbarOpened,
        })}
        p="0.5rem"
        bdrs="md"
        onClick={() => !isNavbarOpened && onNavbarToggle(true)}
      >
        <FixedSizeIcon
          name="data_studio"
          size={27}
          mx="-5px"
          className={cx(S.hideOnHover)}
        />
        <FixedSizeIcon
          name="sidebar_open"
          className={S.showOnHover}
          c="text-secondary"
        />
      </UnstyledButton>
      {isNavbarOpened && (
        <UnstyledButton
          className={S.toggle}
          p="0.5rem"
          bdrs="md"
          onClick={() => onNavbarToggle(false)}
        >
          <FixedSizeIcon name="sidebar_closed" c="text-secondary" />
        </UnstyledButton>
      )}
    </Flex>
  );
}
