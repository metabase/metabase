import type { ReactNode } from "react";
import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { useNumberFormatter } from "metabase/common/hooks/use-number-formatter";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Code } from "metabase/ui";
import { dependencyGraph } from "metabase/urls/dependencies";
import { isNullOrUndefined } from "metabase/utils/types";
import type { Table } from "metabase-types/api";

import { DetailsEditableText } from "../../DetailPanel";

interface Props {
  table: Table;
  readOnly: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
}

export function TableMetadata({
  table,
  readOnly,
  onNameChange,
  onDescriptionChange,
}: Props) {
  const formatNumber = useNumberFormatter();
  const isDependenciesEnabled = PLUGIN_DEPENDENCIES.isEnabled;

  const { dependenciesCount, dependentsCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({
      id: Number(table.id),
      type: "table",
    });

  const handleNameChange = (value: string) => {
    const name = value.trim();
    if (name.length > 0 && name !== table.display_name) {
      onNameChange(name);
    }
  };

  const handleDescriptionChange = (value: string) => {
    const description = value.trim();
    if (description !== (table.description ?? "")) {
      onDescriptionChange(description);
    }
  };

  return (
    <SidebarSection title={t`Metadata`}>
      <DetailsTable>
        <DetailsRow
          label={t`Display name`}
          value={
            <DetailsEditableText
              initialValue={table.display_name}
              placeholder={t`Give this table a name`}
              maxLength={254}
              isDisabled={readOnly}
              fw="bold"
              onChange={handleNameChange}
              data-testid="table-display-name-input"
            />
          }
        />
        <DetailsRow label={t`Raw name`} value={<Code>{table.name}</Code>} />
        <DetailsRow
          label={t`Description`}
          value={
            <DetailsEditableText
              initialValue={table.description}
              placeholder={t`No description`}
              isMultiline
              isOptional
              isDisabled={readOnly}
              onChange={handleDescriptionChange}
              data-testid="table-description-input"
            />
          }
        />
        <DetailsRow
          label={t`Last updated at`}
          value={<DateTime value={table.updated_at} />}
        />
        <DetailsRow
          label={t`View count`}
          value={formatNumber(table.view_count)}
        />
        {!isNullOrUndefined(table.estimated_row_count) && (
          <DetailsRow
            label={t`Est. row count`}
            value={formatNumber(table.estimated_row_count)}
          />
        )}
        {isDependenciesEnabled && (
          <DetailsRow
            label={t`Dependencies`}
            value={
              <DependencyLink tableId={Number(table.id)}>
                {dependenciesCount}
              </DependencyLink>
            }
          />
        )}
        {isDependenciesEnabled && (
          <DetailsRow
            label={t`Dependents`}
            value={
              <DependencyLink tableId={Number(table.id)}>
                {dependentsCount}
              </DependencyLink>
            }
          />
        )}
      </DetailsTable>
    </SidebarSection>
  );
}

function DependencyLink({
  children,
  tableId,
}: {
  children: ReactNode;
  tableId: number;
}) {
  return (
    <Link
      to={dependencyGraph({
        entry: { id: tableId, type: "table" },
      })}
      variant="brandBold"
    >
      {children}
    </Link>
  );
}
