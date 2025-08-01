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

  const createSection = () => {
    setSections([
      ...sections,
      {
        id: generateId(),
        title: "Section",
        direction: "horizontal",
        fields: [],
      },
    ]);
  };

  const removeSection = (id: number) => {
    setSections((sections) => sections.filter((section) => section.id !== id));
  };

  const updateSection = (
    id: number,
    update: Partial<ObjectViewSectionSettings>,
  ) => {
    setSections((sections) =>
      sections.map((s) => (s.id === id ? { ...s, ...update } : s)),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSections((sections) => {
        const oldIndex = sections.findIndex(
          (section) => section.id === active.id,
        );
        const newIndex = sections.findIndex(
          (section) => section.id === over.id,
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
