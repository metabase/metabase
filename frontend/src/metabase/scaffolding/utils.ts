import { getNextId } from "__support__/utils";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import {
  type OptionsType,
  formatUrl,
  formatValue,
} from "metabase/lib/formatting";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/visualizations/lib/settings/column";
import {
  isCurrency,
  isEntityName,
  isFK,
  isLocation,
  isNumeric,
  isPK,
  isTitle,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Field,
  ObjectViewSectionSettings,
  ObjectViewSettings,
  RowValue,
  SectionVariant,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

// Process remapping metadata similar to extractRemappedColumns in visualizations
export function processRemappedColumns(
  columns: DatasetColumn[],
  rows: RowValue[][],
) {
  const processedColumns: (DatasetColumn & { remapping?: Map<any, any> })[] =
    columns.map((col) => ({
      ...col,
      remapping: col.remapped_to != null ? new Map() : undefined,
    }));

  const processedRows = rows.map((row) =>
    row.filter((value, colIndex) => {
      const col = processedColumns[colIndex];
      if (col.remapped_from != null) {
        const remappedFromIndex = processedColumns.findIndex(
          (c) => c.name === col.remapped_from,
        );
        if (
          remappedFromIndex === -1 ||
          !processedColumns[remappedFromIndex] ||
          !processedColumns[remappedFromIndex].remapping
        ) {
          console.warn("Invalid remapped_from", col);
          return true;
        }
        processedColumns[remappedFromIndex].remapping?.set(
          row[remappedFromIndex],
          row[colIndex],
        );
        return false;
      } else {
        return true;
      }
    }),
  );

  return {
    columns: processedColumns.filter((col) => col.remapped_from == null),
    rows: processedRows,
  };
}

export function renderValue(
  tc: ContentTranslationFunction,
  value: RowValue,
  column: DatasetColumn,
  optionsOverride?: OptionsType,
) {
  const mockSeries = [{ data: { cols: [column] }, card: createMockCard() }];
  const settingDefs = getSettingDefinitionsForColumn(mockSeries, column);
  const inheritedSettings = {
    ...getGlobalSettingsForColumn(),
    ...(column.settings || {}),
  };
  const finalSettings = getComputedSettings(
    settingDefs,
    column,
    inheritedSettings,
    {
      series: mockSeries,
    },
  );

  const NO_VALUE = "-";

  if (value === undefined) {
    return NO_VALUE;
  }

  if (!column) {
    return String(value) || NO_VALUE;
  }

  if (column.settings?.view_as === "link") {
    return formatUrl(String(tc(value)), {
      ...column.settings,
      ...finalSettings,
      column,
      type: "cell",
      jsx: true,
      rich: true,
      remap: true,
      clicked: {
        type: "cell",
        value,
        column,
      },
    });
  }

  const formattedValue = formatValue(tc(value), {
    ...column.settings,
    ...finalSettings,
    column,
    type: "cell",
    jsx: true,
    rich: true,
    remap: true,
    ...optionsOverride,
  });

  return formattedValue != null && formattedValue !== ""
    ? formattedValue
    : NO_VALUE;
}

function notEmpty<T>(xs: T[]): T[] | null {
  if (xs && xs.length > 0) {
    return xs;
  } else {
    return null;
  }
}
function fieldsIfPresent(
  fieldsByName: Record<string, Field>,
  ...names: string[]
): Field[] | null {
  if (names.some((name) => !fieldsByName[name])) {
    return null;
  }
  return names.reduce((acc: Field[], name: string) => {
    acc.push(fieldsByName[name]);
    return acc;
  }, []);
}

function deleteFields(
  fieldsByName: Record<string, Field>,
  fields: Field[],
): void {
  fields.forEach((field) => {
    delete fieldsByName[field.name];
  });
}

function sectionFields(fields: Field[]): { field_id: number }[] {
  return fields.map((field) => ({
    field_id: getRawTableFieldId(field),
  }));
}

export function getDefaultObjectViewSettings(
  table: Table | undefined,
): ObjectViewSettings {
  const fields = table?.fields ?? [];

  const fieldsByName = fields.reduce<Record<string, Field>>((acc, field) => {
    acc[field.name] = field;
    return acc;
  }, {});

  const leftoverFields = JSON.parse(JSON.stringify(fieldsByName));

  const pkFields = fields.filter((f) => isPK(f));
  deleteFields(leftoverFields, pkFields);

  // Find things that look like part of a name.
  let nameFields: Field[] | null =
    notEmpty(fields.filter((f) => isEntityName(f))) ||
    fieldsIfPresent(fieldsByName, "name") ||
    fieldsIfPresent(fieldsByName, "title", "full_name") ||
    fieldsIfPresent(fieldsByName, "full_name") ||
    fieldsIfPresent(fieldsByName, "title", "first_name", "last_name") ||
    fieldsIfPresent(fieldsByName, "first_name", "last_name") ||
    // Or, failing that, a title.
    notEmpty(fields.filter((f) => isTitle(f))) ||
    fieldsIfPresent(fieldsByName, "title");

  // If there's only promising option, use that.
  if (!nameFields) {
    const nonPkFields = fields.filter((f) => !isPK(f));
    if (nonPkFields.length === 1) {
      nameFields = nonPkFields;
    } else {
      const stringFields = nonPkFields.filter(
        (f) => !isPK(f) && f.base_type === "type/Text",
      );
      if (stringFields.length === 1) {
        nameFields = stringFields;
      }
    }
  }

  // If there's only one kind of prefixed name, let's go with that.
  if (!nameFields) {
    const somethingNameFields = fields.filter((f) =>
      f.name.toLowerCase().endsWith("name"),
    );
    if (somethingNameFields.length === 1) {
      nameFields = somethingNameFields;
    }
  }
  deleteFields(leftoverFields, nameFields || []);

  // Is there any overlap between the primary key and the name fields?
  // This is O(n^2) so sue me.
  const pkInName = !nameFields
    ? false
    : pkFields.some((f) => nameFields.some((nf) => nf.name === f.name));

  const spaceToFitPkWithName =
    nameFields &&
    pkFields.length > 0 &&
    pkFields.length + nameFields.length <= 3;

  const uuidCouldBeKindaLong = pkFields.some(
    (f) =>
      f.database_type === "uuid" ||
      // Also probably a uuid or similarly long string
      (f.name === "id" && f.database_type === "text"),
  );

  const headerFields =
    !nameFields && !uuidCouldBeKindaLong
      ? pkFields
      : !pkInName && spaceToFitPkWithName && !uuidCouldBeKindaLong && nameFields
        ? [...pkFields, ...nameFields]
        : // it feels wrong to break these up, since they are explicitly grouped by their semantic labels
          // but, the layout assumes this limitation
          nameFields
          ? nameFields.slice(0, 3)
          : [];

  const sections: ObjectViewSectionSettings[] = [];

  sections.push({
    id: getNextId(),
    title: "Title",
    variant: "header",
    fields: sectionFields(headerFields),
  });

  const subtitleFields =
    // If we skipped the PK, now is it's time.
    nameFields &&
    !pkInName &&
    pkFields.length + nameFields.length > headerFields.length
      ? pkFields
      : fieldsIfPresent(leftoverFields, "subtitle") ||
        fieldsIfPresent(leftoverFields, "status") ||
        [];

  sections.push({
    id: getNextId(),
    title: "Subtitle",
    variant: "subheader",
    fields: sectionFields(subtitleFields),
  });

  function addPotentialSectionHelper(
    title: string,
    variant: SectionVariant,
    selectFieldsFn: (fields: Field[]) => Field[] | null,
  ): void {
    const fields = selectFieldsFn(Object.values(leftoverFields));
    if (fields && fields.length > 0) {
      deleteFields(leftoverFields, fields);
      sections.push({
        id: getNextId(),
        title: title,
        variant: variant,
        fields: sectionFields(fields),
      });
    }
  }

  // Check for fields grouped on a common prefix, treat them as their own sections.
  const remainingFields = Object.values(leftoverFields) as Field[];
  if (remainingFields.length > 0) {
    const groupedFields = remainingFields.reduce<Record<string, Field[]>>(
      (acc: Record<string, Field[]>, field: Field) => {
        let parts = field.name.split(/[_-]/);
        if (parts.length === 1) {
          // split parts by camelCase or PascalCase if no underscores or dashes
          parts = field.name
            .split(/(?<!(^|[A-Z]))(?=[A-Z])|(?<!^)(?=[A-Z][a-z])/)
            // this terrible regex i got off stack overflow leaves some empty matches :-)
            .filter((s) => s);
        }
        const prefixes = parts
          .slice(0, -1)
          .map((_part, index) => parts.slice(0, index + 1).join("_"))
          .reverse();

        // find the longest prefix which has multiple fields
        for (const prefix of prefixes) {
          if (acc[prefix]) {
            continue;
          }
          // stop words
          if (
            ["has", "is", "in", "latest", "current"].includes(
              prefix.toLowerCase(),
            )
          ) {
            continue;
          }
          const fields = remainingFields.filter(
            (f) =>
              f.name.startsWith(prefix) ||
              f.name.startsWith(prefix + "er") ||
              f.name.startsWith(prefix + "ed"),
          );
          if (fields.length > 1) {
            acc[prefix] = fields;
          }
        }
        return acc;
      },
      {},
    );

    Object.entries(groupedFields).forEach(([prefix, fields]) => {
      let title = prefix
        .split(/[_-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      if (title === "Cancel") {
        title = "Cancellation";
      }

      sections.push({
        id: getNextId(),
        title: title,
        variant: "normal",
        fields: sectionFields(fields),
      });
      deleteFields(leftoverFields, fields);
    });
  }

  addPotentialSectionHelper("Location", "normal", (fs) =>
    fs.filter(isLocation),
  );

  addPotentialSectionHelper("Financial", "normal", (fs) =>
    fs.filter(isCurrency),
  );

  addPotentialSectionHelper("Related entities", "normal", (fs) => {
    const fields = fs.filter((f) => isFK(f) || f.name.endsWith("_id"));
    return fields.length > 1 ? fields : [];
  });

  addPotentialSectionHelper("Metadata", "normal", (fs) =>
    fs.filter((f) => f.name === "created_at" || f.name === "updated_at"),
  );

  addPotentialSectionHelper("Highlights", "highlight-2", (fs) => {
    const numericRemainingFields = fs.filter((f) => isNumeric(f));
    if (
      numericRemainingFields.length >= 3 &&
      numericRemainingFields.length <= 9
    ) {
      return numericRemainingFields;
    } else {
      return [];
    }
  });

  // make sure the Highlights section comes first after the title and subtitle
  const highlightSectionIndex = sections.findIndex(
    (section) => section.title === "Highlights",
  );
  if (highlightSectionIndex !== -1 && highlightSectionIndex > 2) {
    const [highlightSection] = sections.splice(highlightSectionIndex, 1);
    sections.splice(2, 0, highlightSection);
  }

  // {
  //   id: getNextId(),
  //   title: "Data Highlight",
  //   variant: "highlight-1",
  //   fields: [],
  // },

  // {
  //   id: getNextId(),
  //   title: "Highlight level 2",
  //   variant: "highlight-2",
  //   fields: [],
  // },

  return { sections: sections };
}

export function getTableQuery(
  table: Table,
): StructuredDatasetQuery | undefined {
  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    type: "query",
  };
}

export function getObjectQuery(
  table: Table,
  objectId: string | number,
): StructuredDatasetQuery | undefined {
  const pk = (table.fields ?? []).find(isPK);

  if (!pk) {
    return getTableQuery(table);
  }

  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: [
        "=",
        [
          "field",
          getRawTableFieldId(pk),
          {
            "base-type": pk.base_type,
          },
        ],
        isNumeric(pk) && typeof objectId === "string"
          ? parseFloat(objectId)
          : objectId,
      ],
    },
    type: "query",
  };
}

export function getStyleProps(style: "bold" | "dim" | "title" | "normal") {
  switch (style) {
    case "bold":
      return { fw: 700 };
    case "dim":
      return { color: "text-light" };
    case "title":
      return { size: "xl", fw: 700 };
    default:
      return {};
  }
}
