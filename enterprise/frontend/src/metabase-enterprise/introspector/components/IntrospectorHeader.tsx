import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { SegmentedControl, Stack, Text, Title } from "metabase/ui";

type Section = "content" | "workload";

interface Props {
  section: Section;
}

const SECTION_TO_PATH: Record<Section, string> = {
  content: "/admin/introspector",
  workload: "/admin/introspector/workload",
};

const TITLES: Record<Section, string> = {
  content: t`Content health`,
  workload: t`Workload`,
};

const DESCRIPTIONS: Record<Section, string> = {
  content: t`Stale, broken, and unreferenced content across your instance.`,
  workload: t`Scheduled background work across your instance. Click a cell to see what runs in that hour.`,
};

export function IntrospectorHeader({ section }: Props) {
  const dispatch = useDispatch();

  return (
    <Stack gap="sm" mb="lg">
      <SegmentedControl
        value={section}
        onChange={(v) => dispatch(push(SECTION_TO_PATH[v as Section]))}
        data={[
          { value: "content", label: t`Content` },
          { value: "workload", label: t`Workload` },
        ]}
        style={{ alignSelf: "flex-start" }}
      />
      <Title order={2}>{TITLES[section]}</Title>
      <Text c="text-secondary" size="sm">
        {DESCRIPTIONS[section]}
      </Text>
    </Stack>
  );
}
