import { skipToken, useGetDashboardQuery } from "metabase/api";
import {
  getCollectionId,
  getIsCollectionPathVisible,
} from "metabase/app/selectors";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import { SearchButton } from "metabase/nav/components/search/SearchButton/SearchButton";
import { CollectionBreadcrumbs } from "metabase/nav/containers/CollectionBreadcrumbs";
import { isQuestionPath } from "metabase/nav/containers/MainNavbar/getSelectedItems";
import { getQuestion } from "metabase/query_builder";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";
import { getPageFrame } from "metabase/selectors/app";
import { Box, Flex, Group, rem } from "metabase/ui";

/**
 * The page's own header, in place of the old app bar: where you are on the left, and the two
 * app-wide controls — search and the account switcher — on the right. It sits above the scrolling
 * content rather than spanning the window, so the rail owns the full height of the app.
 */
export function AppPageHeader() {
  const location = useLocation();
  const isCollectionPathVisible = useSelector((state) =>
    getIsCollectionPathVisible(state, { location }),
  );
  const breadcrumbCollectionId = useSelector(getCollectionId);
  const pageFrame = useSelector(getPageFrame);

  const question = useSelector(getQuestion);
  const dashboardId = isQuestionPath(location.pathname)
    ? question?.dashboard()?.id
    : undefined;
  const { data: dashboard } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  return (
    <Flex
      component="header"
      align="center"
      justify="space-between"
      gap="lg"
      px={pageFrame?.gutter ?? "xl"}
      // Centers the row on the nav rail's Official/Unofficial switcher text: the
      // rail's 8px top padding + the switcher's 8px padding + half its 38px height
      // puts that text at 35px, and this row's 32px controls need 19px above them.
      pt={rem(19)}
      pb="md"
      wrap="nowrap"
      bg={`background_page-${pageFrame?.background ?? "primary"}`}
      data-testid="app-page-header"
    >
      <Box miw={0} style={{ overflow: "hidden" }}>
        {isCollectionPathVisible && (
          <CollectionBreadcrumbs
            dashboard={dashboardId != null ? dashboard : undefined}
            collectionId={breadcrumbCollectionId ?? undefined}
            showIcons={false}
          />
        )}
      </Box>
      <Group gap="md" wrap="nowrap" c="text-primary">
        <SearchButton />
        <AppSwitcher />
      </Group>
    </Flex>
  );
}
