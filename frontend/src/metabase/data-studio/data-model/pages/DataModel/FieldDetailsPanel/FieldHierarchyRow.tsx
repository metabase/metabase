import { t } from "ttag";

import { DetailsRow } from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import {
  type FieldHierarchyPlace,
  getFieldHierarchyPlaces,
  useTableHierarchies,
} from "metabase/metadata/hierarchies";
import { Stack, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

/**
 * PROTOTYPE: mocked. Where the field sits in the table's hierarchies, linking
 * to them. Nothing shows for a field that isn't in one.
 */
export function FieldHierarchyRow({
  field,
  table,
  hierarchiesHref,
}: {
  field: Field;
  table: Table;
  hierarchiesHref?: string;
}) {
  const { hierarchies } = useTableHierarchies(table);
  const places = getFieldHierarchyPlaces(hierarchies, field.id);
  if (places.length === 0) {
    return null;
  }

  const getFieldName = (fieldId: number) =>
    table.fields?.find(({ id }) => id === fieldId)?.display_name;

  const describe = (place: FieldHierarchyPlace) => {
    const { hierarchy } = place;
    if (place.type === "parent-key") {
      return t`${hierarchy.name} · parent key`;
    }
    const position = t`level ${place.levelIndex + 1} of ${hierarchy.levels.length}`;
    const parent = hierarchy.levels[place.levelIndex - 1];
    const parentName = parent && getFieldName(parent.fieldId);
    return parentName
      ? t`${hierarchy.name} · ${position}, under ${parentName}`
      : `${hierarchy.name} · ${position}`;
  };

  return (
    <DetailsRow
      label={t`Hierarchy`}
      value={
        <Stack gap="xxs">
          {places.map((place) =>
            hierarchiesHref ? (
              <Link
                key={place.hierarchy.id}
                to={hierarchiesHref}
                variant="brand"
              >
                {describe(place)}
              </Link>
            ) : (
              <Text key={place.hierarchy.id}>{describe(place)}</Text>
            ),
          )}
        </Stack>
      }
    />
  );
}
