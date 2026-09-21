import { t } from "ttag";

import { Box, SegmentedControl } from "metabase/ui";

import type { NavSection } from "../types";
import { useNavSection } from "../use-nav-section";

export function NavSectionSwitcher() {
  const { section, setSection } = useNavSection();

  return (
    <Box px="md" pt="sm" pb="xs" data-testid="nav-section-switcher">
      <SegmentedControl<NavSection>
        aria-label={t`Navigation section`}
        data={[
          { value: "official", label: t`Official` },
          { value: "unofficial", label: t`Unofficial` },
        ]}
        value={section}
        fullWidth
        onChange={setSection}
      />
    </Box>
  );
}
