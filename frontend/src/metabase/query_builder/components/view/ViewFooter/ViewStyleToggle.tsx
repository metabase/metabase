import cx from "classnames";
import { type RouteComponentProps, withRouter } from "react-router";
import { t } from "ttag";

import { Flex, Icon } from "metabase/ui";

import S from "./ViewStyleToggle.module.css";

type ViewStyleToggleProps = {
  className?: string;
} & RouteComponentProps<unknown, unknown, unknown, { view: "list" | "table" }>;

export const ViewStyleToggle = withRouter((props: ViewStyleToggleProps) => {
  const { location, router, className } = props;

  const isShowingListView = location.search.includes("list");

  return (
    <Flex className={cx(S.Well, className)}>
      <Flex
        className={cx(S.ToggleIcon, {
          [S.active]: !isShowingListView,
        })}
        aria-label={t`Switch to table view`}
        onClick={() => router.push({ ...location, query: { view: "table" } })}
      >
        <Icon name="table2" tooltip={t`Switch to table view`} />
      </Flex>
      <Flex
        className={cx(S.ToggleIcon, {
          [S.active]: isShowingListView,
        })}
        aria-label={t`Switch to list view`}
        onClick={() => router.push({ ...location, query: { view: "list" } })}
      >
        <Icon name="list" tooltip={t`Switch to list view`} />
      </Flex>
    </Flex>
  );
});
