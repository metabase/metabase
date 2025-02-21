import cx from "classnames";

import { Box, Card, Flex, Text } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Dashboard } from "metabase-types/api";
import { selectTab } from "metabase/dashboard/actions";
import S from "./DashboardSlideNav.module.css";
import {
  Slide,
  TitleSlide,
} from "metabase/dashboard/containers/DashboardPresentation";
import { getSelectedTabId } from "metabase/dashboard/selectors";

export const DashboardSlideNav = ({ dashboard }: { dashboard: Dashboard }) => {
  const dispatch = useDispatch();
  const { selectedTabId } = useSelector(state => ({
    selectedTabId: getSelectedTabId(state),
  }));

  return (
    <Flex direction="column" gap="md" className={S.slidePreviewContainer}>
      <SlidePreview number={1} title={"Title slide"}>
        <TitleSlide dashboard={dashboard} />
      </SlidePreview>
      {dashboard?.tabs &&
        dashboard.tabs.map((tab, index) => {
          return (
            <SlidePreview
              onClick={() => dispatch(selectTab({ tabId: tab.id }))}
              number={index + 2}
              isSelected={tab.id === selectedTabId}
              title={tab.name}
              key={tab.id}
            >
              <Slide
                dashboard={dashboard}
                tab={tab}
                width={1600 - 136}
                className={S.slidePreviewSlide}
              />
            </SlidePreview>
          );
        })}
    </Flex>
  );
};

const SlidePreview = (props: any) => {
  return (
    <Flex gap="sm">
      <Text fw="900" w="1rem" style={{ textAlign: "end", flexShrink: 0 }}>
        {props.number}
      </Text>
      <Box style={{ flexShrink: 0 }}>
        <Card
          style={{
            borderColor: props.isSelected ? "var(--mb-color-brand)" : "#eeecec",
            ...(props.style ?? {}),
          }}
          bg="#fafbfc"
          radius="md"
          shadow="none"
          className={cx(
            S.slidePreview,
            props.isSelected && S.slidePrevewSelected,
          )}
          {...props}
        />
        <Text fw={700} fz="xs" lh={1.4} mt=".25rem" w="10rem">
          {props.title}
        </Text>
      </Box>
    </Flex>
  );
};
