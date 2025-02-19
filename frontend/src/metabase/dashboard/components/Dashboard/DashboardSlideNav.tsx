import { Box, Card, Flex, Text } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/lib/redux";
import type { Dashboard } from "metabase-types/api";
import { selectTab } from "metabase/dashboard/actions";
import { DashboardGridConnected } from "../DashboardGrid";
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
    <Flex
      direction="column"
      bg="white"
      mih="100dvh"
      h="100%"
      p="md"
      pr="1.25rem"
      gap="md"
      style={{ borderRight: "1px solid var(--mb-color-border)" }}
    >
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
            >
              <Slide dashboard={dashboard} tab={tab} width={1600 - 136} />
            </SlidePreview>
          );
        })}
    </Flex>
  );
};

const SlidePreview = (props: any) => {
  return (
    <Flex gap="sm">
      <Text fw="900">{props.number}</Text>
      <Box>
        <Card
          style={{
            width: "15rem",
            aspectRatio: "16 / 9",
            border: props.isSelected
              ? "1px solid var(--mb-color-brand)"
              : "1px solid #eeecec",
            ...(props.style ?? {}),
          }}
          bg="#fafbfc"
          radius="md"
          shadow="none"
          className={S.slidePreview}
          {...props}
        />
        <Text fw={700} fz="xs">
          {props.title}
        </Text>
      </Box>
    </Flex>
  );
};
