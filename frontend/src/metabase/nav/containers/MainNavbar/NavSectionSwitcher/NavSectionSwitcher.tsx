import { t } from "ttag";

import { useNavigate } from "metabase/router";
import { Box, SegmentedControl } from "metabase/ui";

import type { NavSection } from "../types";
import { useNavSection } from "../use-nav-section";

export function NavSectionSwitcher() {
  const { section, setSection, hrefFor } = useNavSection();
  const navigate = useNavigate();

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
        onChange={(next) => {
          setSection(next);
          navigate(hrefFor(next));
        }}
      />
    </Box>
  );
}
