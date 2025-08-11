import { useEffect, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { ObjectViewSectionSettings, Table } from "metabase-types/api";

export const UNCATEGORIZED_SECTION_ID = -1;

function generateId() {
  return new Date().getTime();
}

function getSectionName(sections: ObjectViewSectionSettings[]) {
  let nextName = t`Group`;
  let nextId = 1;
  let isUsed = sections.find((s) => s.title === nextName);

  while (isUsed) {
    ++nextId;
    nextName = t`Group ${nextId}`;
    isUsed = sections.find((s) => s.title === nextName);
  }

  return nextName;
}

export function useDetailViewSections(
  initialSections: ObjectViewSectionSettings[],
  table: Table,
) {
  const [sections, setSections] = useState(
    getInitialSections(initialSections, table),
  );
  const uncategorizedSectionRef = useLatest(
    sections.find((s) => s.id === UNCATEGORIZED_SECTION_ID),
  );

  // Reset sections when initialSections changes after mutation
  useEffect(() => {
    const uncategorizedSection = uncategorizedSectionRef.current;
    setSections(
      getInitialSections(initialSections, table, uncategorizedSection),
    );
  }, [initialSections, table, uncategorizedSectionRef]);

  const createSection = ({
    position = "start",
  }: {
    position?: "start" | "end";
  } = {}) => {
    const title = getSectionName(sections);

    if (position === "end") {
      setSections([
        ...sections,
        {
          id: generateId(),
          title,
          variant: "normal",
          fields: [],
        },
      ]);
    } else {
      setSections([
        ...sections.filter(
          (s) =>
            s.variant === "header" ||
            s.variant === "subheader" ||
            s.variant === "highlight-1",
        ),
        {
          id: generateId(),
          title,
          variant: "normal",
          fields: [],
        },
        ...sections.filter(
          (s) =>
            s.variant !== "header" &&
            s.variant !== "subheader" &&
            s.variant !== "highlight-1",
        ),
      ]);
    }
  };

  const removeSection = (id: number) => {
    setSections((sections) => {
      const sectionToRemove = sections.find(
        (section) => String(section.id) === String(id),
      );
      const filteredSections = sections.filter(
        (section) => String(section.id) !== String(id),
      );

      // If we're removing a section with fields, add them to the uncategorized section
      if (sectionToRemove?.fields && sectionToRemove.fields.length > 0) {
        const uncategorizedSection = filteredSections.find(
          (s) => s.id === UNCATEGORIZED_SECTION_ID,
        );
        if (uncategorizedSection) {
          const updatedUncategorizedSection = {
            ...uncategorizedSection,
            fields: [...uncategorizedSection.fields, ...sectionToRemove.fields],
          };
          return filteredSections.map((s) =>
            s.id === UNCATEGORIZED_SECTION_ID ? updatedUncategorizedSection : s,
          );
        }
      }

      return filteredSections;
    });
  };

  const updateSection = (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => {
    setSections((sections) => {
      const sectionToUpdate = sections.find((s) => String(s.id) === String(id));

      // If we're updating fields and removing some, add them to uncategorized section
      if (update.fields && sectionToUpdate) {
        const removedFields = sectionToUpdate.fields.filter(
          (field) => !update.fields!.some((f) => f.field_id === field.field_id),
        );

        if (removedFields.length > 0) {
          const uncategorizedSection = sections.find(
            (s) => s.id === UNCATEGORIZED_SECTION_ID,
          );
          if (uncategorizedSection) {
            const updatedUncategorizedSection = {
              ...uncategorizedSection,
              fields: [...uncategorizedSection.fields, ...removedFields],
            };
            return sections.map((s) => {
              if (String(s.id) === String(id)) {
                return { ...s, ...update };
              }
              if (s.id === UNCATEGORIZED_SECTION_ID) {
                return updatedUncategorizedSection;
              }
              return s;
            });
          }
        }
      }

      return sections.map((s) =>
        String(s.id) === String(id) ? { ...s, ...update } : s,
      );
    });
  };

  return {
    sections,
    createSection,
    removeSection,
    updateSection,
    updateSections: setSections,
  };
}

function getUncategorizedFields(
  sections: ObjectViewSectionSettings[],
  table: Table,
) {
  const notEmptySections = sections.filter(
    (section) => section.fields.length > 0,
  );
  const fieldsInSections = notEmptySections.flatMap((s) => s.fields);
  const fieldsInSectionsIds = fieldsInSections.map((f) => f.field_id);
  const fields = table?.fields ?? [];
  const fieldIds = fields.map(getRawTableFieldId);

  const uncategorizedFields = fieldIds
    .filter((id: number) => !fieldsInSectionsIds.includes(id))
    .map((field_id: number) => ({ field_id }));

  return uncategorizedFields;
}

function createUncategorizedSection(
  sections: ObjectViewSectionSettings[],
  table: Table,
) {
  return {
    id: UNCATEGORIZED_SECTION_ID,
    title: "",
    variant: "normal" as const,
    fields: getUncategorizedFields(sections, table),
  };
}

function getInitialSections(
  sections: ObjectViewSectionSettings[],
  table: Table,
  uncategorizedSection?: ObjectViewSectionSettings,
) {
  const newUncategorizedSection = createUncategorizedSection(sections, table);

  // If we have an existing uncategorized section, preserve the field order
  if (uncategorizedSection) {
    const existingFieldIds = uncategorizedSection.fields.map((f) => f.field_id);
    const newFieldIds = newUncategorizedSection.fields.map((f) => f.field_id);

    // Create a map of field_id to field object for quick lookup
    const fieldMap = new Map(
      newUncategorizedSection.fields.map((field) => [field.field_id, field]),
    );

    // Preserve order from existing uncategorized section
    const preservedFields = existingFieldIds
      .filter((id) => newFieldIds.includes(id)) // Only include fields that are still uncategorized
      .map((id) => fieldMap.get(id)!);

    // Add any new fields that weren't in the original uncategorized section
    const newFields = newUncategorizedSection.fields.filter(
      (field) => !existingFieldIds.includes(field.field_id),
    );

    newUncategorizedSection.fields = [...preservedFields, ...newFields];
  }

  return [...sections, newUncategorizedSection];
}

export function getFieldsLimit(
  section: ObjectViewSectionSettings,
): number | undefined {
  if (section.variant === "header") {
    return 3;
  }

  if (section.variant === "subheader") {
    return 4;
  }

  return undefined;
}
