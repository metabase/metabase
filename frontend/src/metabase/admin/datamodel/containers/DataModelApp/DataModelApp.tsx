import cx from "classnames";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { RouterTablePicker } from "metabase/metadata/components";
import {
  type RouteParams,
  parseRouteParams,
} from "metabase/metadata/utils/route-params";
import { Box, Flex, Icon, Stack } from "metabase/ui";

import S from "./DataModelApp.module.css";

export function DataModelApp({
  params,
  location,
  children,
}: {
  params: RouteParams;
  location?: Location;
  children: ReactNode;
}) {
  const { databaseId, tableId, schemaId } = parseRouteParams(params);
  return (
    <Flex h="100%">
      <Stack
        className={S.sidebar}
        flex="0 0 25%"
        gap={0}
        h="100%"
        bg="bg-white"
      >
        <RouterTablePicker
          databaseId={databaseId}
          schemaId={schemaId}
          tableId={tableId}
        />
        <Box mx="xl" py="sm" className={S.footer}>
          <SegmentsLink location={location} />
        </Box>
      </Stack>

      {children}
    </Flex>
  );
}

function SegmentsLink({ location }: { location?: Location }) {
  const isActive =
    location?.pathname?.startsWith("/admin/datamodel/segments") ||
    location?.pathname?.startsWith("/admin/datamodel/segment/");

  return (
    <Link
      to="/admin/datamodel/segments"
      className={cx(S.segmentsLink, { [S.active]: isActive })}
      onlyActiveOnIndex={false}
    >
      <Icon name="pie" className={S.segmentsIcon} />
      {t`Segments`}
    </Link>
  );
}
