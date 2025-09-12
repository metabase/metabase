import { useLocalStorage } from "@mantine/hooks";

import { uuid } from "metabase/lib/uuid";

export type GlossaryDefinition = {
  id: string;
  term: string;
  definition: string;
};

export function useMockedGlossary() {
  const [mockedGlossary, setMockedGlossary] = useLocalStorage<
    GlossaryDefinition[]
  >({
    key: "mocked-glossary",
    defaultValue: [],
  });

  return {
    mockedGlossary,
    addDefinition: (term: string, definition: string) => {
      setMockedGlossary([...mockedGlossary, { id: uuid(), term, definition }]);
    },
    updateDefinition: (id: string, newTerm: string, newDefinition: string) => {
      setMockedGlossary(
        mockedGlossary.map((definition) =>
          definition.id === id
            ? { ...definition, term: newTerm, definition: newDefinition }
            : definition,
        ),
      );
    },
    deleteDefinition: (id: string) => {
      setMockedGlossary(
        mockedGlossary.filter((definition) => definition.id !== id),
      );
    },
  };
}
