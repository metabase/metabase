import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Link } from "metabase/common/components/Link";
import { Popover } from "metabase/common/components/MetadataInfo/Popover";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { useGetIcon } from "metabase/hooks/use-icon";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { LibraryEntity } from "metabase/rich_text_editing/tiptap/extensions/SmartLink/use-smart-link-entity";
import { Breadcrumbs, Center, Divider, Group, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isNotNull } from "metabase/utils/types";
import type { LibraryCollection, TableId } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

import S from "./MetabotHoverCard.module.css";

const WIDTH = 320;
const CARD_PADDING_PX = 16;
const OFFSET = { mainAxis: 8, alignmentAxis: -CARD_PADDING_PX };

export const METABOT_HOVER_CARD_BOUNDARY_ATTR =
  "data-metabot-hover-card-boundary";

const useBoundaryMiddlewares = () => {
  const [boundary, setBoundary] = useState<HTMLElement | null>(null);
  const targetRef = useCallback((node: HTMLElement | null) => {
    setBoundary(
      node?.closest<HTMLElement>(`[${METABOT_HOVER_CARD_BOUNDARY_ATTR}]`) ??
        null,
    );
  }, []);

  const middlewares = useMemo(
    () => ({
      flip: boundary ? { boundary } : true,
      shift: boundary ? { boundary } : true,
      size: true,
    }),
    [boundary],
  );

  return { targetRef, middlewares };
};

type Crumb = { name: string; href?: string };

const getLocationCrumbs = (
  { collection, parentTable }: LibraryEntity,
  library: LibraryCollection | undefined,
): Crumb[] => {
  const libraryCrumb = {
    name: t`Library`,
    href:
      library &&
      Urls.modelToUrl({
        id: library.id,
        model: "collection",
        name: library.name,
      }),
  };
  const collectionCrumb = collection && {
    name: collection.name,
    href: Urls.collection(collection),
  };
  const tableCrumb = parentTable && {
    name: parentTable.display_name,
    href: isConcreteTableId(parentTable.id)
      ? Urls.table({ id: parentTable.id, name: parentTable.display_name })
      : undefined,
  };

  return [libraryCrumb, collectionCrumb, tableCrumb].filter(isNotNull);
};

export function MetabotHoverCard({
  entity,
  children,
}: {
  entity: LibraryEntity | undefined;
  children: ReactNode;
}) {
  const getIcon = useGetIcon();
  const { targetRef, middlewares } = useBoundaryMiddlewares();
  const { data: library } = PLUGIN_LIBRARY.useGetLibraryCollection({
    skip: !entity,
  });

  return (
    <Popover
      disabled={!entity}
      width={WIDTH}
      radius="md"
      offset={OFFSET}
      middlewares={middlewares}
      content={
        entity && (
          <Stack
            gap={0}
            bg="background_surface-primary"
            c="text-primary"
            bdrs="md"
            className={S.clip}
            data-testid="metabot-hover-card"
          >
            <Stack gap="lg" p="lg">
              <Group gap="xs" c="text-brand" fz="sm" fw="bold">
                <EntityIcon
                  {...getIcon({ model: entity.model })}
                  size="0.75rem"
                />
                {getTranslatedEntityName(entity.model)}
              </Group>
              <Stack gap="xxs" className={S.text}>
                <Text fz="md" fw="bold">
                  {entity.name}
                </Text>
                {entity.description && (
                  <Text fz="md" c="text-secondary">
                    {entity.description}
                  </Text>
                )}
              </Stack>
              {entity.model === "table" && (
                <TableFieldsPill tableId={entity.id} />
              )}
            </Stack>
            <Divider />
            <Breadcrumbs
              separator="/"
              px="lg"
              py="sm"
              fz="sm"
              c="text-secondary"
              className={S.crumbs}
            >
              {getLocationCrumbs(entity, library).map((crumb, index) => (
                <Crumb key={index} {...crumb} />
              ))}
            </Breadcrumbs>
          </Stack>
        )
      }
    >
      <span ref={targetRef}>{children}</span>
    </Popover>
  );
}

function Crumb({ name, href }: Crumb) {
  return href ? (
    <Link to={href} target="_blank" className={S.crumb}>
      {name}
    </Link>
  ) : (
    <span>{name}</span>
  );
}

function TableFieldsPill({ tableId }: { tableId: TableId }) {
  const { data: table } = useGetTableQueryMetadataQuery({ id: tableId });
  const fieldCount = table?.fields?.length;

  if (fieldCount == null) {
    return null;
  }

  return (
    <Group
      gap={0}
      h="1.5rem"
      w="fit-content"
      fz="sm"
      bdrs="xs"
      className={S.clip}
    >
      <Center h="100%" miw="1.5rem" px="xxs" bg="background_page-tertiary">
        <Text inherit fw="bold">
          {fieldCount}
        </Text>
      </Center>
      <Center
        h="100%"
        px="xs"
        bg="background_page-secondary"
        c="text-secondary"
      >
        {t`fields`}
      </Center>
    </Group>
  );
}
