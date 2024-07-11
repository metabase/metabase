import { t } from "ttag";

import { addSectionToDashboard } from "metabase/dashboard/actions";
import {
  DashboardHeaderButton,
  SectionMenuItem,
} from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { SectionLayoutPreview } from "metabase/dashboard/components/DashboardHeader/SectionLayoutPreview";
import { layoutOptions, type SectionLayout } from "metabase/dashboard/sections";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { Flex, Icon, Menu, Tooltip } from "metabase/ui";

export const AddSectionButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const selectedTabId = useSelector(getSelectedTabId);

  const onAddSection = (sectionLayout: SectionLayout) => {
    if (dashboard) {
      dispatch(
        addSectionToDashboard({
          dashId: dashboard.id,
          tabId: selectedTabId,
          sectionLayout,
        }),
      );
    }
  };

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <span>
          <Tooltip label={t`Add section`}>
            <DashboardHeaderButton aria-label={t`Add section`}>
              <Icon name="section" size={18} />
            </DashboardHeaderButton>
          </Tooltip>
        </span>
      </Menu.Target>
      <Menu.Dropdown miw="100px">
        <Flex direction="column" align="center" gap="md" p="12px">
          {layoutOptions.map(layout => (
            <SectionMenuItem
              key={layout.id}
              onClick={() => onAddSection(layout)}
              aria-label={layout.label}
              p="14px"
            >
              <SectionLayoutPreview layout={layout} />
            </SectionMenuItem>
          ))}
        </Flex>
      </Menu.Dropdown>
    </Menu>
  );
};
