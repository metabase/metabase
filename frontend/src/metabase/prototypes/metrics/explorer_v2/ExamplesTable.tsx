import { useState } from "react";

import { Button, Icon, Popover } from "metabase/ui";

import S from "./ExamplesTable.module.css";
import { EXAMPLES } from "./examples";

/** The example metrics behind one button: a table of what each one shows. */
export function ExamplesTable({
  activeId,
  onSelect,
}: {
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [isOpened, setIsOpened] = useState(false);
  const active = EXAMPLES.find((example) => example.id === activeId);

  const handleSelect = (id: string) => {
    setIsOpened(false);
    onSelect(id);
  };

  return (
    <Popover
      opened={isOpened}
      onChange={setIsOpened}
      position="bottom-start"
      shadow="md"
    >
      <Popover.Target>
        <Button
          size="sm"
          rightSection={<Icon name="chevrondown" />}
          onClick={() => setIsOpened((wasOpened) => !wasOpened)}
        >
          {active ? `Example: ${active.name}` : "Examples"}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="md" maw="44rem">
        <table className={S.table}>
          <thead>
            <tr>
              <th>Example</th>
              <th>What it shows</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((example) => (
              <tr key={example.id}>
                <td>
                  <Button
                    size="sm"
                    variant={example.id === activeId ? "filled" : "default"}
                    onClick={() => handleSelect(example.id)}
                  >
                    {example.name}
                  </Button>
                </td>
                <td>{example.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Popover.Dropdown>
    </Popover>
  );
}
