import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";

import type { ObjectViewSectionSettings } from "metabase-types/api";

function generateId() {
  return new Date().getTime();
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
    position = "end",
  }: {
    position: "start" | "end";
  }) => {
    if (position === "end") {
      setSections([
        ...sections,
        {
          id: generateId(),
          title: "Section",
          direction: "horizontal",
          fields: [],
        },
      ]);
    } else {
      setSections([
        {
          id: generateId(),
          title: "Section",
          direction: "horizontal",
          fields: [],
        },
        ...sections,
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && String(active.id) !== String(over.id)) {
      setSections((sections) => {
        const oldIndex = sections.findIndex(
          (section) => String(section.id) === String(active.id),
        );
        const newIndex = sections.findIndex(
          (section) => String(section.id) === String(over.id),
        );

        return arrayMove(sections, oldIndex, newIndex);
      });
    }
  };

  return {
    sections,
    createSection,
    removeSection,
    updateSection,
    handleDragEnd,
  };
}
