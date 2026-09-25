import { type FormEvent, useState } from "react";
import { t } from "ttag";

import {
  type TabSpec,
  useSplitDashboardIntoTabsMutation,
} from "metabase/api/jev";
import { useDispatch } from "metabase/redux";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import S from "./DashboardTabSplit.module.css";
import { applyTabSplit } from "./apply-split";

interface DashboardTabSplitProps {
  dashboardId: number;
}

/** Confidence below which a Jev tab assignment is worth a second look. */
const SHAKY_THRESHOLD = 0.6;

const EMPTY_TABS: TabSpec[] = [
  { name: "", description: "" },
  { name: "", description: "" },
];

/**
 * "Split this dashboard into tabs." You name the tabs and (optionally) describe what belongs on each; Jev
 * assigns every card to the best-fitting tab, and the dashboard reorganizes as a live, unsaved preview you
 * commit with the normal Save button. Only shown while editing.
 */
export const DashboardTabSplit = ({ dashboardId }: DashboardTabSplitProps) => {
  const dispatch = useDispatch();
  const [tabs, setTabs] = useState<TabSpec[]>(EMPTY_TABS);
  const [shakyCount, setShakyCount] = useState<number | null>(null);
  const [split, { isLoading, error }] = useSplitDashboardIntoTabsMutation();

  const namedTabs = tabs.filter((tab) => tab.name.trim() !== "");
  const canSplit = namedTabs.length >= 2;

  const updateTab = (index: number, patch: Partial<TabSpec>) => {
    setTabs((prev) =>
      prev.map((tab, i) => (i === index ? { ...tab, ...patch } : tab)),
    );
  };

  const addTab = () =>
    setTabs((prev) => [...prev, { name: "", description: "" }]);

  const removeTab = (index: number) =>
    setTabs((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSplit) {
      return;
    }
    const plan = await split({ dashboardId, tabs: namedTabs }).unwrap();
    dispatch(applyTabSplit(namedTabs, plan.assignments));

    const shaky = plan.assignments.filter(
      (a) => !a.is_text && (a.confidence ?? 1) < SHAKY_THRESHOLD,
    ).length;
    setShakyCount(shaky);
  };

  return (
    <Stack className={S.panel} gap="sm" p="md" mb="md">
      <Group gap="xs">
        <Icon name="sparkles" c="brand" />
        <Text fw="bold">{t`Split into tabs`}</Text>
        <Text c="text-secondary" size="sm">
          {t`Name your tabs — Jev sorts the cards.`}
        </Text>
      </Group>

      <form onSubmit={handleSubmit}>
        <Stack gap="xs">
          {tabs.map((tab, index) => (
            <Group key={index} gap="xs" wrap="nowrap">
              <TextInput
                w="10rem"
                value={tab.name}
                onChange={(e) =>
                  updateTab(index, { name: e.currentTarget.value })
                }
                placeholder={t`Tab name`}
                aria-label={t`Tab ${index + 1} name`}
              />
              <TextInput
                flex={1}
                value={tab.description ?? ""}
                onChange={(e) =>
                  updateTab(index, { description: e.currentTarget.value })
                }
                placeholder={t`What belongs here? (optional)`}
                aria-label={t`Tab ${index + 1} description`}
              />
              {tabs.length > 2 && (
                <ActionIcon
                  variant="subtle"
                  onClick={() => removeTab(index)}
                  aria-label={t`Remove tab`}
                >
                  <Icon name="close" />
                </ActionIcon>
              )}
            </Group>
          ))}

          <Group gap="sm">
            <Button
              variant="subtle"
              leftSection={<Icon name="add" />}
              onClick={addTab}
            >
              {t`Add tab`}
            </Button>
            <Box flex={1} />
            <Button type="submit" loading={isLoading} disabled={!canSplit}>
              {t`Split`}
            </Button>
          </Group>
        </Stack>
      </form>

      {error != null && (
        <Text c="error" size="sm">{t`Couldn't split the dashboard.`}</Text>
      )}

      {shakyCount != null && (
        <Text c="text-secondary" size="sm">
          {shakyCount === 0
            ? t`Cards sorted. Review the tabs and Save when you're happy.`
            : t`Sorted — ${shakyCount} card(s) Jev wasn't sure about. Double-check them, then Save.`}
        </Text>
      )}
    </Stack>
  );
};
