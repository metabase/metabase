import { t } from "ttag";

import { Box, Group, Icon, SegmentedControl } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import type { NavSection } from "../types";
import { useNavSection } from "../use-nav-section";

export function NavSectionSwitcher() {
  const { section, setSection } = useNavSection();

  return (
    <Box px="md" pt="sm" pb="xs" data-testid="nav-section-switcher">
      <SegmentedControl<NavSection>
        aria-label={t`Navigation section`}
        data={[
          {
            value: "official",
            label: <SectionLabel icon="repository" label={t`Library`} />,
          },
          {
            value: "unofficial",
            label: <SectionLabel icon="beaker" label={t`Playground`} />,
          },
        ]}
        value={section}
        fullWidth
        onChange={setSection}
      />
    </Box>
  );
}

function SectionLabel({ icon, label }: { icon: IconName; label: string }) {
  return (
    <Group gap="xs" justify="center" wrap="nowrap">
      <Icon name={icon} size={14} aria-hidden />
      {label}
    </Group>
  );
}
