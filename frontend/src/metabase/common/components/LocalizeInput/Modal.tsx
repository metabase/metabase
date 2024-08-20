import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useListDashboardsQuery,
  useUpdateDashboardMutation,
} from "metabase/api";
import { L } from "metabase/common/components/LocalizeInput";
import { useLocale } from "metabase/common/hooks/use-locale/use-locale";
import EventSandbox from "metabase/components/EventSandbox";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
import {
  Button,
  Flex,
  Icon,
  Input,
  Modal,
  Select,
  Skeleton,
  Stack,
  Title,
} from "metabase/ui";
import { Repeat } from "metabase/ui/components/feedback/Skeleton/Repeat";
import { MappingEditor } from "metabase-enterprise/sandboxes/components/MappingEditor"; // eslint-disable-line no-restricted-imports

import type { Target } from "./types";
import { getInputTranslationDictionary, serializeTranslations } from "./utils";

export const InputTranslationEditorModal = ({
  opened,
  closeModal,
  onChange,
  initialTarget,
  showTargetSwitcher,
}: {
  opened: boolean;
  closeModal: (e?: any) => void;
  onChange?: (value: string) => void;
  initialTarget: Target;
  showTargetSwitcher?: boolean;
}) => {
  const locale = useLocale();
  const {
    data: dashboards,
    error: dashboardsError,
    isLoading: dashboardsLoading,
  } = useListDashboardsQuery();

  const sortedDashboards = useMemo(() => {
    if (!dashboards) {
      return [];
    }
    const sortedDashboards = [...dashboards];
    sortedDashboards.sort((a, b) => {
      // FIXME: SUPER HACKY
      if (a.collection_id !== b.collection_id) {
        if (
          typeof a.collection_id === "string" &&
          typeof b.collection_id === "string"
        ) {
          return a.collection_id.localeCompare(b.collection_id);
        }
        if (typeof a.collection_id === "string") {
          return -1;
        }
        if (typeof b.collection_id === "string") {
          return 1;
        }
        // FIXME: EXTREMELY HACKY, just to move the metabase analytics collections to the bottom
        const formatId = (id: number | null) => (id === 1 ? 99 : id || 10);
        return formatId(a.collection_id) - formatId(b.collection_id);
      } else {
        return a.name.localeCompare(b.name, locale);
      }
    });
    return sortedDashboards;
  }, [dashboards, locale]);

  const [target, setTarget] = useState<Target>(initialTarget);
  const targetButtonRef = useRef<HTMLButtonElement>(null);
  const [hasScrolledTargetIntoView, setHasScrolledTargetIntoView] =
    useState(false);

  useEffect(() => {
    if (hasScrolledTargetIntoView) {
      return;
    }
    setTimeout(() => {
      targetButtonRef.current?.scrollIntoView();
      setHasScrolledTargetIntoView(true);
    }, 0);
  }, [targetButtonRef, hasScrolledTargetIntoView]);

  return (
    <Modal.Root
      opened={opened}
      onClose={closeModal}
      trapFocus
      xOffset="10vw"
      yOffset="10dvh"
    >
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        {showTargetSwitcher && (
          <Flex
            py="sm"
            px="md"
            w="100%"
            justify="space-between"
            align="center"
            style={{ borderBottom: "1px solid var(--mb-color-border)" }}
          >
            <Title order={4}>{t`Translation dictionary for names`}</Title>
            <EventSandbox>
              <Modal.CloseButton size={21} />
            </EventSandbox>
          </Flex>
        )}
        <Flex direction="row" wrap="nowrap">
          {showTargetSwitcher && (
            <Stack
              w="15rem"
              fz="sm"
              h="600px"
              spacing={0}
              style={{
                borderInlineEnd: "1px solid var(--mb-color-border)",
                overflowY: "auto",
                overflowX: "hidden",
              }}
            >
              <DelayedLoadingAndErrorWrapper
                loading={dashboardsLoading}
                error={dashboardsError}
                loader={
                  <Stack spacing="sm" py="sm" px="md">
                    <Repeat times={7}>
                      <Skeleton width="9rem" height="2rem" />
                    </Repeat>
                  </Stack>
                }
              >
                {sortedDashboards?.map(dashboard => {
                  const isTarget = target.id === dashboard.id;
                  return (
                    <Button
                      fw="normal"
                      py="md"
                      radius={0}
                      key={`button-${dashboard.id}`}
                      variant="subtle"
                      ref={isTarget ? targetButtonRef : undefined}
                      styles={{
                        root: {
                          backgroundColor: isTarget
                            ? "var(--mb-color-brand)"
                            : "transparent",
                          color: isTarget
                            ? "var(--mb-color-text-white)"
                            : "var(--mb-color-text-medium)",
                          ["&:hover"]: {
                            backgroundColor: isTarget
                              ? "var(--mb-color-brand)"
                              : "var(--mb-color-border)",
                            color: isTarget
                              ? "var(--mb-color-text-white)"
                              : "var(--mb-color-text-medium)",
                            opacity: 0.9,
                          },
                        },
                        inner: { justifyContent: "flex-start" },
                      }}
                      onClick={() => {
                        setTarget({
                          type: "dashboard",
                          id: dashboard.id,
                          name: dashboard.name,
                        });
                      }}
                    >
                      <L>{dashboard.name}</L>
                    </Button>
                  );
                })}
              </DelayedLoadingAndErrorWrapper>
            </Stack>
          )}
          <InputTranslationEditorModalContent
            key={target?.id}
            target={target}
            initialTarget={initialTarget}
            onChange={onChange}
            closeModal={closeModal}
            showTargetSwitcher={showTargetSwitcher}
          />
        </Flex>
      </Modal.Content>
    </Modal.Root>
  );
};

export const InputTranslationEditorModalContent = ({
  target,
  initialTarget,
  onChange,
  closeModal,
  showTargetSwitcher,
}: {
  target: Target;
  initialTarget: Target;
  onChange?: (value: string) => void;
  closeModal: (e?: any) => void;
  showTargetSwitcher?: boolean;
}) => {
  const [updateDashboard] = useUpdateDashboardMutation();

  const currentLocaleCode = useLocale();

  const locales = useSelector(state => getSetting(state, "available-locales"));

  const localeMap = useMemo(() => {
    return new Map(locales);
  }, [locales]);

  const localeSelectOptions = useMemo(() => {
    const options =
      locales?.map(([value, name]) => ({
        label: name,
        value,
      })) || [];
    const [[currentLocale], otherLocales] = _.partition(
      options,
      option => option.value === currentLocaleCode,
    );
    otherLocales.sort((a, b) =>
      a.label.localeCompare(b.label, currentLocaleCode),
    );
    return [currentLocale, ...otherLocales];
  }, [locales, currentLocaleCode]);

  const [values, setValues] = useState<{
    msgid: string;
    translations?: Record<string, string> | null;
  } | null>(getInputTranslationDictionary(target.name));

  useEffect(() => {
    setValues(getInputTranslationDictionary(target.name));
  }, [target]);

  const sortedTranslations = useMemo(() => {
    const entries = Object.entries(values?.translations || {});
    const formatLocaleForSorting = (locale: string) =>
      // Sort current locale first
      locale === currentLocaleCode ? "" : localeMap.get(locale) || "";
    entries.sort(([locale1], [locale2]) =>
      formatLocaleForSorting(locale1).localeCompare(
        formatLocaleForSorting(locale2),
        currentLocaleCode,
      ),
    );
    return Object.fromEntries(entries);
  }, [values, currentLocaleCode, localeMap]);

  const save = useCallback(async () => {
    const serialized = serializeTranslations(values?.translations || {});
    const newValue = serialized
      ? _.compact([values?.msgid, serialized ? `(${serialized})` : null]).join(
          " ",
        )
      : values?.msgid;
    if (newValue) {
      if (target.id === initialTarget.id) {
        // if target is initial target, use the existing dashboard update mechanism to update the name
        onChange?.(newValue);
      } else {
        // otherwise update the dashboard using RTK query
        await updateDashboard({ id: target.id, name: newValue });
      }
      closeModal();
    }
  }, [
    onChange,
    values,
    closeModal,
    initialTarget.id,
    target.id,
    updateDashboard,
  ]);

  return (
    <>
      <Stack spacing="sm" w="100%">
        <Flex py="md" px="lg" w="100%" align="center" justify="space-between">
          <Title order={4}>
            {t`Editing ${target.type}`}:{" "}
            <Link
              style={{
                color: "var(--mb-color-brand)",
              }}
              target="_blank"
              to={Urls.dashboard(target)}
            >
              <L>{target.name}</L>
            </Link>
          </Title>
          {!showTargetSwitcher && (
            <EventSandbox>
              <Modal.CloseButton size={21} />
            </EventSandbox>
          )}
        </Flex>
        <Modal.Body>
          <Stack spacing="xl" pb="xl">
            <label>
              <Stack spacing="sm">
                <Title order={4} fw="normal">
                  {t`Name`}
                </Title>
                <Input
                  value={values?.msgid}
                  onChange={e =>
                    setValues(values => ({
                      ...values,
                      msgid: e.target.value,
                    }))
                  }
                  maw="15rem"
                  styles={{
                    input: { fontWeight: "bold" },
                  }}
                />
              </Stack>
            </label>
            <Stack spacing="sm">
              <Title order={4} fw="normal">
                {t`Translations`}
              </Title>
              <MappingEditor
                showDivider={false}
                addText={t`Add translation`}
                renderKeyInput={({ value, onChange }) => {
                  return (
                    <Select
                      searchable
                      data={localeSelectOptions}
                      value={value}
                      onChange={locale => onChange(locale || "")}
                      style={{ marginInlineEnd: ".35rem" }}
                      placeholder={t`Language`}
                    />
                  );
                }}
                value={sortedTranslations}
                keyPlaceholder={t`Word or phrase`}
                valuePlaceholder={t`Translation`}
                onChange={translations => {
                  setValues(values => ({
                    msgid: values?.msgid || "",
                    translations: translations as Record<string, string>,
                  }));
                }}
                alwaysShowAddButton
                deleteButtonProps={{
                  leftIcon: (
                    <Icon color="var(--mb-color-text-light)" name="trash" />
                  ),
                }}
              />
            </Stack>
          </Stack>
          <Button onClick={async () => await save()}>{t`Save`}</Button>
        </Modal.Body>
      </Stack>
    </>
  );
};
