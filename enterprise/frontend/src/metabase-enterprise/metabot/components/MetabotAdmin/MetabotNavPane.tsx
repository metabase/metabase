import { useEffect, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Divider, Flex } from "metabase/ui";
import { useListMetabotsQuery } from "metabase-enterprise/api";

import { useMetabotIdPath } from "./utils";

export function MetabotNavPane() {
  const { data, isLoading } = useListMetabotsQuery();

  const location = useSelector(getLocation);

  const metabotId = useMetabotIdPath();
  const dispatch = useDispatch();

  const metabots = useMemo(() => _.sortBy(data?.items ?? [], "id"), [data]);

  useEffect(() => {
    const isOnGeneralSettings = location.pathname === "/admin/metabot/general";
    if (!metabotId && !isOnGeneralSettings) {
      dispatch(push("/admin/metabot/general"));
    }
  }, [metabotId, location, dispatch]);

  if (isLoading || !data) {
    return null;
  }
  return (
    <Flex direction="column" w="266px" flex="0 0 auto">
      <AdminNavWrapper>
        <AdminNavItem
          key="general"
          path="/admin/metabot/general"
          label={t`General`}
          icon="gear"
        />
        <Divider my="sm" />
        {metabots?.map((metabot) => (
          <AdminNavItem
            key={metabot.id}
            icon="metabot"
            label={metabot.name}
            path={`/admin/metabot/${metabot.id}`}
          />
        ))}
      </AdminNavWrapper>
    </Flex>
  );
}
