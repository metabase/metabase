import { useCallback } from "react";
import { replace } from "react-router-redux";

import { skipToken } from "metabase/api";
import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import { useDispatch } from "metabase/lib/redux";
import { Flex, Icon, Loader, Menu, Text } from "metabase/ui";
import { useGetReportVersionsQuery } from "metabase-enterprise/api";

interface VersionSelectProps {
  reportId?: number | "new";
  currentVersion?: number;
}

export function VersionSelect({
  reportId,
  currentVersion,
}: VersionSelectProps) {
  const dispatch = useDispatch();

  const { data: versions, isLoading } = useGetReportVersionsQuery(
    reportId && reportId !== "new" ? { id: reportId } : skipToken,
  );

  const handleVersionSelect = useCallback(
    (version: number) => {
      if (reportId && reportId !== "new") {
        dispatch(replace(`/report/${reportId}?version=${version}`));
      }
    },
    [reportId, dispatch],
  );

  if (!currentVersion || reportId === "new") {
    return null;
  }

  if (isLoading) {
    return (
      <Flex>
        <Loader size="xs" />
      </Flex>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <Flex>
        <Text c="text-light" fw="bold">
          {currentVersion ? `v${currentVersion}` : null}
        </Text>
      </Flex>
    );
  }

  return (
    <Flex>
      <Menu position="right-start">
        <Menu.Target>
          <Text c="text-light" fw="bold" style={{ cursor: "pointer" }}>
            {currentVersion ? `v${currentVersion}` : null}
            <Icon name="chevrondown" ml="sm" size="10px" mt="xs" />
          </Text>
        </Menu.Target>
        <Menu.Dropdown>
          {versions.map((version) => (
            <Menu.Item
              key={version.version}
              onClick={() => handleVersionSelect(version.version)}
              rightSection={
                version.version === currentVersion ? (
                  <Icon name="check_filled" c="text-medium" />
                ) : null
              }
            >
              {`v${version.version} `}
              <Text size="sm" c="text-light">
                {formatDateTimeWithUnit(version.created_at, "hour")}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
}
