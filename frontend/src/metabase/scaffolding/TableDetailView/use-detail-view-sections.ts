import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import { t } from "ttag";

import type { ObjectViewSectionSettings } from "metabase-types/api";

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
) {
  const [sections, setSections] = useState(initialSections);

  // Reset sections when initialSections changes after mutation
  useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

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
    setSections((sections) =>
      sections.filter((section) => String(section.id) !== String(id)),
    );
  };

  const updateSection = (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => {
    setSections((sections) =>
      sections.map((s) =>
        String(s.id) === String(id) ? { ...s, ...update } : s,
      ),
    );
  };

  return {
    sections,
    createSection,
    removeSection,
    updateSection,
    updateSections: setSections,
    // handleDragEnd,
  };
}
