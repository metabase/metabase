import React, { useState } from "react";
import { List, Stack } from "@mantine/core";
import { Button } from "@ui/buttons/Button";

export function TreeList({ form, selected, setSelected }) {
  return (
    <List listStyleType="none" withPadding>
      {form.map((component, i) => (
        <TreeNode
          component={component}
          key={i}
          selected={selected}
          setSelected={setSelected}
        />
      ))}
    </List>
  );
}

function TreeNode({ component, selected, setSelected }) {
  function onSelect(e) {
    e.stopPropagation();
    setSelected(component);
  }

  const [isOpened, setIsOpened] = useState(false);

  return (
    <List.Item onClick={onSelect}>
      <Stack>
        <Button
          mr="sm"
          variant={selected?.id === component?.id ? "light" : "subtle"}
          onClick={() => setIsOpened(!isOpened)}
          leftIcon={component.children?.length > 0 && isOpened ? "chevron-down" : "chevron-right"}
        >
          {component.name}
        </Button>
      </Stack>
      {isOpened && (
        <List
          listStyleType="none"
          withPadding
        >
          {component.children?.map((child, i) => (
            <TreeNode
              component={child}
              key={i}
              selected={selected}
              setSelected={setSelected}
            />
          ))}
        </List>
      )}
    </List.Item>
  );
}
