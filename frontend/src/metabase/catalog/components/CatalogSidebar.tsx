import { useCallback, useEffect } from "react";
import { t } from "ttag";
import { withRouter } from "react-router";
import * as React from "react";
import slugg from "slugg";
import { connect } from "metabase/lib/redux";
import { openNavbar } from "metabase/redux/app";

import { Tree } from "metabase/components/tree";
import type { ITreeNodeItem } from "metabase/components/tree/types";
import { useListDatabasesQuery } from "metabase/api";
import { Box, Icon, Text } from "metabase/ui";
import type { Database } from "metabase-types/api";
import type { Location } from "history";
import type { IconName } from "metabase/ui";
import { alpha, color, darken } from "metabase/lib/colors";
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";

import styled from "@emotion/styled";

const CatalogSidebarRoot = styled.div`
  width: ${NAV_SIDEBAR_WIDTH};
  height: 100%;
  border-right: 1px solid var(--mb-color-border);
  background-color: var(--mb-color-bg-white);
  overflow-y: auto;
`;

const HeaderLink = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  color: var(--mb-color-text-medium);

  &:hover {
    color: var(--mb-color-brand);
    background-color: ${() => alpha("brand", 0.1)};
  }
`;

const TreeNodeWrapper = styled.div<{ isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: 4px;
  margin: 0.125rem 0;
  color: ${props => props.isSelected ? color("brand") : darken(color("text-medium"), 0.25)};
  background-color: ${props => props.isSelected ? alpha("brand", 0.2) : "unset"};
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${() => alpha("brand", 0.35)};
    color: var(--mb-color-brand);

    .Icon {
      color: var(--mb-color-brand);
    }
  }

  .Icon {
    color: ${props => props.isSelected ? color("brand") : darken(color("text-medium"), 0.25)};
  }
`;

const ChevronIcon = styled(Icon)<{ isExpanded: boolean }>`
  transition: transform 0.2s ease;
  transform: rotate(${props => props.isExpanded ? "90deg" : "0deg"});
  color: var(--mb-color-brand);
`;

interface RouterProps {
  router: {
    params: {
      databaseId?: string;
      schemaId?: string;
      tableId?: string;
    };
    push: (path: string) => void;
    location: Location;
  };
  openNavbar: () => void;
}

const CatalogTreeNode = React.forwardRef<HTMLDivElement, {
  item: ITreeNodeItem;
  isSelected: boolean;
  onSelect?: () => void;
  onToggleExpand: () => void;
  isExpanded: boolean;
  hasChildren: boolean;
}>(({ item, isSelected, onSelect, onToggleExpand, isExpanded}, ref) => {
  const iconName = item.icon 
    ? (typeof item.icon === "string" ? item.icon : item.icon.name)
    : "folder";

  const isDatabase = iconName === "database";
  const isTable = String(item.id).startsWith("table-");

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  const handleItemClick = () => {
    if (isDatabase) {
      onToggleExpand();
    }
    onSelect?.();
  };

  return (
    <TreeNodeWrapper
      onClick={handleItemClick}
      isSelected={isSelected}
      ref={ref}
      style={isTable ? { paddingLeft: 24 + 16 } : undefined}
    >
      {isDatabase && (
        <ChevronIcon 
          name="chevronright" 
          size={12} 
          isExpanded={isExpanded}
          onClick={handleChevronClick}
        />
      )}
      <Icon name={iconName as IconName} size={16} />
      <Text>{item.name}</Text>
    </TreeNodeWrapper>
  );
});

const CatalogSidebar = ({ router, openNavbar }: RouterProps) => {
  const { databaseId, schemaId, tableId } = router.params;
  const { data, isLoading, error } = useListDatabasesQuery({ include: "tables" });
  const databases = data?.data;

  const treeData: ITreeNodeItem[] = [
    ...(databases?.map((db: Database) => {
      
      return {
        id: `db-${db.id}`,
        name: db.name,
        icon: "database" as IconName,
        children: db.tables?.map(table => ({
          id: `table-${db.id}-${table.schema || "public"}-${table.id}`,
          name: table.name,
          icon: "table" as IconName
        })) || []
      };
    }) || []),
    {
      id: "metrics",
      name: t`Metrics`,
      icon: "metric" as IconName
    },
    {
      id: "models",
      name: t`Models`,
      icon: "model" as IconName
    }
  ];

  const handleSelect = useCallback((item: ITreeNodeItem) => {
    const [type, ...ids] = String(item.id).split("-");
    if (type === "db") {
      const dbId = ids[0];
      const db = databases?.find(d => d.id === parseInt(dbId));
      if (db) {
        router.push(`/catalog/databases/${dbId}-${slugg(db.name)}`);
      }
    } else if (type === "table") {
      const [dbId, schemaName, tableId] = ids;
      router.push(`/catalog/databases/${dbId}/schemas/${schemaName}/tables/${tableId}`);
    } else if (item.id === "metrics") {
      router.push("/browse/metrics");
    } else if (item.id === "models") {
      router.push("/browse/models");
    }
  }, [router, databases]);

  // Determine the selected ID based on the current route
  const selectedId = tableId 
    ? `table-${databaseId}-${schemaId}-${tableId}`
    : databaseId 
      ? `db-${databaseId}`
      : router.location.pathname.startsWith("/browse/metrics")
        ? "metrics"
        : router.location.pathname.startsWith("/browse/models")
          ? "models"
          : undefined;

  const handleHeaderClick = () => {
    openNavbar();
    router.push("/");
  };

  if (isLoading) {
    return (
      <CatalogSidebarRoot>
        <Box p="md">
          <Text size="lg" fw="bold" mb="md">{t`Catalog`}</Text>
          <Text>{t`Loading...`}</Text>
        </Box>
      </CatalogSidebarRoot>
    );
  }

  if (error) {
    return (
      <CatalogSidebarRoot>
        <Box p="md">
          <Text size="lg" fw="bold" mb="md">{t`Catalog`}</Text>
          <Text c="error">{t`Error loading catalog`}</Text>
        </Box>
      </CatalogSidebarRoot>
    );
  }

  return (
    <CatalogSidebarRoot>
      <Box p="md">
        <HeaderLink onClick={handleHeaderClick}>
          <Icon name="arrow_left" size={16} />
          <Text size="lg" fw="bold">{t`Catalog`}</Text>
        </HeaderLink>
        
        {/* Tree section */}
        {treeData.length > 0 ? (
          <Tree
            data={treeData}
            selectedId={selectedId}
            onSelect={handleSelect}
            TreeNode={CatalogTreeNode}
          />
        ) : (
          <Text c="text-medium">{t`No databases found`}</Text>
        )}
      </Box>
    </CatalogSidebarRoot>
  );
};

export default connect(null, { openNavbar })(withRouter(CatalogSidebar)); 