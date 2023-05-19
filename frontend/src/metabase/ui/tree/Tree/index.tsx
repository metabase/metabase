import React from "react";
import { List, Stack } from "@mantine/core";

export function TreeList({ form, selected, setSelected }) {
  return (
    <List listStyleType="none" withPadding>
      <TreeNode
        component={form}
        selected={selected}
        setSelected={setSelected}
      />
    </List>
  );
}

function TreeNode({ component, selected, setSelected }) {
  function onSelect(e) {
    e.stopPropagation();
    setSelected(component);
  }

  return (
    <List.Item onClick={onSelect}>
      <Stack style={{ backgroundColor: component === selected && "#4dabf733" }}>
        {component.name}
      </Stack>
      <List
        listStyleType="none"
        withPadding
        style={{ borderLeft: "2px solid #ddd" }}
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
    </List.Item>
  );
}
